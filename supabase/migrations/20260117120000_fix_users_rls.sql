-- ============================================================================
-- Fix Users Table RLS (Row Level Security)
-- ============================================================================
-- CRITICAL SECURITY FIX: Enable RLS on users table to prevent data leakage
--
-- Before: Any authenticated user could read all users' data
-- After: Users can only read/update their own data, admins can read all
-- ============================================================================

-- Step 1: Add is_admin column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'users'
        AND column_name = 'is_admin'
    ) THEN
        ALTER TABLE public.users ADD COLUMN is_admin BOOLEAN DEFAULT FALSE;
        COMMENT ON COLUMN public.users.is_admin IS 'Admin flag - admins can see all user data in admin dashboard';
    END IF;
END $$;

-- Step 2: Enable RLS on users table
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Step 3: Drop existing policies if any (clean slate)
DROP POLICY IF EXISTS "Users can read own data" ON public.users;
DROP POLICY IF EXISTS "Users can update own data" ON public.users;
DROP POLICY IF EXISTS "Admins can read all users" ON public.users;
DROP POLICY IF EXISTS "Service role full access" ON public.users;

-- Step 4: Create RLS policies

-- Policy: Users can read their own data
CREATE POLICY "Users can read own data"
    ON public.users FOR SELECT TO authenticated
    USING (auth.uid() = id);

-- Policy: Users can update their own data
CREATE POLICY "Users can update own data"
    ON public.users FOR UPDATE TO authenticated
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

-- Policy: Admins can read all user data (for admin dashboard)
-- This checks if the current user has is_admin = true
CREATE POLICY "Admins can read all users"
    ON public.users FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.users admin_user
            WHERE admin_user.id = auth.uid()
            AND admin_user.is_admin = true
        )
    );

-- Policy: Service role has full access (for Edge Functions & leaderboard)
CREATE POLICY "Service role full access"
    ON public.users FOR ALL TO service_role
    USING (true) WITH CHECK (true);

-- Step 5: Grant permissions
GRANT SELECT ON public.users TO authenticated;
GRANT UPDATE ON public.users TO authenticated;
GRANT ALL ON public.users TO service_role;

-- Step 6: Create index for admin lookups (performance optimization)
CREATE INDEX IF NOT EXISTS idx_users_is_admin ON public.users(is_admin) WHERE is_admin = true;

-- ============================================================================
-- IMPORTANT: After running this migration, you need to set is_admin = true
-- for your admin users. Run this in Supabase SQL Editor:
--
-- UPDATE public.users SET is_admin = true WHERE email = 'your-admin@email.com';
-- ============================================================================

COMMENT ON TABLE public.users IS 'User profiles with RLS enabled. Regular users can only see their own data, admins can see all.';
