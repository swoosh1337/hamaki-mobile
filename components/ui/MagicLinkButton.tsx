/**
 * MagicLinkButton Component
 * 
 * A styled button for email magic link authentication.
 * Uses HamakiGeo font for Georgian text.
 */

import { Colors } from '@/constants/Colors';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface MagicLinkButtonProps {
    onPress: () => void;
    disabled?: boolean;
}

export const MagicLinkButton: React.FC<MagicLinkButtonProps> = ({
    onPress,
    disabled = false,
}) => {
    return (
        <TouchableOpacity
            style={[styles.button, disabled && styles.buttonDisabled]}
            onPress={onPress}
            activeOpacity={0.8}
            disabled={disabled}
            testID="magic-link-button"
        >
            <View style={styles.contentContainer}>
                <Ionicons
                    name="mail-outline"
                    size={24}
                    color={disabled ? 'rgba(196, 255, 0, 0.5)' : Colors.dark.tint}
                    style={styles.icon}
                />
                <Text style={[styles.buttonText, disabled && styles.buttonTextDisabled]}>
                    ელფოსტით გაგრძელება
                </Text>
            </View>
        </TouchableOpacity>
    );
};

const styles = StyleSheet.create({
    button: {
        backgroundColor: 'transparent',
        borderRadius: 50,
        borderWidth: 2,
        borderColor: Colors.dark.tint, // Neon green border
        paddingVertical: 16,
        paddingHorizontal: 24,
        width: '100%',
        alignItems: 'center',
        justifyContent: 'center',
    },
    buttonDisabled: {
        opacity: 0.5,
        borderColor: 'rgba(196, 255, 0, 0.5)',
    },
    contentContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
    },
    icon: {
        marginRight: 12,
    },
    buttonText: {
        color: Colors.dark.tint, // Neon green text
        fontSize: 18,
        fontWeight: '600',
        fontFamily: 'SpaceMono',
    },
    buttonTextDisabled: {
        color: 'rgba(196, 255, 0, 0.5)',
    },
});
