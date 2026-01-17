ries + realtime subscriptions) must go through services/hooks in a service layer.
3) All XP mutations must go through Edge Functions (or DB RPC called only by service role). Remove/disable any deprecated direct DB XP update paths.
4) Add a unified realtime abstraction so screens do not manually manage channels.
5) Implement HYBRID realtime leaderboard behavior:
   - Personal truth must be instant: current user XP + rank must update immediately after each game.
   - Global truth can be eventually consistent: avoid broadcasting/processing every XP event for every user device.
   - Do NOT “re-sort everyone’s leaderboard on every XP write” across all clients.
   - Provide a batched refresh mechanism (5–10 min) for “Top N” global list.
6) Write thorough unit tests for:
   - services (query + mutation + realtime subscription behavior)
   - hooks (correct subscription/unsubscription, correct reducer updates)
   - key workflows:
     - post submission -> pending -> approval -> visible in mobile list
     - XP award -> current user rank update instantly -> global list refresh behavior
7) Follow clean code + existing project conventions (TypeScript strict, logging conventions, folder patterns).

CONTEXT
- There are two apps: mobile app and admin dashboard.
- Posts flow:
  - Users submit ideas -> stored as posts with status='pending'
  - Admin approves -> status becomes 'approved'
  - Mobile should show approved posts immediately without reload
- Leaderboard flow:
  - XP updates happen via Edge Functions.
  - User expects to see their XP and rank update immediately after playing.
  - We want “realtime feel” WITHOUT realtime spam to all devices.
- Current issues:
  - direct DB calls from UI
  - manual realtime channel management
  - deprecated updateLeaderboardPoints still used
  - inconsistent XP awarding patterns

DELIVERABLES

A) Architecture & folder structure
Create the following layers (strict boundaries):
- /services
  - postService
  - leaderboardService
  - sponsorService (if needed)
  - edgeFunctionService (shared invoke wrapper)
- /realtime
  - a single reusable abstraction:
    - useRealtimeSubscription(...) OR useRealtimeTable(...)
    - supports INSERT/UPDATE/DELETE events
    - supports filters (e.g. status=approved)
    - ensures cleanup on unmount
    - deduplicates subscriptions if multiple consumers subscribe
    - exposes a strongly typed payload
    - allows “light” realtime (event triggers) vs “heavy” realtime (full row patching)
- /hooks
  - useApprovedPosts()
  - usePendingPostsForAdmin() (if admin dashboard shares code)
  - useLeaderboard()
  - useMyLeaderboardStatus() (personal truth: my XP + rank + rankChange)
  - useLeaderboardSnapshot() (global truth: Top N snapshot + periodic refresh)
- Ensure no screen directly opens channels or calls Supabase client.

B) Database / Realtime wiring requirements (Supabase)
- Ensure RLS policies allow:
  - authenticated users SELECT approved posts only
  - admins SELECT pending posts
  - only service role performs inserts/updates for moderation & XP mutation functions
- Ensure realtime is enabled for required tables.
- Realtime subscribe targets:
  - posts table filtered by status='approved' (mobile feed)
  - leaderboard_entries: DO NOT use to broadcast every XP update globally.
- Add/ensure a “leaderboard snapshot” mechanism (global truth):
  Option 1 (recommended): maintain a `leaderboard_snapshots` table or `leaderboard_top_cache` view/table
    - refreshed by cron every 5–10 minutes (or when admin triggers)
    - mobile clients subscribe to snapshot changes OR refresh on interval
  Option 2: client polls/refetches Top N every 5–10 minutes with caching
- Create a lightweight “refresh signal” channel/table:
  - e.g. `leaderboard_refresh_events(period_key, created_at, reason)`
  - emitted by server/cron after snapshot refresh
  - clients subscribe to this (low frequency) and refetch Top N

C) Implementation details (must be explicit and correct)

C1) Strict Service Layer Enforcement
- Remove all UI-level supabase.client usage:
  - app/(tabs)/leaderboard.tsx
  - community.tsx
  - any other screens/components
- Replace with hooks/services only.
- Add lint rule / guardrail (if possible) to prevent importing supabase client from UI.

C2) Unified Realtime Abstraction
- Implement `useRealtimeTable<T>()` (or equivalent) with:
  - typed events: { type: 'INSERT'|'UPDATE'|'DELETE', new?: T, old?: T }
  - optional filter strategy:
    - server-side filter if supported
    - otherwise client-side filter function
  - one channel per table+filter signature
  - reference counting to dedupe and avoid duplicate channels
  - cleanup + unsubscribe on last consumer unmount
- Provide a reducer helper:
  - applyInsert(list, row, key)
  - applyUpdate(list, row, key)
  - applyDelete(list, keyValue)
  - support stable sorting via comparator

C3) XP Awarding: One Source of Truth
- Delete or hard-disable deprecated `updateLeaderboardPoints`.
  - If kept, make it throw with an explicit error and log a warning so it cannot be used accidentally.
- All XP mutations must go through:
  - Edge Function: `award-xp` (or equivalent)
  - OR RPC callable only by service role (not client)
- Services call edge function via a single `edgeFunctionService.invoke()` wrapper.
- Edge Function response MUST include “personal truth”:
  - xpGained
  - newTotalXp
  - newRank
  - rankChange
  - (optionally) top10 preview for “feel good” UX

C4) HYBRID Leaderboard: Personal Truth Instant, Global Truth Batched
Implement this exact behavior:

Personal truth (instant, after every game):
- After game ends:
  1) UI calls `leaderboardService.awardGameXp(amount)`
  2) service invokes Edge Function `award-xp` (or `award_xp` RPC via service role)
  3) function updates leaderboard_entries for that user
  4) function calculates the user’s current rank (via rank query) and returns:
     { newTotalXp, newRank, rankChange }
  5) UI updates “My Rank” section immediately using response
- This does NOT require realtime subscriptions.

Global truth (top list eventual consistency, refreshed every 5–10 minutes):
- Mobile leaderboard screen displays:
  - Top N list loaded from `leaderboard_snapshots` (or cached table/view)
  - “Last updated at” timestamp
- Refresh strategy:
  - Cron job refreshes snapshot every 5–10 minutes (server-side)
  - Cron emits one event into `leaderboard_refresh_events`
  - Mobile subscribes to `leaderboard_refresh_events` (low frequency)
  - On event, app refetches Top N snapshot (single query)
- Optional improvement:
  - If the current user is in Top N, locally patch their row immediately (optimistic UI),
    then reconcile on next snapshot refresh.

IMPORTANT constraints:
- Do NOT subscribe all clients to leaderboard_entries updates for every XP event.
- Do NOT re-sort global leaderboard on each XP update.
- Provide a stable “My row” highlight:
  - show my current rank from personal truth response even if Top N is stale

C5) Posts Realtime (true realtime)
- Mobile list uses `useApprovedPosts()` which:
  - fetches initial approved posts
  - subscribes to posts table realtime (INSERT/UPDATE/DELETE)
  - reducer updates list in place
  - applies filter: only status='approved'
- Admin approval is performed via service (edge function or server action):
  - updates post status -> triggers realtime event -> mobile updates instantly

C6) Sponsor/Prize fetching
- Create `sponsorService` and `prizeService` if applicable.
- Ensure leaderboard.tsx only consumes hooks.

D) Testing (must be thorough)
Use Jest + React hooks testing utilities (as available). Fully mock Supabase client.

Tests must verify:

Realtime abstraction tests:
- Subscribes with correct channel name & filter signature
- Correct handler called for INSERT/UPDATE/DELETE
- Deduping behavior: two hooks subscribe -> only one underlying channel
- Cleanup: unsubscribe called when last consumer unmounts

Posts tests:
- `useApprovedPosts` initial fetch loads approved only
- INSERT approved post appears instantly
- UPDATE pending->approved appears
- UPDATE approved->rejected disappears
- DELETE approved disappears

XP + Leaderboard tests:
- `leaderboardService.awardGameXp` invokes correct edge function payload
- Response updates personal truth store/hook immediately
- `useMyLeaderboardStatus` updates rank and totalXp from response
- Snapshot refresh:
  - `useLeaderboardSnapshot` refetches on refresh event
  - ensures stable sorting and correct UI shape
- Ensure NO direct DB update function is reachable.

OUTPUT FORMAT (must follow exactly)
1) Explain final architecture with a diagram-like bullet list (layers + responsibilities).
2) Provide step-by-step migration plan (PR-sized steps).
3) Provide actual code for:
   - realtime abstraction (+ dedupe + filters)
   - services (posts, leaderboard, edgeFunction wrapper)
   - hooks (posts, my leaderboard status, leaderboard snapshot)
   - updated screen(s) (leaderboard.tsx, community.tsx, game XP awarding integration)
   - tests (services + hooks + realtime)
4) Ensure code compiles and follows project style (TypeScript strict, no any).
5) Include exact file paths, function signatures, and where to delete/replace deprecated paths.

NON-NEGOTIABLE BEHAVIORAL REQUIREMENTS
- Any place that previously called Supabase directly from UI must be refactored.
- Any place that awarded XP via direct DB updates must be removed or made impossible.
- Leaderboard must feel instant for the player (personal truth), while global list is batched + low-frequency refresh.

