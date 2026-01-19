import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
    StyleSheet,
    TouchableOpacity,
} from 'react-native';

import { Colors } from '@/constants/Colors';

interface CreatePostFABProps {
    onPress: () => void;
}

/**
 * CreatePostFAB Component
 * 
 * Floating Action Button for creating a new community post.
 */
export const CreatePostFAB: React.FC<CreatePostFABProps> = ({ onPress }) => {
    return (
        <TouchableOpacity
            style={styles.fab}
            onPress={onPress}
        >
            <Ionicons name="add" size={24} color={Colors.dark.background} />
        </TouchableOpacity>
    );
};

const styles = StyleSheet.create({
    fab: {
        position: 'absolute',
        right: 20,
        bottom: 30,
        width: 56,
        height: 56,
        borderRadius: 28,
        backgroundColor: Colors.dark.tint,
        alignItems: 'center',
        justifyContent: 'center',
        elevation: 8,
        shadowColor: Colors.dark.tint,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.9,
        shadowRadius: 25,
    },
});
