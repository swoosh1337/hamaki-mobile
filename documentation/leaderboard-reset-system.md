# Leaderboard Season Reset System

## Overview

The **Leaderboard Season Reset System** is an automated monthly competition system that exports current leaderboard standings, uploads them to storage for historical tracking, and resets competitive XP while preserving permanent rewards. This creates fair monthly competitions while maintaining long-term player progression.

## Problem It Solves

### Before
- **Unfair Competition**: New users had no chance against established players with thousands of XP
- **No Historical Records**: Past leaderboard states were lost forever
- **Stale Competition**: Same players always at top, reducing engagement
- **Manual Process**: Required admin intervention to reset leaderboards

### After
- **Fair Monthly Competitions**: Everyone starts fresh each month for game XP
- **Historical Tracking**: Complete CSV exports of every month's leaderboard
- **Permanent Progress**: Subscription and video like XP never resets
- **Fully Automated**: Runs automatically on the 1st of every month

---

## Architecture

### System Components

```
┌─────────────────────────────────────────────────────────────┐
│                     Cron Job (pg_cron)                      │
│              Triggers: 1st of month at 00:00 UTC            │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│            Edge Function: monthly-leaderboard-reset         │
│                                                              │
│  1. Check for existing export (idempotency)                 │
│  2. Query current leaderboard with rankings                 │
│  3. Generate CSV with all XP breakdowns                     │
│  4. Calculate SHA-256 checksum for integrity                │
│  5. Upload CSV to Supabase Storage                          │
│  6. Record metadata in leaderboard_exports table            │
│  7. Reset ONLY game_xp to 0                                 │
│  8. Mark reset as completed                                 │
└──────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                    Database Tables                          │
│                                                              │
│  • leaderboard_entries (XP tracking)                        │
│    - game_xp (RESETS monthly)                               │
│    - subscription_xp (PERMANENT)                            │
│    - video_like_xp (PERMANENT)                              │
│    - total_xp (auto-computed)                               │
│                                                              │
│  • leaderboard_exports (audit trail)                        │
│    - Export metadata, checksums, timestamps                 │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                  Supabase Storage                          │
│           Bucket: leaderboard-exports/monthly/              │
│                                                              │
│  • 2025-01.csv                                              │
│  • 2025-02.csv                                              │
│  • 2025-03.csv                                              │
│  • ...                                                      │
└─────────────────────────────────────────────────────────────┘
```

---

## How It Works

### XP Source Separation

| XP Type | Source | Resets? | Purpose |
|---------|--------|---------|---------|
| **Game XP** | Playing games | ✅ Yes (Monthly) | Fair competition |
| **Subscription XP** | YouTube subscriptions | ❌ Never | Permanent loyalty |
| **Video Like XP** | Liking videos | ❌ Never | Permanent engagement |
| **Total XP** | Sum of all three | Auto-computed | Overall ranking |

### Monthly Reset Flow

**Every 1st of month at midnight UTC:**

1. **Cron triggers Edge Function** with current month
2. **Edge Function checks** if export already exists
3. **If not exists**: Query leaderboard → Generate CSV → Upload → Reset game XP
4. **If exists**: Return "already completed" (idempotency)

### Example Before & After

**Before Reset (Dec 31st):**
- Alice: 5000 game + 3000 sub + 1000 like = **9000 total**
- Bob: 4500 game + 2000 sub + 500 like = **7000 total**

**CSV saved**: `leaderboard-exports/monthly/2024-12.csv`

**After Reset (Jan 1st):**
- Alice: **0 game** + 3000 sub + 1000 like = **4000 total** 
- Bob: **0 game** + 2000 sub + 500 like = **2500 total**

✅ Fair competition starts fresh while rewarding long-term loyalty!

---

## Configuration

### Cron Job
- **Schedule**: `0 0 1 * *` (Midnight UTC on 1st of month)
- **Managed by**: pg_cron extension
- **Calls**: Edge Function `monthly-leaderboard-reset`

### Edge Function
- **Name**: `monthly-leaderboard-reset`
- **URL**: `https://hspaxdszcnrznqehblky.supabase.co/functions/v1/monthly-leaderboard-reset`
- **Auth**: Service role key (server-side only)

### Storage
- **Bucket**: `leaderboard-exports`
- **Path**: `monthly/{YYYY-MM}.csv`
- **Privacy**: Private

---

## API Reference

### Edge Function Request

```bash
POST /functions/v1/monthly-leaderboard-reset

# Headers
Authorization: Bearer {SERVICE_ROLE_KEY}
Content-Type: application/json

# Body
{
  "period_key": "2025-12",  # Required: YYYY-MM format
  "dry_run": false          # Optional: true for testing
}
```

### Response (Success)

```json
{
  "success": true,
  "message": "Monthly reset completed successfully",
  "period_key": "2025-12",
  "export": {
    "file_path": "monthly/2025-12.csv",
    "row_count": 1523,
    "checksum": "a3f5d8...",
    "reset_completed": true
  }
}
```

---

## Security

### Anti-Cheating Measures

✅ **Server-side only**: Clients cannot call Edge Function  
✅ **RLS policies**: Users can view, only service can modify  
✅ **award_xp() locked**: Only service_role can award XP  
✅ **Idempotency**: Unique constraint prevents duplicate resets  
✅ **Explicit period**: Must specify exact month (no auto-calculation)  
✅ **CSV sanitization**: Prevents Excel formula injection  

---

## Administration

### View Exports
```sql
SELECT period_key, row_count, status, reset_completed_at
FROM leaderboard_exports
ORDER BY period_key DESC;
```

### Download CSV
```sql
SELECT storage.sign_url(
  'leaderboard-exports',
  'monthly/2025-12.csv',
  3600  -- 1 hour expiry
);
```

### Check Cron Job
```sql
SELECT * FROM cron.job ORDER BY jobid DESC;
```

### Manual Test
```bash
curl -X POST https://hspaxdszcnrznqehblky.supabase.co/functions/v1/monthly-leaderboard-reset \
  -H "Authorization: Bearer {SERVICE_ROLE_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"period_key": "2025-12", "dry_run": true}'
```

---

## Troubleshooting

### Cron not running?
```sql
-- Check extension
SELECT * FROM pg_extension WHERE extname = 'pg_cron';

-- Check job status
SELECT jobid, active, schedule FROM cron.job;

-- View run history
SELECT status, return_message, start_time 
FROM cron.job_run_details
ORDER BY start_time DESC LIMIT 10;
```

### Export failed?
```sql
-- Check export status
SELECT period_key, status, error
FROM leaderboard_exports
WHERE period_key = '2025-12';
```

Check Edge Function logs in Supabase Dashboard → Functions.

---

## Related Features

- **[YouTube XP](./youtube-xp.md)**: Awards permanent subscription_xp and video_like_xp
- **Game XP**: Awards game_xp (resets monthly)
- **Leaderboard UI**: Displays current standings

---

## Files

- **Edge Function**: `supabase/functions/monthly-leaderboard-reset/index.ts`
- **Migrations**: `supabase/migrations/202512250*`
- **Tests**: `__tests__/edge-functions/monthlyLeaderboardReset.test.ts`
- **Deployment**: `documentation/leaderboard-deployment-guide.md`
