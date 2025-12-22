/**
 * Magic Link Callback Handler
 *
 * This route handles the deep link callback from Supabase magic links.
 * The actual authentication is handled by AuthContext's deep link listener.
 * This page just shows a loading state while processing.
 */

import { Colors } from '@/constants/Colors';
import { useAuth } from '@/contexts/AuthContext';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export default function AuthCallback() {
    const { isAuthenticated, isLoading, error } = useAuth();
    const [showError, setShowError] = useState(false);

    useEffect(() => {
        // If authenticated, redirect to main app
        if (isAuthenticated) {
            router.replace('/(tabs)');
        }
        // If there's an error, show it
        else if (error) {
            setShowError(true);
        }
        // If not loading and not authenticated, wait a bit then redirect
        else if (!isLoading && !isAuthenticated) {
            const timeout = setTimeout(() => {
                if (!isAuthenticated) {
                    router.replace('/auth');
                }
            }, 3000);
            return () => clearTimeout(timeout);
        }
    }, [isAuthenticated, isLoading, error]);

    const handleRetry = () => {
        router.replace('/auth');
    };

    // Show error state for expired/invalid links
    if (showError || error) {
        const isExpired = error?.includes('expired') || error?.includes('invalid');

        return (
            <View style={styles.container}>
                <Ionicons
                    name={isExpired ? 'time-outline' : 'alert-circle-outline'}
                    size={64}
                    color="#FF6B6B"
                />
                <Text style={styles.errorTitle}>
                    {isExpired ? 'ბმულს ვადა გაუვიდა' : 'შეცდომა'}
                </Text>
                <Text style={styles.errorText}>
                    {isExpired
                        ? 'ეს ბმული უკვე გამოყენებული ან ვადაგასულია. გთხოვთ მოითხოვოთ ახალი ბმული.'
                        : error || 'დაფიქსირდა შეცდომა'}
                </Text>
                <TouchableOpacity style={styles.retryButton} onPress={handleRetry}>
                    <Text style={styles.retryButtonText}>თავიდან სცადე</Text>
                </TouchableOpacity>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <ActivityIndicator size="large" color={Colors.dark.tint} />
            <Text style={styles.text}>იტვირთება...</Text>
            <Text style={styles.subtext}>გთხოვთ დაელოდოთ</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.dark.background,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
    },
    text: {
        fontFamily: 'HamakiGeo',
        fontSize: 18,
        color: Colors.dark.text,
        marginTop: 20,
        textAlign: 'center',
    },
    subtext: {
        fontFamily: 'HamakiGeo',
        fontSize: 14,
        color: 'rgba(255, 255, 255, 0.6)',
        marginTop: 8,
        textAlign: 'center',
    },
    errorTitle: {
        fontFamily: 'HamakiGeo',
        fontSize: 24,
        fontWeight: '700',
        color: Colors.dark.text,
        marginTop: 20,
        textAlign: 'center',
    },
    errorText: {
        fontFamily: 'HamakiGeo',
        fontSize: 16,
        color: 'rgba(255, 255, 255, 0.7)',
        marginTop: 12,
        textAlign: 'center',
        lineHeight: 24,
        paddingHorizontal: 20,
    },
    retryButton: {
        marginTop: 32,
        backgroundColor: Colors.dark.tint,
        paddingVertical: 16,
        paddingHorizontal: 48,
        borderRadius: 50,
    },
    retryButtonText: {
        fontFamily: 'HamakiGeo',
        fontSize: 18,
        fontWeight: '600',
        color: '#0B0C1A',
    },
});
