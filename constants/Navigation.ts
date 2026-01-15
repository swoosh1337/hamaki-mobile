/**
 * Navigation Constants
 *
 * Centralized constants for tab navigation.
 * No magic values - all navigation config lives here.
 */

import type { TabConfigMap, TabIndexMap, TabName } from '@/types/navigation';

/** Ordered list of tab names matching Expo Router */
export const TAB_ORDER: readonly TabName[] = [
  'index',
  'games',
  'leaderboard',
  'community',
  'profile',
] as const;

/** Tab name to index mapping */
export const TAB_INDEX_MAP: TabIndexMap = {
  index: 0,
  games: 1,
  leaderboard: 2,
  community: 3,
  profile: 4,
} as const;

/** Number of tabs */
export const TAB_COUNT = TAB_ORDER.length;

/** Swipe animation duration in ms */
export const SWIPE_ANIMATION_DURATION = 250;

/** Default initial tab index */
export const DEFAULT_TAB_INDEX = 0;

/** Tab configuration for icons and titles */
export const TAB_CONFIG: TabConfigMap = {
  index: { title: 'Home', icon: 'house.fill' },
  games: { title: 'Games', icon: 'gamecontroller.fill' },
  leaderboard: { title: 'Leaderboard', icon: 'trophy.fill' },
  community: { title: 'Community', icon: 'person.3.fill' },
  profile: { title: 'Profile', icon: 'person.fill' },
} as const;
