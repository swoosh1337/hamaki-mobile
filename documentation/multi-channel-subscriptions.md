# Multi-Channel Subscription System

## Overview

The Hamaki app now supports a multi-channel subscription reward system that allows users to earn XP points by subscribing to 4 different YouTube channels:

1. **HamaKi Studio** (Main Channel) - 1,000 XP
2. **Miro's Channel** - 700 XP
3. **Bastos Channel** - 700 XP
4. **Koro's Channel** - 700 XP

**Total Possible XP**: 3,100 XP

## Channel IDs

- HamaKi Studio: `process.env.EXPO_PUBLIC_HAMAKI_CHANNEL_ID` (from environment variables)
- Miro: `UChJnB_7-JUYXEr-Fv3Y_rGA`
- Bastos: `UCjSZIjLKfQHkdZbZMvYQhAw`
- Koro: `UCPCQmO5MrP3S1oVu6p9bxRw`

## Database Schema

### New Columns in `users` table:

```sql
-- Subscription tracking
miro_channel_subscribed BOOLEAN DEFAULT FALSE
bastos_channel_subscribed BOOLEAN DEFAULT FALSE
koro_channel_subscribed BOOLEAN DEFAULT FALSE
subscriptions_verified_at TIMESTAMPTZ

-- XP reward tracking (prevents double-awarding)
subscription_xp_awarded JSONB DEFAULT '{
  "hamaki": false,
  "miro": false,
  "bastos": false,
  "koro": false
}'::jsonb
```

## User Flow

### 1. Sign-In Flow

When a user signs in with Google:

1. OAuth authentication completes
2. App checks YouTube subscriptions for all 4 channels via YouTube Data API v3
3. Subscription status is saved to database
4. XP is awarded for each subscribed channel (only if not previously awarded)
5. User sees their total XP reflected in profile

### 2. Manual Verification Flow

Users can manually verify/update their subscriptions:

1. Open Settings → "Channel Subscriptions"
2. See list of all 4 channels with:
   - Subscription status (checkmark if subscribed)
   - XP reward amount
   - "XP Claimed" badge if already awarded
3. For unsubscribed channels:
   - Tap "Subscribe" button → Opens YouTube app/website
   - User subscribes manually on YouTube
   - Returns to app
4. Tap "Verify Subscriptions" button
5. App re-checks all channel subscriptions via API
6. Awards XP for any new subscriptions
7. Shows success message with total XP earned

## Architecture

### Files Created

#### 1. `utils/channelSubscriptions.ts`
- **Purpose**: Core service for channel subscription management
- **Key Functions**:
  - `checkAllChannelSubscriptions()`: Checks all 4 channels via YouTube API
  - `getChannelSubscriptionStatus()`: Gets current status from database
  - `updateChannelSubscriptionsAndAwardXP()`: Updates DB and awards XP
  - `verifyAndSyncSubscriptions()`: Full verification flow
  - `openYouTubeChannel()`: Deep link to YouTube

#### 2. `components/subscriptions/ChannelSubscriptionManager.tsx`
- **Purpose**: UI component for managing subscriptions
- **Features**:
  - Stats card showing subscribed channels, earned XP, total possible XP
  - Channel cards with:
    - Channel name
    - Subscription status indicator
    - XP reward badge
    - Subscribe button (opens YouTube)
    - "XP Claimed" badge when applicable
  - "Verify Subscriptions" button
  - Loading states
  - Success/error alerts

#### 3. `supabase/migrations/20251026000000_add_multi_channel_subscriptions.sql`
- **Purpose**: Database schema changes
- **Actions**:
  - Adds subscription tracking columns
  - Adds XP awarded tracking JSON field
  - Creates indexes for performance
  - Adds column comments for documentation

### Files Modified

#### 1. `utils/supabase.ts`
- Updated `UserProfile` interface with new fields:
  ```typescript
  miro_channel_subscribed?: boolean;
  bastos_channel_subscribed?: boolean;
  koro_channel_subscribed?: boolean;
  subscriptions_verified_at?: string;
  subscription_xp_awarded?: {
    hamaki: boolean;
    miro: boolean;
    bastos: boolean;
    koro: boolean;
  };
  ```

#### 2. `utils/auth.ts`
- Added `allChannelSubscriptions` to `AuthResult` interface
- Modified `authenticateWithGoogle()` to check all 4 channels
- Returns subscription status for all channels

#### 3. `contexts/AuthContext.tsx`
- Modified `handleRememberMeChoice()` to process multi-channel subscriptions
- Awards XP on sign-in if user is subscribed
- Updates user profile with earned XP

#### 4. `components/ui/SettingsModal.tsx`
- Added "Earn More XP" section
- "Channel Subscriptions" card that opens subscription manager
- Nested modal for subscription management UI

## XP Awarding Logic

### Prevention of Double-Awarding

The system tracks which channels have had their XP rewards claimed using the `subscription_xp_awarded` JSONB field:

```json
{
  "hamaki": false,  // Not yet claimed
  "miro": true,     // Already claimed
  "bastos": false,  // Not yet claimed
  "koro": true      // Already claimed
}
```

### Award Conditions

XP is awarded when ALL of the following are true:
1. User is verified as subscribed to the channel
2. XP has not been previously awarded for that channel (`subscription_xp_awarded[channel] === false`)

### Example Scenarios

**Scenario 1: New User, All Subscribed**
- User signs in and is subscribed to all 4 channels
- Awards: 1000 + 700 + 700 + 700 = 3,100 XP
- All `subscription_xp_awarded` fields set to `true`

**Scenario 2: Existing User, Subscribes to 2 More**
- User previously had HamaKi and Miro (1,700 XP claimed)
- Now subscribes to Bastos and Koro
- Awards: 700 + 700 = 1,400 XP (only for new subscriptions)

**Scenario 3: User Unsubscribes Then Re-subscribes**
- User unsubscribes from a channel
- Later re-subscribes
- No additional XP awarded (already claimed)

## API Integration

### YouTube Data API v3

**Endpoint**: `https://www.googleapis.com/youtube/v3/subscriptions`

**Parameters**:
- `part=snippet`
- `mine=true`
- `maxResults=50`

**Authentication**: OAuth 2.0 Bearer token

**Rate Limiting**: Uses pagination with `nextPageToken` to check all user subscriptions

### Subscription Check Logic

For each channel:
1. Fetch user's YouTube subscriptions (paginated)
2. Check if channel ID appears in results
3. Continue checking pages until found or no more pages
4. Return `true` if found, `false` otherwise

**Performance**: Parallel checking of all 4 channels using `Promise.all()`

## UI/UX Features

### Visual Design

- **Theme Consistency**: Matches Hamaki app's dark theme with lime green (#C4FF00) accents
- **Typography**:
  - Headers: HamakiENG font
  - Body: SpaceMono font
- **Colors**:
  - Background: Dark theme (`Colors.dark.background`)
  - Primary accent: Lime green (`Colors.dark.tint`)
  - Success states: Checkmarks in lime green
  - YouTube branding: Red (#FF0000) for subscribe buttons

### Interactive Elements

1. **Subscribe Buttons**
   - YouTube red background with logo icon
   - Opens YouTube app or browser
   - `?sub_confirmation=1` parameter shows subscribe dialog

2. **Verify Button**
   - Fixed to bottom of screen
   - Large, prominent lime green button
   - Shows loading spinner during verification
   - Disabled state while processing

3. **Status Indicators**
   - Checkmark icons for subscribed channels
   - "XP Claimed" badges for rewarded subscriptions
   - XP amount badges on each card

### User Feedback

- **Success Alert**: Shows total XP awarded with celebration message
- **Empty State**: Encourages users to subscribe for XP
- **Loading States**: Skeleton loaders and spinners
- **Error Handling**: Clear error messages with retry options

## Testing Checklist

- [ ] Database migration runs successfully
- [ ] New user sign-in checks all 4 channels
- [ ] XP awarded correctly on first sign-in
- [ ] XP not re-awarded on subsequent sign-ins
- [ ] Settings → Channel Subscriptions opens correctly
- [ ] Subscribe buttons open YouTube app/browser
- [ ] Verify button checks all channels
- [ ] Verify button awards XP for new subscriptions
- [ ] Profile XP updates after verification
- [ ] Leaderboard reflects new XP
- [ ] Demo mode hides subscription feature
- [ ] Deep links to YouTube work on iOS and Android

## Future Enhancements

- Push notification when new channel is added
- Bonus XP for being subscribed to all channels (streak bonus)
- Weekly verification reminder
- Social sharing of subscription achievements
- Channel-specific badges/rewards
