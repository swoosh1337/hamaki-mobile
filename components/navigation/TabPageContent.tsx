/**
 * TabPageContent
 *
 * Wrapper component for individual tab content within SwipeableTabNavigator.
 * Handles lazy loading and provides context for nested components.
 */

import React, { memo, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

interface TabPageContentProps {
  /** Whether this tab is currently active */
  isActive: boolean;
  /** Tab content */
  children: React.ReactNode;
  /** Whether to enable lazy loading */
  lazy?: boolean;
  /** Whether content has been loaded at least once */
  hasBeenActive?: boolean;
}

function TabPageContentComponent({
  children,
  lazy = false,
  isActive,
  hasBeenActive = false,
}: TabPageContentProps) {
  const shouldRender = useMemo(() => {
    if (!lazy) return true;
    return isActive || hasBeenActive;
  }, [lazy, isActive, hasBeenActive]);

  if (!shouldRender) {
    return null;
  }

  return <View style={styles.container}>{children}</View>;
}

export const TabPageContent = memo(TabPageContentComponent);

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
