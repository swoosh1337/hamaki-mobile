import React from 'react';
import {
  StyleSheet,
  Text,
  View,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';

interface XPDisplayProps {
  totalXP: number;
  weeklyXP: number;
  isLoading?: boolean;
}

const WEEKLY_XP_GOAL = 500; // Weekly XP goal for progress calculation

export const XPDisplay: React.FC<XPDisplayProps> = ({
  totalXP,
  weeklyXP,
  isLoading = false,
}) => {
  // Format numbers with commas
  const formatNumber = (num: number): string => {
    return num.toLocaleString();
  };

  // Calculate weekly progress percentage (capped at 100%)
  const weeklyProgressPercentage = Math.min((weeklyXP / WEEKLY_XP_GOAL) * 100, 100);

  if (isLoading) {
    return (
      <View style={styles.container} testID="xp-display-container">
        <Text style={styles.title}>Experience Points</Text>
        <View style={styles.loadingContainer} testID="xp-display-loading">
          <ActivityIndicator size="large" color={Colors.dark.tint} />
          <Text style={styles.loadingText}>Loading XP stats...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container} testID="xp-display-container">
      <Text style={styles.title}>Experience Points</Text>
      
      <View style={styles.statsContainer}>
        {/* Total XP */}
        <View 
          style={styles.statItem}
          testID="total-xp-display"
          accessibilityLabel={`Total XP: ${totalXP} points`}
          accessibilityRole="text"
        >
          <View style={styles.statHeader}>
            <Ionicons
              name="trophy"
              size={24}
              color={Colors.dark.icon}
              testID="total-xp-icon"
            />
            <Text style={styles.statLabel}>Total XP</Text>
          </View>
          <Text style={styles.totalXPValue}>{formatNumber(totalXP)}</Text>
        </View>

        {/* Weekly XP */}
        <View 
          style={styles.statItem}
          testID="weekly-xp-display"
          accessibilityLabel={`Weekly XP: ${weeklyXP} points`}
          accessibilityRole="text"
        >
          <View style={styles.statHeader}>
            <Ionicons
              name="flash"
              size={24}
              color={Colors.dark.tint}
              testID="weekly-xp-icon"
            />
            <Text style={styles.statLabel}>This Week</Text>
          </View>
          <Text 
            style={styles.weeklyXPValue} 
            testID="weekly-xp-value"
          >
            {formatNumber(weeklyXP)}
          </Text>
          
          {/* Weekly Progress Indicator */}
          <View 
            style={styles.progressContainer}
            testID="weekly-progress-indicator"
          >
            <View style={styles.progressTrack}>
              <View
                style={[
                  styles.progressBar,
                  { width: `${weeklyProgressPercentage}%` },
                ]}
                testID="weekly-progress-bar"
              />
            </View>
            <Text style={styles.progressText}>
              Goal: {formatNumber(WEEKLY_XP_GOAL)} XP
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.dark.background,
    borderRadius: 16,
    padding: 20,
    marginVertical: 16,
  },
  title: {
    color: Colors.dark.text,
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 20,
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 16,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
    padding: 16,
    backgroundColor: 'rgba(245, 245, 245, 0.05)',
    borderRadius: 12,
  },
  statHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,
  },
  statLabel: {
    color: Colors.dark.text,
    fontSize: 14,
    fontWeight: '500',
  },
  totalXPValue: {
    color: Colors.dark.text,
    fontSize: 28,
    fontWeight: '700',
    textAlign: 'center',
  },
  weeklyXPValue: {
    color: Colors.dark.tint,
    fontSize: 28,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 12,
  },
  progressContainer: {
    width: '100%',
    alignItems: 'center',
  },
  progressTrack: {
    width: '100%',
    height: 6,
    backgroundColor: 'rgba(245, 245, 245, 0.2)',
    borderRadius: 3,
    marginBottom: 6,
  },
  progressBar: {
    height: '100%',
    backgroundColor: Colors.dark.tint,
    borderRadius: 3,
  },
  progressText: {
    color: Colors.dark.tabIconDefault,
    fontSize: 12,
    fontWeight: '400',
  },
  loadingContainer: {
    alignItems: 'center',
    padding: 40,
  },
  loadingText: {
    color: Colors.dark.text,
    fontSize: 16,
    marginTop: 16,
    textAlign: 'center',
  },
});