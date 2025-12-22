import React from 'react';
import {
    StyleSheet,
    Text,
    View
} from 'react-native';

import { XPStatsSkeleton } from '@/components/ui/SkeletonLoader';
import { Colors } from '@/constants/Colors';
import type { XPStats } from '@/types/user';

interface StatsCardProps {
    xpStats: XPStats | null;
    isLoading: boolean;
}

/**
 * StatsCard Component
 * 
 * Displays user XP statistics including weekly and total XP points.
 */
export const StatsCard: React.FC<StatsCardProps> = ({
    xpStats,
    isLoading,
}) => {
    if (isLoading) {
        return <XPStatsSkeleton />;
    }

    return (
        <>
            <View style={styles.statItem}>
                <Text style={styles.statLabel}>This Week:</Text>
                <Text style={styles.statValue}>
                    {`${(xpStats?.weeklyXP || 0).toLocaleString()} XP`}
                </Text>
            </View>

            <View style={styles.statItem}>
                <Text style={styles.statLabel}>Total:</Text>
                <Text style={styles.statValue}>
                    {`${(xpStats?.totalXP || 0).toLocaleString()} XP`}
                </Text>
            </View>
        </>
    );
};

const styles = StyleSheet.create({
    statItem: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 15,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(196, 255, 0, 0.2)',
    },
    statLabel: {
        fontSize: 16,
        fontFamily: 'SpaceMono',
        color: Colors.dark.text,
    },
    statValue: {
        fontSize: 16,
        fontFamily: 'SpaceMono',
        color: Colors.dark.tint,
        fontWeight: 'bold',
    },
});
