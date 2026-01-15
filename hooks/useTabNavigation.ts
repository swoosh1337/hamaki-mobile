/**
 * useTabNavigation Hook
 *
 * Manages synchronization between swipe gestures and tab bar state.
 * Acts as the single source of truth for current tab position.
 */

import { useCallback, useRef, useState } from 'react';
import type PagerView from 'react-native-pager-view';

import { TAB_INDEX_MAP, TAB_ORDER } from '@/constants/Navigation';
import type { TabName, TabNavigationState } from '@/types/navigation';
import { createLogger } from '@/utils/logger';

const log = createLogger('Hook:TabNavigation');

interface UseTabNavigationOptions {
  /** Initial tab to display */
  initialTab?: TabName;
  /** Callback when tab changes */
  onTabChange?: (tab: TabName, index: number) => void;
}

interface UseTabNavigationReturn {
  /** Current navigation state */
  state: TabNavigationState;
  /** Ref to attach to PagerView */
  pagerRef: React.RefObject<PagerView | null>;
  /** Navigate to specific tab by name */
  navigateToTab: (tab: TabName) => void;
  /** Navigate to specific tab by index */
  navigateToIndex: (index: number) => void;
  /** Handle page selected event from PagerView */
  handlePageSelected: (index: number) => void;
  /** Handle page scroll event from PagerView */
  handlePageScroll: (position: number, offset: number) => void;
  /** Get tab name from index */
  getTabName: (index: number) => TabName;
}

export function useTabNavigation(
  options: UseTabNavigationOptions = {}
): UseTabNavigationReturn {
  const { initialTab = 'index', onTabChange } = options;

  const pagerRef = useRef<PagerView>(null);

  const [state, setState] = useState<TabNavigationState>({
    currentIndex: TAB_INDEX_MAP[initialTab],
    currentTab: initialTab,
    isAnimating: false,
  });

  /**
   * Get tab name from index
   */
  const getTabName = useCallback((index: number): TabName => {
    return TAB_ORDER[index] ?? 'index';
  }, []);

  /**
   * Navigate to tab by name (programmatic)
   */
  const navigateToTab = useCallback((tab: TabName) => {
    const index = TAB_INDEX_MAP[tab];
    log.debug('Navigating to tab', { tab, index });

    pagerRef.current?.setPage(index);

    setState((prev) => ({
      ...prev,
      currentIndex: index,
      currentTab: tab,
      isAnimating: true,
    }));
  }, []);

  /**
   * Navigate to tab by index (programmatic)
   */
  const navigateToIndex = useCallback(
    (index: number) => {
      const tab = getTabName(index);
      navigateToTab(tab);
    },
    [getTabName, navigateToTab]
  );

  /**
   * Handle PagerView page selected event (after swipe completes)
   */
  const handlePageSelected = useCallback(
    (index: number) => {
      const tab = getTabName(index);
      log.debug('Page selected', { index, tab });

      setState({
        currentIndex: index,
        currentTab: tab,
        isAnimating: false,
      });

      onTabChange?.(tab, index);
    },
    [getTabName, onTabChange]
  );

  /**
   * Handle PagerView page scroll event (during swipe)
   */
  const handlePageScroll = useCallback((position: number, offset: number) => {
    const isAnimating = offset !== 0;

    setState((prev) => {
      if (prev.isAnimating !== isAnimating) {
        return { ...prev, isAnimating };
      }
      return prev;
    });
  }, []);

  return {
    state,
    pagerRef,
    navigateToTab,
    navigateToIndex,
    handlePageSelected,
    handlePageScroll,
    getTabName,
  };
}
