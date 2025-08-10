# Profile Page – Implementation Notes

This document explains how the Profile page works, with emphasis on the recent avatar and username flows, state updates, and data fetching behavior.

## Overview

- Screen file: `app/(tabs)/profile.tsx`
- Global auth/state: `contexts/AuthContext.tsx`
- Supabase service: `utils/supabase.ts`
- Avatar picker UI: `components/profile/AvatarPicker.tsx`

The page shows:
- Current user avatar and name (editable)
- XP stats (weekly/total)
- User posts with upvote actions and pagination

## Data Flow

1. On mount (or when the signed-in user changes), the screen:
   - Seeds local state from `userProfile` (e.g., avatar URL)
   - Fetches XP stats via `userService.getUserXPStats(googleId)`
   - Fetches user posts via `userService.getUserPosts(userId, limit, offset)`

2. The dependency for initialization is `userProfile?.google_id` instead of the full `userProfile` object to avoid re-fetching data on purely cosmetic updates (e.g., avatar URL changes).

```ts
// app/(tabs)/profile.tsx
useEffect(() => {
  if (userProfile?.google_id) {
    initializeProfileData();
  }
}, [userProfile?.google_id]);
```

## Avatar Update Flow

### UI (AvatarPicker)

- File: `components/profile/AvatarPicker.tsx`
- Displays three selectable avatars using Supabase Storage signed URLs.
- Buttons reflect disabled and selected states both visually and via `accessibilityState`.
- Selecting an avatar calls the `onSelect(url)` callback with the full URL.

```tsx
// Avatar options now use Supabase URLs
const avatarOptions = [
  { id: 'avatar-1', title: 'Avatar 1', url: 'https://.../avatar-1.png?...' },
  { id: 'avatar-2', title: 'Avatar 2', url: 'https://.../avatar-2.png?...' },
  { id: 'avatar-3', title: 'Avatar 3', url: 'https://.../avatar-3.png?...' },
];

// onPress -> onSelect(avatar.url)
```

### Service (Supabase)

- File: `utils/supabase.ts`
- `userService.updateUserAvatar(googleId, avatar)` accepts either a legacy id (`avatar-1` …) or a full URL.
- If an id is provided, it is mapped to the corresponding Supabase Storage URL; otherwise the provided URL is stored directly in `users.avatar_url`.

### Global State and Immediate UI Update

- File: `contexts/AuthContext.tsx`
- The context now exposes `updateUserProfile(updates: Partial<UserProfile>)` to update global user state without a hard re-fetch.
- On successful avatar (or username) update, the Profile screen calls `updateUserProfile({ avatar_url: updatedProfile.avatar_url })` (or `full_name`) to reflect changes immediately.

```ts
// app/(tabs)/profile.tsx
const { updateUserProfile } = useAuth();
...
const updated = await userService.updateUserAvatar(userProfile.google_id, avatarUrl);
if (updated) {
  updateUserProfile({ avatar_url: updated.avatar_url });
}
```

## Username Update Flow

- Validates length (2–30) and allowed characters (letters, numbers, spaces) in `userService.updateUsername`.
- On success, the screen updates global state: `updateUserProfile({ full_name: updated.full_name })` and closes edit mode.

## XP & Posts Fetching

- XP stats are fetched via `getUserXPStats(googleId)` and shown as weekly and total values.
- Posts are fetched via `getUserPosts(userId, limit, offset)` with simple pagination (Load More button).
- Upvotes optimistically update the local list and persist through `upvotePost`/`downvotePost`. On error, the list is reloaded.

## Performance & UX Considerations

- Avoids re-fetching page data on avatar/name-only changes by scoping the init effect to `userProfile?.google_id`.
- Avatar options are fully disabled when selected or while updating.
- Accessibility: avatar options expose `selected` and `disabled` states; buttons use accessible labels.

## Files Touched

- `components/profile/AvatarPicker.tsx`
  - Now renders images from Supabase URLs, disables/marks selected properly.
- `utils/supabase.ts`
  - `updateUserAvatar` accepts URL or id; stores the URL in `avatar_url`.
- `contexts/AuthContext.tsx`
  - Added `updateUserProfile` to update global profile fields without refetch.
- `app/(tabs)/profile.tsx`
  - Uses `updateUserProfile` after avatar/username updates.
  - Initializes on user identity changes only.

## Future Enhancements

- Add an “Edit avatar” bottom sheet with preview and confirm.
- Migrate to permanent (non-expiring) public URLs or signed URL refresh if needed.
- Add client-side caching for XP stats and posts.


