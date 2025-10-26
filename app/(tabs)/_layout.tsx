import { Tabs } from 'expo-router';
import React from 'react';
import { Image } from 'react-native';

import { HapticTab } from '@/components/HapticTab';
import { IconSymbol } from '@/components/ui/IconSymbol';
// Use flat background instead of custom component for now
import { Colors } from '@/constants/Colors';
import { trackTabTap } from '@/utils/analytics';

// Custom icon components for image-based icons
const GamesIcon = ({ color, size = 24 }: { color: string; size?: number }) => (
  <Image
    source={require('@/assets/images/mini_games.png')}
    style={{ width: size, height: size, tintColor: color }}
    resizeMode="contain"
  />
);

const CommunityIcon = ({ color, size = 24 }: { color: string; size?: number }) => (
  <Image
    source={require('@/assets/images/community.png')}
    style={{ width: size, height: size, tintColor: color }}
    resizeMode="contain"
  />
);

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
          tabBarIcon: ({ color }) => <GamesIcon color={color} size={24} />,
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
          tabBarIcon: ({ color }) => <CommunityIcon color={color} size={24} />,
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
