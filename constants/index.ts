/**
 * Constants Index
 * 
 * Central export for all constants.
 * 
 * Usage:
 *   import {
 *     Colors,
 *     Spacing,
 *     Typography,
 *     Animations,
 *     API,
 *     TAB_ORDER,
 *     TAB_INDEX_MAP,
 *     TAB_COUNT,
 *     TAB_CONFIG,
 *     SWIPE_ANIMATION_DURATION,
 *     DEFAULT_TAB_INDEX,
 *   } from '@/constants';
 *
 * Navigation exports:
 * - TAB_ORDER/TAB_INDEX_MAP/TAB_COUNT define tab order and index mapping
 * - TAB_CONFIG holds labels/icons
 * - SWIPE_ANIMATION_DURATION and DEFAULT_TAB_INDEX control navigation behavior
 */

export { Animations } from './Animations';
export { API, GameCooldowns } from './Api';
export { Colors } from './Colors';
export { Spacing } from './Spacing';
export { Typography } from './Typography';
export {
  TAB_ORDER,
  TAB_INDEX_MAP,
  TAB_COUNT,
  TAB_CONFIG,
  SWIPE_ANIMATION_DURATION,
  DEFAULT_TAB_INDEX,
} from './Navigation';
