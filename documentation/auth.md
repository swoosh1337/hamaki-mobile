# Authentication System

This document provides detailed documentation for the Hamaki Mobile authentication system, including Google OAuth, Magic Link, session management, and token refresh.

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Files & Locations](#files--locations)
4. [Type Definitions](#type-definitions)
5. [Auth Service Methods](#auth-service-methods)
6. [Token Manager Methods](#token-manager-methods)
7. [AuthContext API](#authcontext-api)
8. [Authentication Flows](#authentication-flows)
9. [Session Persistence](#session-persistence)
10. [Deep Link Configuration](#deep-link-configuration)
11. [Error Handling](#error-handling)
12. [Edge Cases Handled](#edge-cases-handled)
13. [Testing](#testing)
14. [Usage Examples](#usage-examples)

---


## 1. Authentication

### Overview

The authentication system supports two login methods:
- **Google OAuth** - Full YouTube integration with subscription checks
- **Email Magic Link** - Passwordless login via Supabase

Both methods provide **30-day persistent sessions** with automatic silent refresh.

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        AuthContext                               │
│  (State Management & Orchestration)                              │
│  - isAuthenticated, userProfile, authMethod                      │
│  - signIn(), signInWithMagicLink(), signOut()                   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                       Auth Service Layer                         │
├─────────────────────────┬───────────────────────────────────────┤
│     authService.ts      │         tokenManager.ts               │
│  - authenticate()       │  - storeSession()                     │
│  - signInWithMagicLink()│  - getStoredSession()                 │
│  - handleMagicLinkCB()  │  - getValidAccessToken()              │
│  - loadSavedSession()   │  - refreshSession()                   │
│  - verifyYouTubeSub()   │  - clearSession()                     │
└─────────────────────────┴───────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      External Services                           │
├─────────────────────────┬───────────────────────────────────────┤
│   Google OAuth API      │          Supabase Auth                 │
│  - Token endpoint       │  - signInWithOtp()                    │
│  - UserInfo endpoint    │  - setSession()                       │
│  - YouTube Data API     │  - refreshSession()                   │
└─────────────────────────┴───────────────────────────────────────┘
```

---

### Files & Locations

| File | Purpose |
|------|---------|
| `types/auth.ts` | Type definitions for auth |
| `services/auth/authService.ts` | Authentication business logic |
| `services/auth/tokenManager.ts` | Token storage & refresh |
| `services/auth/index.ts` | Barrel export |
| `contexts/AuthContext.tsx` | React context & state |

---

### Type Definitions

**`types/auth.ts`**

```typescript
// Authentication method discriminator
type AuthMethod = 'google' | 'magic_link';

// Token data with refresh capability
interface TokenData {
    accessToken: string;
    refreshToken?: string;
    expiresIn: number;      // Seconds until expiry
    expiresAt: number;      // Timestamp (ms) when token expires
    tokenType?: string;     // Usually 'Bearer'
}

// Stored session (persisted in SecureStore)
interface StoredUserSession {
    tokenData: TokenData;
    userData: {
        id: string;         // Google ID or Supabase UUID
        email: string;
        name: string;
        picture?: string;
    };
    isSubscribed: boolean;  // YouTube subscription status
    lastVerification: number; // Last subscription check timestamp
    authMethod: AuthMethod;
    expiresAt: number;      // Session expiry (30 days)
}

// Result returned from authentication attempts
interface AuthResult {
    success: boolean;
    isSubscribed?: boolean;
    token?: string;
    error?: string;
    userData?: any;
    tokenData?: TokenData;
    authMethod?: AuthMethod;
    fromCache?: boolean;
    allChannelSubscriptions?: Record<string, boolean>;
}

// Result from magic link initiation
interface MagicLinkResult {
    success: boolean;
    message?: string;
    error?: string;
}
```

---

### Auth Service Methods

**`services/auth/authService.ts`**

#### `validateEmail(email: string): EmailValidationResult`
Validates email format before sending magic link.

```typescript
const result = authService.validateEmail('user@example.com');
// { isValid: true }

const result = authService.validateEmail('invalid');
// { isValid: false, error: 'Invalid email format' }
```

#### `signInWithMagicLink(email: string): Promise<MagicLinkResult>`
Sends a magic link email via Supabase.

**Flow:**
1. Validate email format
2. Call `supabase.auth.signInWithOtp()`
3. Return success/error

```typescript
const result = await authService.signInWithMagicLink('user@example.com');
if (result.success) {
    // Show "Check your email" UI
}
```

#### `handleMagicLinkCallback(url: string): Promise<AuthResult>`
Processes the deep link when user clicks the magic link.

**Flow:**
1. Parse URL for access_token, refresh_token
2. Call `supabase.auth.setSession()` to establish session
3. Extract user data from Supabase user object
4. Return AuthResult with user data and tokens

```typescript
// Called from deep link listener
const result = await authService.handleMagicLinkCallback('hamaki://auth/callback#access_token=...');
```

#### `authenticate(): Promise<AuthResult>`
Initiates Google OAuth flow.

**Flow:**
1. Create OAuth request with PKCE
2. Prompt user for Google login
3. Exchange authorization code for tokens
4. Fetch user profile from Google
5. Check YouTube subscription status (optional, non-blocking)
6. Return AuthResult

```typescript
const result = await authService.authenticate();
if (result.success) {
    // User authenticated, check result.isSubscribed for YouTube status
}
```

#### `loadSavedSession(): Promise<AuthResult>`
Loads existing session from secure storage on app startup.

**Flow:**
1. Get stored session from tokenManager
2. For magic_link sessions: verify Supabase session is valid
3. For google sessions: trigger background verification if needed
4. Return cached AuthResult

#### `verifyYouTubeSubscription(accessToken: string): Promise<boolean>`
Checks if user is subscribed to the Hamaki YouTube channel.

**Note:** This is **optional and non-blocking**. Auth succeeds regardless of subscription status.

---

### Token Manager Methods

**`services/auth/tokenManager.ts`**

#### `storeSession(tokenData, userData, isSubscribed, isPersistent, authMethod)`
Securely stores session data.

**Storage:**
- Uses `expo-secure-store` (encrypted)
- Persistent sessions: 30-day expiry
- Temporary sessions: 24-hour expiry

#### `getStoredSession(): Promise<StoredUserSession | null>`
Retrieves stored session, returns null if expired.

#### `getValidAccessToken(): Promise<string | null>`
Returns a valid access token, refreshing if needed.

**Refresh Logic:**
- If token expires in < 5 minutes: attempt refresh
- Google sessions: use refresh_token with Google token endpoint
- Magic link sessions: return null (let authService handle Supabase refresh)

#### `refreshSession(session): Promise<string | null>`
Refreshes Google OAuth tokens using refresh_token.

#### `clearSession(): Promise<void>`
Deletes all session data from secure storage.

---

### AuthContext API

**`contexts/AuthContext.tsx`**

#### Exposed State

| Property | Type | Description |
|----------|------|-------------|
| `isLoading` | `boolean` | True during auth operations |
| `isAuthenticated` | `boolean` | True if user is logged in |
| `isSubscribed` | `boolean` | YouTube subscription status |
| `userProfile` | `UserProfile \| null` | User's profile data |
| `authMethod` | `AuthMethod \| null` | 'google' or 'magic_link' |
| `error` | `string \| null` | Last error message |
| `isDemoMode` | `boolean` | True if using demo account |
| `magicLinkPending` | `boolean` | True after magic link sent |

#### Exposed Methods

| Method | Signature | Description |
|--------|-----------|-------------|
| `signIn` | `() => Promise<AuthResult>` | Start Google OAuth |
| `signInWithMagicLink` | `(email: string) => Promise<MagicLinkResult>` | Send magic link |
| `signInDemo` | `() => Promise<void>` | Login as demo user |
| `signOut` | `() => Promise<void>` | Logout user |
| `updateUserProfile` | `(updates: Partial<UserProfile>) => void` | Update local profile |

---

### Authentication Flows

#### Flow 1: Google OAuth Login

```
┌──────────────────────────────────────────────────────────────────┐
│ 1. User taps "Continue with Google"                              │
│    └─► AuthContext.signIn()                                      │
│         └─► authService.authenticate()                           │
│                                                                  │
│ 2. Google OAuth popup appears                                    │
│    └─► User enters credentials                                   │
│    └─► Google returns authorization code                         │
│                                                                  │
│ 3. Exchange code for tokens                                      │
│    └─► authService.exchangeCodeForTokens()                       │
│    └─► Receive access_token + refresh_token                      │
│                                                                  │
│ 4. Fetch user info                                               │
│    └─► authService.fetchGoogleUserInfo()                         │
│    └─► Get email, name, picture                                  │
│                                                                  │
│ 5. Check YouTube subscription (optional)                         │
│    └─► authService.verifyYouTubeSubscription()                   │
│                                                                  │
│ 6. Show Remember Me modal                                        │
│    └─► User chooses remember/don't remember                      │
│                                                                  │
│ 7. Complete authentication                                       │
│    └─► userService.upsertUserProfile()                           │
│    └─► tokenManager.storeSession()                               │
│    └─► Update AuthContext state                                  │
└──────────────────────────────────────────────────────────────────┘
```

#### Flow 2: Email Magic Link Login

```
┌──────────────────────────────────────────────────────────────────┐
│ 1. User enters email and taps "Send Magic Link"                  │
│    └─► AuthContext.signInWithMagicLink(email)                    │
│         └─► authService.signInWithMagicLink()                    │
│              └─► supabase.auth.signInWithOtp()                   │
│                                                                  │
│ 2. Show confirmation UI                                          │
│    └─► magicLinkPending = true                                   │
│    └─► "Check your email for the login link!"                    │
│                                                                  │
│ 3. User checks email, clicks magic link                          │
│    └─► Link opens app via deep link: hamaki://auth/callback#...  │
│                                                                  │
│ 4. Deep link handler triggered                                   │
│    └─► Linking.addEventListener('url')                           │
│         └─► authService.handleMagicLinkCallback(url)             │
│              └─► Parse tokens from URL                           │
│              └─► supabase.auth.setSession()                      │
│                                                                  │
│ 5. Complete authentication                                       │
│    └─► userService.upsertUserProfile()                           │
│    └─► tokenManager.storeSession()                               │
│    └─► Update AuthContext state                                  │
│    └─► magicLinkPending = false                                  │
└──────────────────────────────────────────────────────────────────┘
```

#### Flow 3: Session Restoration (App Launch)

```
┌──────────────────────────────────────────────────────────────────┐
│ 1. App launches                                                  │
│    └─► AuthContext useEffect on mount                            │
│                                                                  │
│ 2. Check for saved session                                       │
│    └─► authService.loadSavedSession()                            │
│         └─► tokenManager.getStoredSession()                      │
│                                                                  │
│ 3a. Session found and valid                                      │
│     └─► For magic_link: verify Supabase session                  │
│     └─► For google: schedule background verification             │
│     └─► Load user profile from Supabase                          │
│     └─► Set isAuthenticated = true                               │
│     └─► Skip login screen                                        │
│                                                                  │
│ 3b. Session expired or not found                                 │
│     └─► Clear any stale data                                     │
│     └─► Set isAuthenticated = false                              │
│     └─► Show login screen                                        │
└──────────────────────────────────────────────────────────────────┘
```

---

### Session Persistence

#### Duration
- **Persistent sessions**: 30 days (user chose "Remember Me")
- **Temporary sessions**: 24 hours (user chose "Don't Remember")

#### Token Refresh
- Access tokens expire in ~1 hour
- Refresh tokens used to get new access tokens silently
- Google: Uses Google token endpoint with `grant_type: refresh_token`
- Supabase: Uses `supabase.auth.refreshSession()`

#### Storage
- All tokens stored in `expo-secure-store` (encrypted)
- Keys:
  - `hamaki_auth_token` - Quick access token check
  - `hamaki_user_data` - Full session data
  - `hamaki_last_verification` - Last subscription check time

---

### Deep Link Configuration

#### App Schemes (app.config.ts)
```typescript
scheme: ["hamaki", "com.googleusercontent.apps.986216455734-..."],
```

- `hamaki://` - Magic link callbacks
- `com.googleusercontent.apps.*://` - Google OAuth callbacks

#### Supabase Configuration
In Supabase Dashboard → Authentication → URL Configuration:
- **Site URL**: `hamaki://auth/callback`
- **Redirect URLs**: `hamaki://auth/callback`

---

### Error Handling

| Error | Cause | Handling |
|-------|-------|----------|
| `Email is required` | Empty email for magic link | Show validation error |
| `Invalid email format` | Malformed email | Show validation error |
| `Rate limit exceeded` | Too many magic link requests | Show wait message |
| `Authentication cancelled` | User cancelled OAuth | Clear loading state |
| `Token refresh failed` | Expired refresh token | Sign out user |
| `Session expired` | 30-day limit reached | Sign out user |

---

### Edge Cases Handled

1. **Magic link opened on different device**: Only the device clicking the link gets authenticated
2. **App opened after 30+ days**: Session silently refreshed if refresh token valid
3. **Deep link while app is open**: Session updated in-place without crash
4. **Logout during token refresh**: Refresh result ignored, user stays logged out

---

### Testing

#### Test Files
- `__tests__/services/auth/authService.test.ts` - 23 tests
- `__tests__/services/auth/tokenManager.test.ts` - 23 tests
- `__tests__/services/auth/authIntegration.test.ts` - 15 tests

#### Run Tests
```bash
npm test -- __tests__/services/auth/
```

---

### Usage Examples

#### Basic Login Screen
```tsx
import { useAuth } from '@/contexts/AuthContext';

const LoginScreen = () => {
  const { 
    signIn, 
    signInWithMagicLink, 
    magicLinkPending, 
    isLoading,
    error 
  } = useAuth();

  const [email, setEmail] = useState('');

  const handleGoogleLogin = async () => {
    const result = await signIn();
    if (!result.success) {
      Alert.alert('Login Failed', result.error);
    }
  };

  const handleMagicLink = async () => {
    const result = await signInWithMagicLink(email);
    if (!result.success) {
      Alert.alert('Error', result.error);
    }
  };

  return (
    <View>
      {error && <Text style={styles.error}>{error}</Text>}
      
      <Button 
        title="Continue with Google" 
        onPress={handleGoogleLogin}
        disabled={isLoading}
      />
      
      <TextInput
        placeholder="Enter your email"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
      />
      
      <Button 
        title={magicLinkPending ? "Check your email!" : "Send Magic Link"}
        onPress={handleMagicLink}
        disabled={isLoading || magicLinkPending}
      />
    </View>
  );
};
```

#### Protected Route Check
```tsx
import { useAuth } from '@/contexts/AuthContext';
import { Redirect } from 'expo-router';

const ProtectedScreen = () => {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) return <LoadingSpinner />;
  if (!isAuthenticated) return <Redirect href="/login" />;

  return <ScreenContent />;
};
```

#### Logout
```tsx
const ProfileScreen = () => {
  const { signOut, userProfile, authMethod } = useAuth();

  return (
    <View>
      <Text>Logged in as: {userProfile?.email}</Text>
      <Text>Method: {authMethod}</Text>
      <Button title="Sign Out" onPress={signOut} />
    </View>
  );
};
```


