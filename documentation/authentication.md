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
- Use HTTPS and Expo’s secure storage in production if available.

---

By following this design, Hamaki provides a robust, secure authentication experience that enforces subscriber-only access while integrating seamlessly with Google, YouTube, and Supabase.