/**
 * Avatar Utilities
 * Maps avatar IDs to local image sources
 */

// Avatar ID to local image source mapping
const avatarMap: Record<string, any> = {
  'avatar-1': require('@/assets/avatars/1.jpg'),
  'avatar-2': require('@/assets/avatars/2.jpg'),
  'avatar-3': require('@/assets/avatars/3.jpg'),
  'avatar-4': require('@/assets/avatars/4.jpg'),
  'avatar-5': require('@/assets/avatars/5.jpg'),
  'avatar-6': require('@/assets/avatars/6.jpg'),
  'avatar-7': require('@/assets/avatars/7.jpg'),
  'avatar-8': require('@/assets/avatars/8.jpg'),
  'avatar-9': require('@/assets/avatars/9.jpg'),
  'avatar-10': require('@/assets/avatars/Layer_2.jpg'),
  'avatar-11': require('@/assets/avatars/Layer_3.jpg'),
  'avatar-12': require('@/assets/avatars/Layer_4.jpg'),
  'avatar-13': require('@/assets/avatars/Layer_5.jpg'),
  'avatar-14': require('@/assets/avatars/Layer_6.jpg'),
  'avatar-15': require('@/assets/avatars/Layer_7.jpg'),
  'avatar-16': require('@/assets/avatars/Layer_8.jpg'),
  'avatar-17': require('@/assets/avatars/Layer_9.jpg'),
  'avatar-18': require('@/assets/avatars/Layer_10.jpg'),
};

/**
 * Get avatar source from avatar ID or URL
 * @param avatarValue - Avatar ID (e.g., 'avatar-1') or URL
 * @returns Local require() source or { uri: url } object
 */
export function getAvatarSource(avatarValue: string | null | undefined): any {
  // Handle null/undefined
  if (!avatarValue) {
    return avatarMap['avatar-1']; // Default avatar
  }

  // Check if it's a URL
  if (/^https?:\/\//i.test(avatarValue)) {
    return { uri: avatarValue };
  }

  // Check if it's a valid avatar ID
  if (avatarMap[avatarValue]) {
    return avatarMap[avatarValue];
  }

  // Fallback to default avatar
  console.warn(`Unknown avatar ID: ${avatarValue}, using default`);
  return avatarMap['avatar-1'];
}

/**
 * Get all available avatar IDs
 */
export function getAvailableAvatarIds(): string[] {
  return Object.keys(avatarMap);
}

/**
 * Check if avatar ID is valid
 */
export function isValidAvatarId(avatarId: string): boolean {
  return avatarId in avatarMap;
}
