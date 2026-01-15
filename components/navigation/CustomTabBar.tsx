/**
 * CustomTabBar
 *
 * Custom bottom tab bar component for swipeable navigation.
 * Manages tab state independently from Expo Router.
 */

import React from 'react';
import { StyleSheet, TouchableOpacity, View, Text } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IconSymbol } from '@/components/ui/IconSymbol';
import { Colors } from '@/constants/Colors';
import { TAB_CONFIG, TAB_ORDER } from '@/constants/Navigation';
import type { TabName } from '@/types/navigation';

interface CustomTabBarProps {
  /** Current active tab index */
  currentIndex: number;
  /** Callback when tab is pressed */
  onTabPress: (tabName: TabName, index: number) => void;
}

export function CustomTabBar({ currentIndex, onTabPress }: CustomTabBarProps) {
  const insets = useSafeAreaInsets();

  const handlePress = (tabName: TabName, index: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onTabPress(tabName, index);
  };

  return (
    <View style={[styles.container, { paddingBottom: Math.max(insets.bottom, 20) }]}>
      {TAB_ORDER.map((tabName, index) => {
        const isActive = index === currentIndex;
        const config = TAB_CONFIG[tabName];

        return (
          <TouchableOpacity
            key={tabName}
            style={styles.tab}
            onPress={() => handlePress(tabName, index)}
            activeOpacity={0.7}
          >
            <IconSymbol
              size={24}
              name={config.icon as any}
              color={isActive ? Colors.dark.tint : Colors.dark.tabIconDefault}
            />
            <Text
              style={[
                styles.label,
                { color: isActive ? Colors.dark.tint : Colors.dark.tabIconDefault },
              ]}
            >
              {config.title}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: Colors.dark.background,
    borderTopColor: Colors.dark.tint,
    borderTopWidth: 1,
    paddingTop: 10,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
  },
  label: {
    fontSize: 10,
    marginTop: 4,
    fontFamily: 'SpaceMono',
  },
});
