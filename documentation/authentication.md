# Authentication

This document explains Hamaki’s authentication system, covering the Google OAuth PKCE flow, token management, subscription verification, and how we integrate with Supabase and React Context.

## 1. Overview

Hamaki requires that only subscribers of the “HamaKi Studio” YouTube channel can access the app. We accomplish this by:

1. Signing in users with Google OAuth (PKCE).
2. Storing and refreshing tokens securely.
3. Verifying YouTube channel subscription via the Data API.
4. Persisting verified users in Supabase.
5. Providing global auth state via React Context.

## 2. OAuth PKCE Flow

1. **Generate Code Verifier & Challenge**  
   - A random string (verifier) is created on the client.
   - SHA256 hash of verifier yields the challenge.

2. **Authorization Request**  
   - User is redirected to Google’s OAuth endpoint with:
     - `response_type=code`
     - `client_id` (platform-specific)
     - `scope=profile email youtube.readonly`
     - `code_challenge` and `code_challenge_method=S256`
     - `redirect_uri=hamaki://redirect`

3. **Authorization Response**  
   - Google returns an authorization code to the app’s redirect URI.

4. **Token Exchange**  
   - App sends authorization code + original verifier to Google’s token endpoint.
   - Receives `access_token`, `refresh_token`, and `expires_in`.

## 3. Token Management

- **Storage:**  
  - Tokens are stored in `AsyncStorage` along with expiry timestamps.
  - Refresh tokens are kept securely for up to 30 days.

- **Refresh Logic:**  
  - On app startup, AuthContext checks stored tokens.
  - If the access token is expired (or about to expire), it uses the refresh token to obtain a new access token.
  - If the refresh token is invalid or expired, the user is signed out.

- **Logout:**  
  - Clearing AsyncStorage entries.
  - Resetting AuthContext state and navigating back to the login screen.

## 4. Subscription Verification

1. **List Subscriptions**  
   - Call YouTube Data API v3:  
     ```
     GET https://www.googleapis.com/youtube/v3/subscriptions
       ?part=snippet,contentDetails
       &mine=true
       &maxResults=50
       &pageToken={token}
     ```
   - Handle pagination until all pages are fetched or target channel is found.

2. **Check Channel ID**  
   - Scan each `item.snippet.resourceId.channelId` for `UCSI5XbaxsX1USijrfFVuJqA`.
   - If found, user is a verified subscriber.

3. **Error Handling**  
   - Rate limits: exponential backoff on quota errors.
   - Network issues: retry with a short delay.
   - Unauthorized or invalid token: force refresh or re-authenticate.

## 5. React Context Integration

- **AuthContext.tsx**  
  - Provides `user`, `isLoading`, `signIn()`, and `signOut()` to the app.
  - On mount, attempts to rehydrate tokens and verify subscription.
  - Exposes global state so screens can conditionally render based on auth.

- **Using Context**  
  ```tsx
  const { user, signOut } = useAuth();
  if (!user) {
    return <AuthScreen />;
  }
  return <ProtectedTabs />;
  ```

## 6. Supabase User Sync

- **User Table**  
  - Stores `id`, `email`, `name`, `avatarUrl`, `youtubeId`, and `xp`.

- **On First Sign-In**  
  - After subscription check, create or update the user record in Supabase.
  - Initialize XP or load existing XP.

- **Session Security**  
  - Supabase’s Row Level Security ensures users only access their own records.

## 7. Best Practices & Security

- Always use PKCE to avoid exposing client secrets.
- Store tokens securely and limit their lifespan.
- Handle all API errors gracefully and provide user feedback.
- Ensure logout completely clears session data.
- Use HTTPS and Expo's secure storage in production if available.

---

## 8. Remember Me Functionality

Hamaki includes a "Stay signed in" feature that allows users to persist their authentication preference across sessions.

### Flow

1. **First Sign-In**:
   - User completes authentication via Google OAuth or Magic Link
   - `AuthContext.completeAuthentication()` checks for existing preference via `rememberMeService.getPreference(email)`
   - If no preference exists → show Remember Me modal
   - If preference exists with `rememberMe: true` → skip modal and auto-apply preference

2. **Modal Response**:
   - User chooses "Yes" or "No" in the modal
   - Preference is saved via `rememberMeService.setPreference(email, rememberMe)`
   - Session is stored with correct expiry (persistent vs temporary)

3. **Subsequent Sign-Ins**:
   - `completeAuthentication()` finds existing preference
   - Modal is skipped, session is created with saved preference
   - Preference timestamp is updated to extend the 90-day expiry

### Critical Implementation Details

**IMPORTANT**: When auto-applying a saved preference, you MUST call `setIsAuthenticated(true)` to properly complete the authentication flow:

```typescript
// contexts/AuthContext.tsx (lines 174-202)
if (existingPreference && existingPreference.rememberMe) {
  // Store persistent session
  await tokenManager.storeSession(..., true);

  // Update context state
  setUserProfile(updatedUser);
  setAuthMethod(method);
  setIsSubscribed(result.isSubscribed || false);
  setIsAuthenticated(true); // CRITICAL: Must set authenticated state

  // Background checks
  if (method === 'google' && updatedUser.google_id && updatedUser.id) {
    performBackgroundChecks(updatedUser.google_id, updatedUser.id);
  }

  return true;
}
```

Without setting `isAuthenticated: true`, the user will not be properly authenticated even though their session is valid.

### Storage

Preferences are stored in `AsyncStorage` with the key `hamaki_remember_me_preferences`:

```typescript
{
  "hash_12345": {
    email: "user@example.com",
    rememberMe: true,
    expiresAt: 1735689600000, // 90 days from creation
    lastUsed: 1735689600000
  }
}
```

Email addresses are hashed for privacy, preferences expire after 90 days, and timestamps are updated on each use.

---

## 9. Background Subscription Verification

After successful Google OAuth authentication, Hamaki automatically verifies YouTube channel subscriptions in the background.

### Flow

1. **Trigger**: Called from `completeAuthentication()` after user profile is saved
2. **Check**: Uses `areAllChannelsVerified(userId)` to skip if already verified
3. **Verification**: Calls `verifyAndAwardSubscriptionXP()` with Supabase UUID
4. **Notification**: Sends notification if XP was awarded or subscription not found

### Critical Implementation Details

**IMPORTANT**: Always pass the **Supabase UUID** (not Google ID) to background checks:

```typescript
// contexts/AuthContext.tsx (lines 197-199)
// ✅ CORRECT: Pass Supabase UUID
if (method === 'google' && updatedUser.google_id && updatedUser.id) {
  performBackgroundChecks(updatedUser.google_id, updatedUser.id);
  //                      ^^^^^^^^^^^^^^^^^       ^^^^^^^^^^^^^^
  //                      Google ID (string)      Supabase UUID
}

// ❌ WRONG: Passing Google ID as userId
performBackgroundChecks(googleId, googleId); // Will cause UUID validation error
```

### Why This Matters

The Edge Function `verify-subscriptions` expects:
- `Authorization: Bearer {google_access_token}` - For YouTube API calls
- `body.userId` - **Supabase UUID** (format: `user_uuid`) - For database queries

**Google ID** is a numeric string like `"102876331661182127857"`.
**Supabase UUID** is a proper UUID like `"550e8400-e29b-41d4-a716-446655440000"`.

Passing the wrong ID type results in:
```
ERROR: invalid input syntax for type uuid: "102876331661182127857"
Edge Function returned a non-2xx status code: 401
```

### Database Queries

All database operations must use the Supabase UUID:

```typescript
// ✅ CORRECT
await supabase
  .from('youtube_subscription_verifications')
  .select('*')
  .eq('user_id', supabaseUserId); // UUID

// ❌ WRONG
await supabase
  .from('youtube_subscription_verifications')
  .select('*')
  .eq('user_id', googleId); // Google ID - will fail validation
```

---

## 10. Common Issues & Troubleshooting

### Issue: Remember Me modal shows on every login

**Symptom**: User answers "Yes" to "Stay signed in" but modal appears again on next login.

**Root Cause**: The `signIn()` function was directly showing the modal without checking for existing preferences.

**Fix**: Ensure `signIn()` calls `completeAuthentication()` which checks `rememberMeService.getPreference()` before showing the modal.

**Verification**:
```typescript
// ✅ CORRECT
const signIn = async (): Promise<AuthResult> => {
  const result = await authService.authenticate();
  if (result.success && result.userData) {
    await completeAuthentication(result); // Checks preferences
    setIsLoading(false);
    return { success: true, ... };
  }
};

// ❌ WRONG
const signIn = async (): Promise<AuthResult> => {
  const result = await authService.authenticate();
  if (result.success && result.userData) {
    setPendingAuthResult(result);
    setShowRememberMeModal(true); // Always shows modal
    return { success: true, ... };
  }
};
```

### Issue: Edge Function returns 401 with UUID validation error

**Symptom**:
```
ERROR: invalid input syntax for type uuid: "102876331661182127857"
Edge Function returned a non-2xx status code: 401
```

**Root Cause**: Passing Google ID instead of Supabase UUID to `performBackgroundChecks()`.

**Fix**: Ensure all calls to `performBackgroundChecks()` pass the Supabase UUID (`user.id`), not the Google ID.

**Verification**:
```typescript
// ✅ CORRECT - contexts/AuthContext.tsx:197-199
performBackgroundChecks(updatedUser.google_id, updatedUser.id);
//                                              ^^^^^^^^^^^^^^
//                                              Supabase UUID

// ❌ WRONG
performBackgroundChecks(googleId, googleId);
//                                ^^^^^^^^
//                                Google ID causes validation error
```

### Issue: User authenticated but `isAuthenticated` returns false

**Symptom**: User has valid session but UI shows unauthenticated state.

**Root Cause**: Missing `setIsAuthenticated(true)` call when auto-applying Remember Me preference.

**Fix**: Ensure `completeAuthentication()` sets `isAuthenticated: true` in the auto-apply path (line 195).

---

By following this design, Hamaki provides a robust, secure authentication experience that enforces subscriber-only access while integrating seamlessly with Google, YouTube, and Supabase.