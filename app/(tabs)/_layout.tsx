/**
 * Tab Layout with Instagram-like Swipe Navigation
 *
 * Uses PagerView for horizontal swiping between tabs
 * with a custom tab bar that stays synced with swipe gestures.
 */

import React, { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  CustomTabBar,
  SwipeableTabNavigator,
  TabPageContent,
} from '@/components/navigation';
import { Colors } from '@/constants/Colors';
import { TAB_CONFIG, TAB_ORDER } from '@/constants/Navigation';
import { useTabNavigation } from '@/hooks/useTabNavigation';
import type { TabName } from '@/types/navigation';
import { trackTabTap } from '@/utils/analytics';
import { createLogger } from '@/utils/logger';

import CommunityScreen from './community';
import GamesScreen from './games';
import HomeScreen from './index';
import LeaderboardScreen from './leaderboard';
import ProfileScreen from './profile';

const log = createLogger('TabLayout');

export default function TabLayout() {
  const [visitedTabs, setVisitedTabs] = useState<Set<TabName>>(new Set(['index']));

  const { state, pagerRef, navigateToTab, handlePageSelected, handlePageScroll } =
    useTabNavigation({
      initialTab: 'index',
      onTabChange: (tab) => {
        log.debug('Tab changed via swipe', { tab });
        trackTabTap(TAB_CONFIG[tab].title);
        setVisitedTabs((prev) => new Set([...prev, tab]));
      },
    });

  const handleTabPress = useCallback(
    (tabName: TabName) => {
      log.debug('Tab pressed', { tabName });
      navigateToTab(tabName);
      trackTabTap(TAB_CONFIG[tabName].title);
      setVisitedTabs((prev) => new Set([...prev, tabName]));
    },
    [navigateToTab]
  );

  return (
    <View style={styles.container}>
      <SwipeableTabNavigator
        currentIndex={state.currentIndex}
        pagerRef={pagerRef}
        onPageSelected={handlePageSelected}
        onPageScroll={handlePageScroll}
      >
        {TAB_ORDER.map((tabName) => (
          <TabPageContent
            key={tabName}
            isActive={state.currentTab === tabName}
            hasBeenActive={visitedTabs.has(tabName)}
            lazy
          >
            {tabName === 'index' && <HomeScreen />}
            {tabName === 'games' && <GamesScreen />}
            {tabName === 'leaderboard' && <LeaderboardScreen />}
            {tabName === 'community' && <CommunityScreen />}
            {tabName === 'profile' && <ProfileScreen />}
          </TabPageContent>
        ))}
      </SwipeableTabNavigator>

      <CustomTabBar
        currentIndex={state.currentIndex}
        onTabPress={handleTabPress}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.background,
  },
});
