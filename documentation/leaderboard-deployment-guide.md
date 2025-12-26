# Leaderboard Reset System - Deployment Guide

## 🚀 Quick Start

### 1. Run Database Migrations

```bash
# Run all migrations
supabase db push

# Or run individually
supabase migration up
```

### 2. Create Storage Bucket

Go to Supabase Dashboard → Storage → Create Bucket:
- **Name**: `leaderboard-exports`
- **Public**: ❌ No (keep private)
- **File size limit**: 50MB

### 3. Set Up Cron Job

1. Go to Supabase Dashboard → Database → SQL Editor
2. Paste the contents of `20251225000300_setup_monthly_reset_cron.sql`
3. **Replace these values**:
   - `YOUR_PROJECT_REF` → Your actual project ref (e.g., `hspaxdszcnrznqehblky`)
   - `YOUR_SERVICE_ROLE_KEY` → From Dashboard → Settings → API → service_role
4. Run the SQL

### 4. Manual Testing

#### Test with Dry Run (Safe):
```bash
curl -X POST https://YOUR_PROJECT_REF.supabase.co/functions/v1/monthly-leaderboard-reset \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"period_key": "2025-12", "dry_run": true}'
```

#### Test Actual Export:
```bash
curl -X POST https://YOUR_PROJECT_REF.supabase.co/functions/v1/monthly-leaderboard-reset \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -H "Content-Type": application/json" \
  -d '{"period_key": "2025-12", "dry_run": false}'
```

### 5. Verification

#### Check export was created:
```sql
SELECT * FROM leaderboard_exports 
WHERE period_type = 'monthly' 
ORDER BY created_at DESC;
```

#### Check game XP was reset:
```sql
SELECT 
  COUNT(*) as total_users,
  SUM(game_xp) as total_game_xp,
  SUM(subscription_xp) as total_subscription_xp,
  SUM(video_like_xp) as total_video_like_xp
FROM leaderboard_entries;
```

#### Download the CSV:
```sql
-- Get signed URL (valid for 1 hour)
SELECT storage.sign_url(
  'leaderboard-exports',
  'monthly/2025-12.csv',
  3600
);
```

## 📊 Understanding the Cron Expression

```
'0 0 1 * *'  
 │ │ │ │ │
 │ │ │ │ └─ Day of week (0-7, Sunday = 0 or 7)
 │ │ │ └─── Month (1-12)
 │ │ └───── Day of month (1-31)
 │ └─────── Hour (0-23)
 └───────── Minute (0-59)
```

**Common Schedules:**
- `0 0 1 * *` - 00:00 on 1st of every month ✅ (recommended)
- `0 1 1 * *` - 01:00 on 1st of every month
- `30 23 L * *` - 23:30 on last day of month

## 🧪 Running Tests

```bash
# Run leaderboard reset tests
npm test -- monthlyLeaderboardReset.test.ts

# Run with coverage
npm test -- monthlyLeaderboardReset.test.ts --coverage
```

## 🔍 Monitoring

#### View Cron Job Status:
```sql
SELECT * FROM cron.job 
WHERE jobname = 'monthly-leaderboard-reset';
```

#### View Recent Runs:
```sql
SELECT 
  start_time,
  end_time,
  status,
  return_message
FROM cron.job_run_details
WHERE jobname = 'monthly-leaderboard-reset'
ORDER BY start_time DESC
LIMIT 10;
```

## 🐛 Troubleshooting

### Cron job not running?
1. Check if pg_cron extension is installed:
   ```sql
   SELECT * FROM pg_extension WHERE extname = 'pg_cron';
   ```

2. Check job is active:
   ```sql
   SELECT jobname, active FROM cron.job;
   ```

### Export fails?
1. Check Edge Function logs in Supabase Dashboard → Functions
2. Verify storage bucket exists and has correct permissions
3. Check service role key is correct

### Reset didn't work?
1. Check export status:
   ```sql
   SELECT status, error, reset_completed_at 
   FROM leaderboard_exports 
   WHERE period_key = '2025-12';
   ```

2. If status is 'failed', check the error column

## 📁 File Locations

- **Migrations**: `supabase/migrations/202512250003*`
- **Edge Function**: `supabase/functions/monthly-leaderboard-reset/`
- **Tests**: `__tests__/edge-functions/monthlyLeaderboardReset.test.ts`
- **Documentation**: `documentation/leaderboard-reset-system.md`

## 🎯 Expected Results

When reset runs successfully:
1. CSV file created in `leaderboard-exports/monthly/YYYY-MM.csv`
2. Export record in `leaderboard_exports` table
3. All `game_xp` values set to 0
4. `subscription_xp` and `video_like_xp` unchanged
5. `total_xp` auto-recalculated

## 🔐 Security Checklist

- ✅ Service role key stored securely (not in code)
- ✅ Storage bucket is private
- ✅ RLS policies prevent client XP manipulation
- ✅ `award_xp()` function locked to service_role
- ✅ Edge Function requires explicit period_key
- ✅ Idempotency check prevents duplicate resets

## 🎉 You're Done!

The system will now:
- Export leaderboard to CSV on the 1st of each month
- Reset game XP while preserving permanent XP
- Maintain full audit trail
- Prevent duplicate executions

Monitor the first few runs to ensure everything works as expected!
