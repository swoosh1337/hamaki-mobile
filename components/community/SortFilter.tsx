import React from 'react';
import {
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';

import { Colors } from '@/constants/Colors';
import type { PostSortOption } from '@/types';

interface SortFilterProps {
    sortBy: PostSortOption;
    onSortChange: (sortBy: PostSortOption) => void;
}

/**
 * SortFilter Component
 * 
 * Toggle buttons for sorting posts by "Popular" (upvotes) or "Latest" (date).
 */
export const SortFilter: React.FC<SortFilterProps> = ({
    sortBy,
    onSortChange,
}) => {
    return (
        <View style={styles.sortToggleContainer}>
            <TouchableOpacity
                style={[
                    styles.sortButton,
                    sortBy === 'upvotes' && styles.sortButtonActive
                ]}
                onPress={() => onSortChange('upvotes')}
            >
                <Text style={[
                    styles.sortButtonText,
                    sortBy === 'upvotes' && styles.sortButtonTextActive
                ]}>
                    Popular
                </Text>
            </TouchableOpacity>

            <TouchableOpacity
                style={[
                    styles.sortButton,
                    sortBy === 'latest' && styles.sortButtonActive
                ]}
                onPress={() => onSortChange('latest')}
            >
                <Text style={[
                    styles.sortButtonText,
                    sortBy === 'latest' && styles.sortButtonTextActive
                ]}>
                    Latest
                </Text>
            </TouchableOpacity>
        </View>
    );
};

const styles = StyleSheet.create({
    sortToggleContainer: {
        flexDirection: 'row',
        marginTop: 16,
        marginBottom: 6,
        gap: 8,
    },
    sortButton: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: 'rgba(196, 255, 0, 0.3)',
        backgroundColor: 'transparent',
    },
    sortButtonActive: {
        backgroundColor: Colors.dark.tint,
        borderColor: Colors.dark.tint,
    },
    sortButtonText: {
        fontSize: 14,
        fontFamily: 'SpaceMono',
        color: '#FFFFFF',
        fontWeight: '500',
    },
    sortButtonTextActive: {
        color: Colors.dark.background,
        fontWeight: '600',
    },
});
