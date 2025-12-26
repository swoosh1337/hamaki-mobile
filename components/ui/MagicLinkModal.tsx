/**
 * MagicLinkModal Component
 * 
 * Modal for entering email address to receive magic link.
 * All text in Georgian using HamakiGeo font.
 */

import { Colors } from '@/constants/Colors';
import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import {
    ActivityIndicator,
    KeyboardAvoidingView,
    Modal,
    Platform,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    TouchableWithoutFeedback,
    View,
} from 'react-native';

interface MagicLinkModalProps {
    visible: boolean;
    onClose: () => void;
    onSendLink: (email: string) => Promise<void>;
    isLoading?: boolean;
    error?: string | null;
    success?: boolean;
}

export const MagicLinkModal: React.FC<MagicLinkModalProps> = ({
    visible,
    onClose,
    onSendLink,
    isLoading = false,
    error = null,
    success = false,
}) => {
    const [email, setEmail] = useState('');

    const handleSend = async () => {
        if (email.trim()) {
            await onSendLink(email.trim().toLowerCase());
        }
    };

    const handleClose = () => {
        setEmail('');
        onClose();
    };

    const isValidEmail = (e: string) => {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
    };

    const canSend = email.trim() && isValidEmail(email) && !isLoading;

    return (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            onRequestClose={handleClose}
        >
            <TouchableWithoutFeedback onPress={handleClose}>
                <View style={styles.overlay}>
                    <KeyboardAvoidingView
                        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                        style={styles.keyboardView}
                        keyboardVerticalOffset={Platform.OS === 'ios' ? -100 : 0}
                    >
                        <TouchableWithoutFeedback>
                            <View style={styles.modalContainer}>
                                {/* Close button */}
                                <TouchableOpacity
                                    style={styles.closeButton}
                                    onPress={handleClose}
                                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                                >
                                    <Ionicons name="close" size={24} color={Colors.dark.text} />
                                </TouchableOpacity>

                                {/* Success State */}
                                {success ? (
                                    <View style={styles.successContainer}>
                                        <View style={styles.successIconContainer}>
                                            <Ionicons
                                                name="checkmark-circle"
                                                size={64}
                                                color={Colors.dark.tint}
                                            />
                                        </View>
                                        <Text style={styles.successTitle}>შეამოწმე ელფოსტა!</Text>
                                        <Text style={styles.successText}>
                                            ჩვენ გამოგიგზავნეთ ბმული მისამართზე:{'\n'}
                                            <Text style={styles.emailHighlight}>{email}</Text>
                                        </Text>
                                        <Text style={styles.successSubtext}>
                                            დააჭირე ბმულს შესასვლელად
                                        </Text>
                                        <TouchableOpacity
                                            style={styles.doneButton}
                                            onPress={handleClose}
                                        >
                                            <Text style={styles.doneButtonText}>გასაგებია</Text>
                                        </TouchableOpacity>
                                    </View>
                                ) : (
                                    <>
                                        {/* Header */}
                                        <View style={styles.header}>
                                            <Ionicons
                                                name="mail-outline"
                                                size={48}
                                                color={Colors.dark.tint}
                                            />
                                            <Text style={styles.title}>შესვლა ელფოსტით</Text>
                                            <Text style={styles.subtitle}>
                                                გამოგიგზავნით ბმულს პაროლის გარეშე შესასვლელად
                                            </Text>
                                        </View>

                                        {/* Email Input */}
                                        <View style={styles.inputContainer}>
                                            <TextInput
                                                style={styles.input}
                                                placeholder="შეიყვანე ელფოსტა"
                                                placeholderTextColor="rgba(255, 255, 255, 0.4)"
                                                value={email}
                                                onChangeText={setEmail}
                                                keyboardType="email-address"
                                                autoCapitalize="none"
                                                autoCorrect={false}
                                                autoFocus
                                                editable={!isLoading}
                                            />
                                        </View>

                                        {/* Error Message */}
                                        {error && (
                                            <View style={styles.errorContainer}>
                                                <Ionicons
                                                    name="alert-circle"
                                                    size={16}
                                                    color="#FF6B6B"
                                                />
                                                <Text style={styles.errorText}>{error}</Text>
                                            </View>
                                        )}

                                        {/* Send Button */}
                                        <TouchableOpacity
                                            style={[
                                                styles.sendButton,
                                                !canSend && styles.sendButtonDisabled,
                                            ]}
                                            onPress={handleSend}
                                            disabled={!canSend}
                                        >
                                            {isLoading ? (
                                                <ActivityIndicator color="#0B0C1A" />
                                            ) : (
                                                <Text style={styles.sendButtonText}>
                                                    ბმულის გაგზავნა
                                                </Text>
                                            )}
                                        </TouchableOpacity>
                                    </>
                                )}
                            </View>
                        </TouchableWithoutFeedback>
                    </KeyboardAvoidingView>
                </View>
            </TouchableWithoutFeedback>
        </Modal>
    );
};

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        justifyContent: 'flex-start', // Position at top instead of center
        alignItems: 'center',
        paddingTop: 120, // Give space from top
    },
    keyboardView: {
        width: '100%',
        alignItems: 'center',
    },
    modalContainer: {
        backgroundColor: Colors.dark.background,
        borderRadius: 24,
        padding: 24,
        width: '90%',
        maxWidth: 400,
        borderWidth: 1,
        borderColor: 'rgba(196, 255, 0, 0.2)',
        shadowColor: Colors.dark.tint,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.2,
        shadowRadius: 24,
        elevation: 10,
    },
    closeButton: {
        position: 'absolute',
        top: 16,
        right: 16,
        zIndex: 1,
    },
    header: {
        alignItems: 'center',
        marginBottom: 24,
        marginTop: 8,
    },
    title: {
        fontFamily: 'HamakiGeo',
        fontSize: 22,
        fontWeight: '700',
        color: Colors.dark.text,
        marginTop: 16,
        marginBottom: 8,
    },
    subtitle: {
        fontFamily: 'HamakiGeo',
        fontSize: 14,
        color: 'rgba(255, 255, 255, 0.6)',
        textAlign: 'center',
        lineHeight: 22,
    },
    inputContainer: {
        marginBottom: 16,
    },
    input: {
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: 'rgba(196, 255, 0, 0.3)',
        paddingVertical: 16,
        paddingHorizontal: 20,
        fontSize: 16,
        color: Colors.dark.text,
        fontFamily: 'HamakiEng', // English font for email input
    },
    errorContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 16,
        paddingHorizontal: 4,
    },
    errorText: {
        fontFamily: 'HamakiGeo',
        fontSize: 13,
        color: '#FF6B6B',
        marginLeft: 8,
    },
    sendButton: {
        backgroundColor: Colors.dark.tint,
        borderRadius: 50,
        paddingVertical: 16,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: Colors.dark.tint,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 6,
        elevation: 8,
    },
    sendButtonDisabled: {
        opacity: 0.5,
        shadowOpacity: 0,
    },
    sendButtonText: {
        fontFamily: 'HamakiGeo',
        color: '#0B0C1A',
        fontSize: 18,
        fontWeight: '600',
    },
    // Success state styles
    successContainer: {
        alignItems: 'center',
        paddingVertical: 16,
    },
    successIconContainer: {
        marginBottom: 16,
    },
    successTitle: {
        fontFamily: 'HamakiGeo',
        fontSize: 22,
        fontWeight: '700',
        color: Colors.dark.text,
        marginBottom: 12,
    },
    successText: {
        fontFamily: 'HamakiGeo',
        fontSize: 14,
        color: 'rgba(255, 255, 255, 0.7)',
        textAlign: 'center',
        lineHeight: 22,
        marginBottom: 8,
    },
    emailHighlight: {
        fontFamily: 'HamakiEng', // English font for email
        color: Colors.dark.tint,
        fontWeight: '600',
    },
    successSubtext: {
        fontFamily: 'HamakiGeo',
        fontSize: 13,
        color: 'rgba(255, 255, 255, 0.5)',
        textAlign: 'center',
        marginBottom: 24,
    },
    doneButton: {
        backgroundColor: 'transparent',
        borderRadius: 50,
        borderWidth: 2,
        borderColor: Colors.dark.tint,
        paddingVertical: 14,
        paddingHorizontal: 48,
    },
    doneButtonText: {
        fontFamily: 'HamakiGeo',
        color: Colors.dark.tint,
        fontSize: 16,
        fontWeight: '600',
    },
});
