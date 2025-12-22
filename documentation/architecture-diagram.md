# Hamaki Mobile - Architecture Diagram

## Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                         USER INTERFACE                           │
│                                                                  │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌──────────┐ │
│  │ Community  │  │   Games    │  │ Leaderboard│  │ Profile  │ │
│  │  Screen    │  │   Screen   │  │   Screen   │  │  Screen  │ │
│  └─────┬──────┘  └─────┬──────┘  └─────┬──────┘  └─────┬────┘ │
└────────┼───────────────┼───────────────┼───────────────┼───────┘
         │               │               │               │
         ▼               ▼               ▼               ▼
┌─────────────────────────────────────────────────────────────────┐
│                       CUSTOM HOOKS                               │
│                                                                  │
│  ┌────────────┐  ┌────────────┐  ┌──────────────┐  ┌─────────┐│
│  │  usePosts  │  │useGameCool │  │useLeaderboard│  │useUser  ││
│  │            │  │   down     │  │              │  │Profile  ││
│  └─────┬──────┘  └─────┬──────┘  └──────┬───────┘  └────┬────┘│
└────────┼───────────────┼────────────────┼───────────────┼──────┘
         │               │                │               │
         ▼               ▼                ▼               ▼
┌─────────────────────────────────────────────────────────────────┐
│                      SERVICE LAYER                               │
│                                                                  │
│  ┌────────────┐  ┌────────────┐  ┌──────────────┐  ┌─────────┐│
│  │postService │  │gameCool    │  │leaderboard   │  │user     ││
│  │            │  │downService │  │Service       │  │Service  ││
│  └─────┬──────┘  └─────┬──────┘  └──────┬───────┘  └────┬────┘│
└────────┼───────────────┼────────────────┼───────────────┼──────┘
         │               │                │               │
         └───────────────┴────────────────┴───────────────┘
                                 │
                                 ▼
                    ┌────────────────────────┐
                    │   SUPABASE DATABASE    │
                    │                        │
                    │  ┌──────────────────┐  │
                    │  │ PostgreSQL DB    │  │
                    │  │ - users          │  │
                    │  │ - posts          │  │
                    │  │ - leaderboard    │  │
                    │  │ - game_cooldowns │  │
                    │  └──────────────────┘  │
                    └────────────────────────┘
```

## Component Hierarchy

```
App
│
├── AuthNavigator
│   ├── SignInScreen
│   └── MainTabs (after auth)
│       │
│       ├── CommunityScreen
│       │   ├── SortFilter
│       │   ├── PostList
│       │   │   └── PostListItem (x N)
│       │   └── CreatePostFAB
│       │       └── CreatePostModal
│       │
│       ├── GamesScreen
│       │   ├── GameCard (Nu Pogodi)
│       │   ├── GameCard (Hammock Jump)
│       │   └── GameModal
│       │       ├── NoPogodGame
│       │       │   └── NoPogodGameCanvas
│       │       └── HammockJumpGame
│       │
│       ├── LeaderboardScreen
│       │   ├── LeaderboardToggle
│       │   └── LeaderboardList
│       │       └── LeaderboardItem (x N)
│       │
│       └── ProfileScreen
│           ├── AvatarPicker
│           ├── StatsCard
│           ├── XPDisplay
│           └── PostsList
│               └── PostItem (x N)
│
└── Global Providers
    ├── AuthContext
    ├── ContentContext
    └── VideoContext
```

## Feature Module Structure (Games Example)

```
features/games/
│
├── core/                          # Shared game infrastructure
│   ├── BaseGameEngine.ts         # Abstract base class
│   ├── types.ts                  # Game type definitions
│   └── utils.ts                  # Shared utilities
│
├── noPogod/                      # Nu Pogodi game module
│   ├── engine/
│   │   ├── NoPogodEngine.ts     # Main engine (extends BaseGameEngine)
│   │   ├── PlayerController.ts   # Player movement
│   │   ├── ItemSpawner.ts       # Item physics
│   │   ├── CollisionSystem.ts   # Collision detection
│   │   ├── ShonzikaAI.ts        # Enemy AI
│   │   ├── config.ts            # Game config
│   │   ├── types.ts             # Game-specific types
│   │   └── index.ts             # Barrel exports
│   │
│   └── utils/
│       ├── assets.ts            # Asset loading
│       ├── spriteRenderer.ts    # Sprite rendering
│       ├── responsiveScaling.ts # Screen scaling
│       └── assetIntegration.ts  # Asset-engine integration
│
└── hammockJump/                  # Hammock Jump game module
    └── engine/
        └── HammockJumpEngine.ts  # Game engine
```

## State Management Flow

```
┌──────────────┐
│ User Action  │
│ (e.g., tap)  │
└──────┬───────┘
       │
       ▼
┌──────────────────────┐
│   Event Handler      │
│   (in Screen/Comp)   │
└──────┬───────────────┘
       │
       ▼
┌──────────────────────┐
│   Hook Method Call   │
│   (e.g., upvotePost) │
└──────┬───────────────┘
       │
       ▼
┌──────────────────────┐
│   Service Call       │
│   (API request)      │
└──────┬───────────────┘
       │
       ▼
┌──────────────────────┐
│   Supabase/API       │
│   (data operation)   │
└──────┬───────────────┘
       │
       ▼
┌──────────────────────┐
│   Service Response   │
│   (success/error)    │
└──────┬───────────────┘
       │
       ▼
┌──────────────────────┐
│   Hook State Update  │
│   (setState)         │
└──────┬───────────────┘
       │
       ▼
┌──────────────────────┐
│   Component Re-render│
│   (UI updates)       │
└──────────────────────┘
```

## Authentication Flow

```
┌─────────────┐
│   Screen    │
│   Loads     │
└──────┬──────┘
       │
       ▼
┌──────────────────────┐
│  AuthContext checks  │
│  for existing token  │
└──────┬───────────────┘
       │
       ├─── Token Found ──────┐
       │                      │
       │                      ▼
       │              ┌───────────────┐
       │              │ Validate with │
       │              │   Supabase    │
       │              └───────┬───────┘
       │                      │
       │                      ├─── Valid ────► Main App
       │                      │
       │                      └─── Invalid ──┐
       │                                     │
       └─── No Token ────────────────────────┤
                                             │
                                             ▼
                                    ┌─────────────────┐
                                    │  Google OAuth   │
                                    │  Sign In Flow   │
                                    └────────┬────────┘
                                             │
                                             ▼
                                    ┌─────────────────┐
                                    │ YouTube API     │
                                    │ Subscription    │
                                    │ Verification    │
                                    └────────┬────────┘
                                             │
                                             ├─── Subscribed ──► Main App
                                             │
                                             └─── Not Subscribed ──► Error Message
```

## XP & Leaderboard System

```
┌──────────────────┐
│  User Action     │
│  (Like video,    │
│   play game)     │
└────────┬─────────┘
         │
         ▼
┌──────────────────────┐
│  Award XP            │
│  (via service)       │
└────────┬─────────────┘
         │
         ▼
┌──────────────────────┐
│  Update user.total_xp│
│  and weekly_xp       │
└────────┬─────────────┘
         │
         ▼
┌──────────────────────┐
│  Invalidate cache    │
│  (xpStatsCache)      │
└────────┬─────────────┘
         │
         ▼
┌──────────────────────┐
│  Trigger real-time   │
│  subscription update │
└────────┬─────────────┘
         │
         ▼
┌──────────────────────┐
│  Leaderboard auto-   │
│  updates (sorted by  │
│  weekly_xp DESC)     │
└──────────────────────┘
```

## Error Handling Chain

```
┌──────────────────┐
│  Error Occurs    │
│  (Network, DB,   │
│   Validation)    │
└────────┬─────────┘
         │
         ▼
┌──────────────────────┐
│  Service Layer       │
│  - Log error details │
│  - Throw user-       │
│    friendly message  │
└────────┬─────────────┘
         │
         ▼
┌──────────────────────┐
│  Hook Layer          │
│  - Catch error       │
│  - Update error state│
│  - Log to console    │
└────────┬─────────────┘
         │
         ▼
┌──────────────────────┐
│  Component Layer     │
│  - Display error UI  │
│  - Show retry button │
│  - User feedback     │
└──────────────────────┘
```

## Testing Strategy

```
┌──────────────────────────────────────────────┐
│              Testing Pyramid                  │
│                                               │
│                    ▲                          │
│                   ╱ ╲                         │
│                  ╱E2E╲        (Future)        │
│                 ╱─────╲                       │
│                ╱ Inte- ╲      (Optional)      │
│               ╱ gration╲                      │
│              ╱───────────╲                    │
│             ╱             ╲                   │
│            ╱  Components   ╲    92 tests      │
│           ╱─────────────────╲                 │
│          ╱                   ╲                │
│         ╱  Hooks & Services   ╲  162 tests    │
│        ╱───────────────────────╲              │
│       ╱                         ╲             │
│      ╱     Utils & Features      ╲ 216 tests  │
│     ╱───────────────────────────────╲         │
│                                               │
│    Total: ~470 tests, 100% pass rate          │
└──────────────────────────────────────────────┘
```

## Logging Levels

```
Development:
┌──────────────────────────────────────┐
│ DEBUG   ────► Console (verbose)      │
│ INFO    ────► Console (important)    │
│ WARN    ────► Console (warnings)     │
│ ERROR   ────► Console (errors)       │
└──────────────────────────────────────┘

Production (Future):
┌──────────────────────────────────────┐
│ DEBUG   ────► Disabled               │
│ INFO    ────► Disabled               │
│ WARN    ────► Error Service (Sentry) │
│ ERROR   ────► Error Service (Sentry) │
└──────────────────────────────────────┘
```

## Cache Strategy

```
XP Stats Cache:
┌────────────────────┐
│  Request XP Stats  │
└─────────┬──────────┘
          │
          ▼
    ┌─────────────┐
    │ Check Cache │
    └──────┬──────┘
           │
           ├─── Cache Hit + Valid ───► Return cached data
           │
           └─── Cache Miss/Expired ──┐
                                     │
                                     ▼
                            ┌─────────────────┐
                            │ Fetch from DB   │
                            └────────┬────────┘
                                     │
                                     ▼
                            ┌─────────────────┐
                            │ Save to Cache   │
                            │ (1 hour TTL)    │
                            └────────┬────────┘
                                     │
                                     ▼
                            ┌─────────────────┐
                            │ Return data     │
                            └─────────────────┘
```
