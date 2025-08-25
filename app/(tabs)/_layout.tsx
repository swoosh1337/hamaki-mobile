import { Tabs } from 'expo-router';
import React from 'react';

import { HapticTab } from '@/components/HapticTab';
import { IconSymbol } from '@/components/ui/IconSymbol';
// Use flat background instead of custom component for now
import { Colors } from '@/constants/Colors';
import { trackTabTap } from '@/utils/analytics';

export default function TabLayout() {

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors.dark.tint, // Always use neon green
        tabBarInactiveTintColor: Colors.dark.tabIconDefault,
        headerShown: false,
        tabBarButton: HapticTab,
        // Flat background (no custom component)
        tabBarStyle: {
          backgroundColor: Colors.dark.background,
          borderTopColor: Colors.dark.tint,
          borderTopWidth: 1,
          height: 90,
          paddingBottom: 20,
          paddingTop: 10,
        },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color }) => <IconSymbol size={24} name="house.fill" color={color} />,
        }}
        listeners={{
          tabPress: () => trackTabTap('Home'),
        }}
      />
      <Tabs.Screen
        name="games"
        options={{
          title: 'Games',
          tabBarIcon: ({ color }) => <IconSymbol size={24} name="gamecontroller.fill" color={color} />,
        }}
        listeners={{
          tabPress: () => trackTabTap('Games'),
        }}
      />
      <Tabs.Screen
        name="leaderboard"
        options={{
          title: 'Leaderboard',
          tabBarIcon: ({ color }) => <IconSymbol size={24} name="trophy.fill" color={color} />,
        }}
        listeners={{
          tabPress: () => trackTabTap('Leaderboard'),
        }}
      />
      <Tabs.Screen
        name="community"
        options={{
          title: 'Community',
          tabBarIcon: ({ color }) => <IconSymbol size={24} name="person.3.fill" color={color} />,
        }}
        listeners={{
          tabPress: () => trackTabTap('Community'),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color }) => <IconSymbol size={24} name="person.fill" color={color} />,
        }}
        listeners={{
          tabPress: () => trackTabTap('Profile'),
        }}
      />
    </Tabs>
  );
}
