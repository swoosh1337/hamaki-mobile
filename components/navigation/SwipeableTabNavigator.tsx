/**
 * SwipeableTabNavigator
 *
 * Provides Instagram-like horizontal swipe navigation between tabs.
 * Wraps tab content in a PagerView while keeping the bottom tab bar synced.
 *
 * Pure UI component - receives all data via props.
 */

import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import PagerView, {
  PageScrollStateChangedNativeEvent,
  PagerViewOnPageScrollEvent,
  PagerViewOnPageSelectedEvent,
} from 'react-native-pager-view';

import { TAB_COUNT } from '@/constants/Navigation';
import { createLogger } from '@/utils/logger';

const log = createLogger('SwipeableTabNavigator');

interface SwipeableTabNavigatorProps {
  /** Tab content components in order */
  children: React.ReactNode[];
  /** Current active tab index */
  currentIndex: number;
  /** Ref to PagerView for programmatic navigation */
  pagerRef: React.RefObject<PagerView | null>;
  /** Callback when page is selected */
  onPageSelected: (index: number) => void;
  /** Callback during page scroll */
  onPageScroll?: (position: number, offset: number) => void;
  /** Callback when scroll state changes */
  onPageScrollStateChanged?: (state: 'idle' | 'dragging' | 'settling') => void;
  /** Whether swipe is enabled */
  swipeEnabled?: boolean;
}

export function SwipeableTabNavigator({
  children,
  currentIndex,
  pagerRef,
  onPageSelected,
  onPageScroll,
  onPageScrollStateChanged,
  swipeEnabled = true,
}: SwipeableTabNavigatorProps) {
  useEffect(() => {
    const childCount = React.Children.count(children);
    if (childCount !== TAB_COUNT) {
      log.warn('Child count mismatch', { expected: TAB_COUNT, received: childCount });
    }
  }, [children]);

  const handlePageSelected = (event: PagerViewOnPageSelectedEvent) => {
    const { position } = event.nativeEvent;
    log.debug('Page selected', { position });
    onPageSelected(position);
  };

  const handlePageScroll = (event: PagerViewOnPageScrollEvent) => {
    const { position, offset } = event.nativeEvent;
    onPageScroll?.(position, offset);
  };

  const handlePageScrollStateChanged = (event: PageScrollStateChangedNativeEvent) => {
    const { pageScrollState } = event.nativeEvent;
    onPageScrollStateChanged?.(pageScrollState);
  };

  return (
    // PagerView is intentionally uncontrolled after mount: initialPage uses currentIndex once,
    // and parent-driven navigation should use pagerRef.current.setPage(...) while these handlers keep state in sync.
    <PagerView
      ref={pagerRef}
      style={styles.container}
      initialPage={currentIndex}
      scrollEnabled={swipeEnabled}
      onPageSelected={handlePageSelected}
      onPageScroll={handlePageScroll}
      onPageScrollStateChanged={handlePageScrollStateChanged}
      overdrag={false}
      offscreenPageLimit={1}
    >
      {React.Children.map(children, (child, index) => (
        <View key={index} style={styles.page}>
          {child}
        </View>
      ))}
    </PagerView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  page: {
    flex: 1,
  },
});
