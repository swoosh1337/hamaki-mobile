# Supabase Integration

This document explains how Hamaki integrates with Supabase for user management, XP tracking, and the leaderboard. You’ll learn about the client setup, database schema, key operations, security rules, and best practices.

## 1. Client Configuration

- File: `utils/supabase.ts`  
- Initialize Supabase client with environment variables:
  ```ts
  import { createClient } from '@supabase/supabase-js';

  const SUPABASE_URL = process.env.SUPABASE_URL!;
  const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY!;

  export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  ```
- Ensure your Expo/EAS build has these variables set securely (e.g. via `eas.json` secrets).

## 2. Database Schema

### Users Table
- Columns:
  - `id` (UUID, primary key)
  - `email` (text)
  - `name` (text)
  - `avatar_url` (text)
  - `youtube_id` (text, unique)
  - `created_at` (timestamp)

### XP Table
- Columns:
  - `id` (UUID, primary key)
  - `user_id` (UUID, foreign key → users.id)
  - `points` (integer)
  - `reason` (text)
  - `timestamp` (timestamp)

### Leaderboard View (or materialized view)
- Aggregates total XP per user:
  ```sql
  CREATE VIEW leaderboard AS
    SELECT u.id, u.name, u.avatar_url, SUM(x.points) AS total_xp
    FROM users u
    JOIN xp x ON x.user_id = u.id
    GROUP BY u.id;
  ```

## 3. Upserting & Fetching User Profiles

- **On First Login** (after YouTube subscription verification):
  ```ts
  await supabase
    .from('users')
    .upsert({
      id: authUser.id,
      email: authUser.email,
      name: authUser.name,
      avatar_url: authUser.photoUrl,
      youtube_id: authUser.youtubeId,
    });
  ```
- **Fetch Current User**:
  ```ts
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', sessionUser.id)
    .single();
  ```

## 4. XP Management

- **Adding XP**:
  ```ts
  await supabase
    .from('xp')
    .insert([{ user_id: userId, points: 10, reason: 'watched video', timestamp: new Date() }]);
  ```
- **Retrieving XP Total**:
  ```ts
  const { data } = await supabase
    .from('xp')
    .select('points', { count: 'estimated' })
    .eq('user_id', userId);
  const totalXp = data?.reduce((sum, x) => sum + x.points, 0) ?? 0;
  ```

## 5. Leaderboard Query

- **Top Users by XP**:
  ```ts
  const { data: leaderboard } = await supabase
    .from('leaderboard')
    .select('*')
    .order('total_xp', { ascending: false })
    .limit(10);
  ```

## 6. Row Level Security (RLS)

- **Enable RLS** on tables in Supabase dashboard.
- **Users Table Policy**:
  ```sql
  CREATE POLICY "User can select own profile"
    ON users FOR SELECT USING (auth.uid() = id);
  ```
- **XP Table Policy**:
  ```sql
  CREATE POLICY "User can read own xp"
    ON xp FOR SELECT USING (auth.uid() = user_id);

  CREATE POLICY "User can insert own xp"
    ON xp FOR INSERT WITH CHECK (auth.uid() = user_id);
  ```
- **Leaderboard View**:  
  Typically open to all authenticated users (no RLS).

## 7. React Context & Hooks

- AuthContext syncs Supabase session on login:
  ```ts
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        syncUserProfile(session.user);
      }
    });
  }, []);
  ```
- Custom hooks for fetching/updating XP and leaderboard encapsulate Supabase calls and handle loading/error states.

## 8. Best Practices

1. **Secure Keys**: Don’t check anon keys into source control; use environment variables.
2. **Error Handling**: Always check `error` from Supabase responses and surface user-friendly messages.
3. **Batch Inserts**: When awarding multiple XP points at once, batch them in a single insert.
4. **Pagination & Limits**: Use appropriate limits on list queries to keep mobile performance smooth.
5. **Migrations**: Store DB schema changes as SQL migration files under `supabase/migrations`.

---

With this setup, Hamaki leverages Supabase to manage user identities, gamification data, and real-time leaderboards—while ensuring security through RLS and clean client-side abstractions.