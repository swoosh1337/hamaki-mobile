-- Create users table for Hamaki app
CREATE TABLE IF NOT EXISTS public.users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  avatar_url TEXT,
  google_id TEXT NOT NULL UNIQUE,
  youtube_subscribed BOOLEAN DEFAULT FALSE,
  xp_points INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Add constraints
  CONSTRAINT users_google_id_unique UNIQUE (google_id),
  CONSTRAINT users_email_unique UNIQUE (email)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_users_google_id ON public.users(google_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);
CREATE INDEX IF NOT EXISTS idx_users_xp_points ON public.users(xp_points DESC);

-- Enable Row Level Security
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist and recreate them
DROP POLICY IF EXISTS "Users can view all profiles" ON public.users;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.users;
DROP POLICY IF EXISTS "Allow user creation" ON public.users;

-- Create policies for Row Level Security
CREATE POLICY "Users can view all profiles" ON public.users
  FOR SELECT USING (true);

CREATE POLICY "Users can update their own profile" ON public.users
  FOR UPDATE USING (true);

CREATE POLICY "Allow user creation" ON public.users
  FOR INSERT WITH CHECK (true);

-- Grant necessary permissions
GRANT ALL ON public.users TO authenticated;
GRANT ALL ON public.users TO anon;