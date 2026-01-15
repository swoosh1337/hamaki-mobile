/**
 * Navigation Types
 *
 * Type definitions for swipeable tab navigation.
 */

/** Tab identifiers matching Expo Router tab names */
export type TabName = 'index' | 'games' | 'leaderboard' | 'community' | 'profile';

/** Tab index mapping for pager view */
export type TabIndexMap = {
  readonly [key in TabName]: number;
};

/** Tab navigation state */
export interface TabNavigationState {
  currentIndex: number;
  currentTab: TabName;
  isAnimating: boolean;
}

/** Props for swipeable tab content */
export interface SwipeableTabContentProps {
  tabName: TabName;
  isActive: boolean;
  children: React.ReactNode;
  lazy?: boolean;
  hasBeenActive?: boolean;
}

/** Tab configuration */
export interface TabConfig {
  title: string;
  icon: string;
}

/** Tab configuration map */
export type TabConfigMap = {
  readonly [key in TabName]: TabConfig;
};
