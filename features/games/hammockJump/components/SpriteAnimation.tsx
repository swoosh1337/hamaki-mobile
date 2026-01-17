/**
 * SpriteAnimation Component
 *
 * Plays a sprite animation by cycling through frames.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Image, StyleSheet } from 'react-native';

interface SpriteAnimationProps {
    frames: number[]; // Array of require() image sources
    isPlaying: boolean;
    onAnimationEnd?: () => void;
    frameDuration?: number; // Duration per frame in ms
    size?: number;
    style?: object;
}

export const SpriteAnimation: React.FC<SpriteAnimationProps> = ({
    frames,
    isPlaying,
    onAnimationEnd,
    frameDuration = 80, // 80ms per frame for smooth animation
    size = 200,
    style,
}) => {
    const [currentFrame, setCurrentFrame] = useState(0);
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const animationRef = useRef<NodeJS.Timeout | null>(null);

    const startAnimation = useCallback(() => {
        setCurrentFrame(0);

        // Fade in
        Animated.timing(fadeAnim, {
            toValue: 1,
            duration: 150,
            useNativeDriver: true,
        }).start();

        let frame = 0;
        animationRef.current = setInterval(() => {
            frame++;
            if (frame >= frames.length) {
                // Animation complete
                if (animationRef.current) {
                    clearInterval(animationRef.current);
                    animationRef.current = null;
                }

                // Fade out
                Animated.timing(fadeAnim, {
                    toValue: 0,
                    duration: 200,
                    useNativeDriver: true,
                }).start(() => {
                    onAnimationEnd?.();
                });
            } else {
                setCurrentFrame(frame);
            }
        }, frameDuration);
    }, [frames.length, frameDuration, fadeAnim, onAnimationEnd]);

    useEffect(() => {
        if (isPlaying) {
            startAnimation();
        }

        return () => {
            if (animationRef.current) {
                clearInterval(animationRef.current);
                animationRef.current = null;
            }
        };
    }, [isPlaying, startAnimation]);

    if (!isPlaying && fadeAnim._value === 0) {
        return null;
    }

    return (
        <Animated.View
            style={[
                styles.container,
                style,
                { opacity: fadeAnim },
            ]}
            pointerEvents="none"
        >
            <Image
                source={frames[currentFrame]}
                style={[styles.sprite, { width: size, height: size }]}
                resizeMode="contain"
            />
        </Animated.View>
    );
};

const styles = StyleSheet.create({
    container: {
        position: 'absolute',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 100,
    },
    sprite: {
        width: 200,
        height: 200,
    },
});

export default SpriteAnimation;
