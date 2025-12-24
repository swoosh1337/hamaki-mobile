# Database Schema

This document describes the Supabase database schema for the Hamaki mobile app.

---

## Table Overview

| Table | Purpose | Modified By |
|-------|---------|-------------|
| `users` | Core user profile and XP | Services, Edge Functions |
| `youtube_channel_state` | Latest videos per channel | `sync-youtube-videos` Edge Function |
| `youtube_subscription_verifications` | Per-user subscription verification | `verify-subscriptions` Edge Function |
| `posts` | Community posts (ideas) | Mobile app |
| `post_upvotes` | Upvotes on posts | Mobile app |
| `leaderboard_entries` | Weekly/all-time leaderboards | Services, Edge Functions |
| `monthly_winners` | Monthly top 3 | Admin/cron |
| `content_posts` | CMS content (videos, blogs) | Admin panel |
| `sponsors` / `sponsor_prizes` | Sponsor info | Admin panel |
| `analytics_events` | App analytics | Mobile app |

---

## Core Tables

### `users`

Central user profile table.

```sql
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL UNIQUE,
    full_name TEXT NOT NULL,
    google_id TEXT NOT NULL UNIQUE,
    avatar_url TEXT,
    avatar_selection VARCHAR DEFAULT 'avatar-1',
    
    -- XP System
    xp_points INTEGER DEFAULT 0,
    
    -- YouTube Subscription XP (per channel, NEVER reset)
    subscription_xp_awarded JSONB DEFAULT '{"koro":false,"miro":false,"bastos":false,"hamaki":false}',
    
    -- Video Like XP (per video ID)
    video_like_xp_awarded JSONB DEFAULT '{}',
    
    -- Subscription status flags
    youtube_subscribed BOOLEAN DEFAULT false,
    miro_channel_subscribed BOOLEAN DEFAULT false,
    bastos_channel_subscribed BOOLEAN DEFAULT false,
    koro_channel_subscribed BOOLEAN DEFAULT false,
    subscriptions_verified_at TIMESTAMPTZ,
    
    -- Game cooldowns
    game_last_played JSONB DEFAULT '{}',
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);
```

**XP Tracking:**

```json
// subscription_xp_awarded - per CHANNEL (gate model)
{
    "hamaki": true,   // XP claimed - NEVER reset
    "miro": false,    // Not yet verified
    "bastos": true,
    "koro": false
}

// video_like_xp_awarded - per VIDEO ID (signal model)
{
    "video123": true,  // XP for this specific video
    "video456": true
}
```

---

### `youtube_channel_state`

Server-synced latest videos per channel.

```sql
CREATE TABLE youtube_channel_state (
    channel_id TEXT PRIMARY KEY,
    channel_key TEXT NOT NULL UNIQUE,  -- 'hamaki', 'miro', etc.
    channel_name TEXT NOT NULL,
    
    -- Latest video data (synced by Edge Function)
    latest_video_id TEXT,
    latest_video_title TEXT,
    latest_video_thumbnail TEXT,
    latest_video_published_at TIMESTAMPTZ,
    
    -- Sync metadata
    last_checked_at TIMESTAMPTZ DEFAULT now(),
    created_at TIMESTAMPTZ DEFAULT now()
);
```

**Populated By:** `sync-youtube-videos` Edge Function (cron every 4h)

**Read By:** Mobile app (via `channelStateService`)

---

### `youtube_subscription_verifications`

Per-user subscription verification state.

```sql
CREATE TABLE youtube_subscription_verifications (
    user_id UUID REFERENCES users(id),
    channel_id TEXT NOT NULL,
    channel_key TEXT NOT NULL,
    
    subscribed BOOLEAN NOT NULL DEFAULT false,
    xp_awarded BOOLEAN NOT NULL DEFAULT false,
    
    verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    
    PRIMARY KEY (user_id, channel_id),
    
    -- Constraint: Cannot award XP if not subscribed
    CONSTRAINT valid_xp_state CHECK (
        (subscribed = false AND xp_awarded = false) OR (subscribed = true)
    )
);
```

**Populated By:** `verify-subscriptions` Edge Function

**Purpose:** Implements "gate model" - verified once, never auto-rechecked

---

### `posts`

Community posts (ideas feature).

```sql
CREATE TABLE posts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    
    title VARCHAR NOT NULL CHECK (char_length(title) >= 5),
    content TEXT NOT NULL CHECK (char_length(content) >= 10 AND char_length(content) <= 1000),
    category VARCHAR,
    
    upvotes INTEGER DEFAULT 0,
    
    -- Moderation
    status VARCHAR DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    approved_at TIMESTAMPTZ,
    approved_by UUID REFERENCES users(id),
    
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);
```

---

### `leaderboard_entries`

Weekly and all-time leaderboards.

```sql
CREATE TABLE leaderboard_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    
    points INTEGER DEFAULT 0,
    period_type TEXT NOT NULL CHECK (period_type IN ('weekly', 'all_time')),
    week_start_date DATE,  -- NULL for all_time
    
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);
```

**Updated By:** `leaderboardService` when XP is awarded

---

## Data Flow Diagrams

### XP Award Flow

```
User presses "Verify" button
          │
          ▼
┌─────────────────────────────────┐
│  Mobile App calls Edge Function  │
│  (verify-subscriptions or        │
│   verify-video-likes)            │
└────────────────┬────────────────┘
                 │
                 ▼
┌─────────────────────────────────┐
│  Edge Function:                  │
│  1. Check existing state in DB   │
│  2. Call YouTube API if needed   │
│  3. Award XP to users table      │
│  4. Update verification table    │
└────────────────┬────────────────┘
                 │
                 ▼
┌─────────────────────────────────┐
│  Tables Updated:                 │
│  - users.xp_points              │
│  - users.subscription_xp_awarded│
│  - youtube_subscription_verif.  │
│  - leaderboard_entries          │
└─────────────────────────────────┘
```

### Video Sync Flow

```
Cron Job (every 4 hours)
          │
          ▼
┌─────────────────────────────────┐
│  sync-youtube-videos            │
│  Edge Function                   │
│  1. Call YouTube search.list     │
│  2. Compare with youtube_channel_│
│     state.latest_video_id        │
│  3. Upsert if new video          │
└────────────────┬────────────────┘
                 │
                 ▼
┌─────────────────────────────────┐
│  youtube_channel_state updated   │
│  - latest_video_id              │
│  - latest_video_title           │
│  - last_checked_at              │
└─────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────┐
│  Mobile app reads on next       │
│  foreground via channelState-   │
│  Service.getAll()               │
└─────────────────────────────────┘
```

---

## Row Level Security (RLS)

### `users`
- SELECT: Authenticated users can read all profiles
- UPDATE: Users can only update their own row

### `youtube_channel_state`
- SELECT: Authenticated users can read
- ALL: Service role only (for Edge Functions)

### `youtube_subscription_verifications`
- SELECT: Users can read their own verifications
- ALL: Service role only

### `posts`
- SELECT: Authenticated users can read approved posts
- INSERT: Authenticated users can insert
- UPDATE/DELETE: Own posts or admin

---

## Indexes

```sql
-- youtube_channel_state
CREATE INDEX idx_youtube_channel_state_published
    ON youtube_channel_state(latest_video_published_at);

-- youtube_subscription_verifications
CREATE INDEX idx_subscription_verifications_user
    ON youtube_subscription_verifications(user_id);
CREATE INDEX idx_subscription_verifications_channel_key
    ON youtube_subscription_verifications(channel_key);

-- leaderboard_entries
CREATE INDEX idx_leaderboard_user_period
    ON leaderboard_entries(user_id, period_type);
CREATE INDEX idx_leaderboard_week
    ON leaderboard_entries(week_start_date) WHERE period_type = 'weekly';
```

---

## Migrations

Located in `supabase/migrations/`:

| Migration | Purpose |
|-----------|---------|
| `..._recreate_youtube_channel_state.sql` | YouTube channel state table |
| `..._create_subscription_verifications.sql` | Subscription verification table |

Apply migrations:
```bash
supabase db push
```

---

*Last Updated: December 2024*
