/**
 * Avatar Utilities
 * Maps avatar IDs to local image sources
 */

import type { ImageSourcePropType } from 'react-native';

import { createLogger } from '@/utils/logger';

const log = createLogger('Avatars');

// Avatar ID to local image source mapping
const avatarMap: Record<string, ImageSourcePropType> = {
  'avatar-1': require('@/assets/avatars/1.webp'),
  'avatar-2': require('@/assets/avatars/2.webp'),
  'avatar-3': require('@/assets/avatars/3.webp'),
  'avatar-4': require('@/assets/avatars/4.webp'),
  'avatar-5': require('@/assets/avatars/5.webp'),
  'avatar-6': require('@/assets/avatars/6.webp'),
  'avatar-7': require('@/assets/avatars/7.webp'),
  'avatar-8': require('@/assets/avatars/8.webp'),
  'avatar-9': require('@/assets/avatars/9.webp'),
  'avatar-10': require('@/assets/avatars/Layer_2.webp'),
  'avatar-11': require('@/assets/avatars/Layer_3.webp'),
  'avatar-12': require('@/assets/avatars/Layer_4.webp'),
  'avatar-13': require('@/assets/avatars/Layer_5.webp'),
  'avatar-14': require('@/assets/avatars/Layer_6.webp'),
  'avatar-15': require('@/assets/avatars/Layer_7.webp'),
  'avatar-16': require('@/assets/avatars/Layer_8.webp'),
  'avatar-17': require('@/assets/avatars/Layer_9.webp'),
  'avatar-18': require('@/assets/avatars/Layer_10.webp'),
};

/**
 * Get avatar source from avatar ID or URL
 * @param avatarValue - Avatar ID (e.g., 'avatar-1') or URL
 * @returns Local require() source or { uri: url } object
 */
export function getAvatarSource(avatarValue: string | null | undefined): ImageSourcePropType {
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
  log.warn('Unknown avatar ID, using default', { avatarValue });
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
