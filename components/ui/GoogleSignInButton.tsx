/**
 * GoogleSignInButton Component
 * 
 * Styled button for Google OAuth authentication with neon cyberpunk glow effect.
 * Features animated electricity/shine sweep effect.
 */

import { Colors } from '@/constants/Colors';
import { AntDesign } from '@expo/vector-icons';
import React, { useEffect, useRef } from 'react';
import {
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

interface GoogleSignInButtonProps {
  onPress: () => void;
}

export const GoogleSignInButton: React.FC<GoogleSignInButtonProps> = ({
  onPress,
}) => {
  // Animation for the electricity/shine sweep effect
  const shineAnim = useRef(new Animated.Value(-1)).current;
  // Glow pulse animation
  const glowAnim = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    // Shine sweep animation - moves from left to right
    const shineAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(shineAnim, {
          toValue: 2,
          duration: 2000,
          useNativeDriver: true,
        }),
        Animated.delay(1000),
        Animated.timing(shineAnim, {
          toValue: -1,
          duration: 0,
          useNativeDriver: true,
        }),
      ])
    );

    // Glow pulse animation
    const glowAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, {
          toValue: 0.6,
          duration: 1500,
          useNativeDriver: true,
        }),
        Animated.timing(glowAnim, {
          toValue: 0.3,
          duration: 1500,
          useNativeDriver: true,
        }),
      ])
    );

    // Use optional chaining for test environment compatibility
    shineAnimation?.start();
    glowAnimation?.start();

    return () => {
      shineAnimation?.stop();
      glowAnimation?.stop();
    };
  }, [shineAnim, glowAnim]);

  return (
    <View style={styles.container}>
      {/* Outer glow layer */}
      <Animated.View
        style={[
          styles.glowLayer,
          { opacity: glowAnim }
        ]}
      />

      <TouchableOpacity
        style={styles.button}
        onPress={onPress}
        activeOpacity={0.8}
        testID="google-sign-in-button"
      >
        {/* Animated shine/electricity effect - using View instead of LinearGradient */}
        <Animated.View
          style={[
            styles.shineOverlay,
            {
              transform: [
                {
                  translateX: shineAnim.interpolate({
                    inputRange: [-1, 2],
                    outputRange: [-200, 400],
                  }),
                },
              ],
            },
          ]}
        />

        {/* Button content */}
        <View style={styles.contentContainer}>
          <AntDesign name="google" size={24} color="#0B0C1A" style={styles.googleIcon} />
          <Text style={styles.buttonText}>
            <Text style={styles.englishText}>Google</Text>
            <Text style={styles.georgianText}>-ით გაგრძელება</Text>
          </Text>
        </View>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    position: 'relative',
  },
  glowLayer: {
    position: 'absolute',
    top: -4,
    left: -4,
    right: -4,
    bottom: -4,
    borderRadius: 54,
    backgroundColor: Colors.dark.tint,
    shadowColor: Colors.dark.tint,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 20,
    elevation: 15,
  },
  button: {
    backgroundColor: Colors.dark.tint, // Neon green
    borderRadius: 50,
    paddingVertical: 16,
    paddingHorizontal: 24,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    // Inner shadow for depth
    shadowColor: '#FFFFFF',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 8,
  },
  shineOverlay: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 60,
    backgroundColor: 'rgba(255, 255, 255, 0.35)',
    // Slight blur effect for the shine
    borderRadius: 30,
  },
  contentContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  googleIcon: {
    marginRight: 12,
  },
  buttonText: {
    color: '#0B0C1A', // Dark navy
    fontSize: 18,
    fontWeight: '600',
  },
  englishText: {
    fontFamily: 'SpaceMono',
    color: '#0B0C1A',
    fontSize: 18,
    fontWeight: '600',
  },
  georgianText: {
    fontFamily: 'SpaceMono',
    color: '#0B0C1A',
    fontSize: 18,
    fontWeight: '600',
  },
});
