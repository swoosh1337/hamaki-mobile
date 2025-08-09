# Architecture Overview

This document provides a high-level view of the Hamaki app’s architecture, explaining how the major pieces fit together, key design decisions, and integration points.

## 1. Project Structure

```
hamaki/
├── app/
│   ├── _layout.tsx         # Root layout: wraps navigation, providers
│   ├── index.tsx           # Entry: redirects based on auth state
│   ├── auth.tsx            # Google sign-in & subscription check
│   └── (tabs)/             # Authenticated tab navigator
├── components/             # Reusable UI components (buttons, cards)
├── contexts/               # React Contexts (AuthContext, ThemeContext)
├── utils/
│   ├── auth.ts             # PKCE OAuth, token storage, YouTube checks
│   └── supabase.ts         # Supabase client, queries for users/XP/leaderboard
├── constants/              # Design tokens (Colors, Fonts, Channel IDs)
├── hooks/                  # Custom hooks (polling, subscription status)
├── assets/                 # Static images, fonts (Hamaki Geo, Space Mono)
└── supabase/               # Database schema and migration scripts
```

## 2. Routing & Navigation

- **File-based Routing** via Expo Router: each file in `app/` becomes a route.
- `_layout.tsx` sets up global providers (Auth, Theme) and a shared `Screen` wrapper.
- Unauthenticated users land on `/auth`, while verified subscribers are routed into `(tabs)` which hosts the main feed, notifications, games, and leaderboard.

## 3. Authentication Flow

1. **OAuth PKCE**  
   - Initiated in `app/auth.tsx` using `expo-auth-session`.  
   - Generates code verifier & challenge to exchange an authorization code securely.
2. **Token Management**  
   - Access and refresh tokens stored in `AsyncStorage` with 30-day expiration metadata.  
   - On app start, `AuthContext` checks for existing valid tokens and refreshes if needed.
3. **Subscription Verification**  
   - After Google sign-in, `utils/auth.ts` calls YouTube Data API v3 (`youtube.readonly`) to list the user’s subscriptions.  
   - Paginated requests handle large subscription lists, scanning for channel ID `UCSI5XbaxsX1USijrfFVuJqA`.
4. **Session Setup**  
   - Verified users are persisted in Supabase (`users` table).  
   - AuthContext updates global state and navigates into the protected area.

## 4. YouTube API Integration

- **Video Feed**  
  - Fetches latest videos from Hamaki channel via the YouTube Data API.
  - Caches results for 5 minutes to reduce quota usage.
  - Marks “NEW” badge for videos published in the last 24 hours.
- **Watch Integration**  
  - Videos open in the native YouTube app or external browser when tapped.
- **Background Polling**  
  - Custom hook polls every 15 minutes for new uploads, triggers in-app notifications if new content is detected.

## 5. Supabase Integration

- **User Profiles & XP**  
  - On first login, a user record is created with default XP.
  - XP is awarded for actions such as voting in the WishKit feature or watching content.
- **Leaderboard**  
  - Aggregates top users by XP in real time.
- **Data Security**  
  - Supabase JWT rules ensure that each user can only read/write their own records.

## 6. Theming & Styling

- **Dark-Only Theme**  
  - Uses Expo’s `DarkTheme` with custom color tokens defined in `constants/Colors.ts`.
- **Fonts**  
  - “Hamaki Geo” for headings, “Space Mono” for body text loaded on app launch.
- **Design System**  
  - All spacing, typography, and color decisions are centralized in constants for consistency.

## 7. Data Flow & Caching

- **Local Storage**  
  - Tokens and user preferences (theme, last-checked timestamps) stored via `AsyncStorage`.
- **In-Memory Cache**  
  - Short-lived caches for API responses to reduce network calls.
- **Background Sync**  
  - Hook-based polling for subscriptions and new video notifications when the app is active.

## 8. Testing & CI

- **Unit & Integration Tests** in `__tests__` using Jest & React Native Testing Library.
- **Linting** via ESLint configured to enforce code style and catch common bugs.
- **EAS Build** configured for iOS and Android with separate OAuth client IDs.

---

This overview should help you understand how the pieces of Hamaki fit together. For deep dives, see the individual markdown files in this `documentation/` folder.