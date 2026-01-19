import React, { useEffect, useRef } from 'react';
import { Animated, Dimensions, Easing, Image, StyleSheet, View } from 'react-native';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Miro walking animation frames
const MIRO_FRAMES = [
    require('@/features/games/noPogod/assets/miro/ნაბიჯი 1.webp'),
    require('@/features/games/noPogod/assets/miro/ნაბიჯი 2.webp'),
];

const MIRO_SIZE = 120;
const WALK_RANGE = SCREEN_WIDTH * 0.5; // Walk across 50% of screen

interface AnimatedMiroLoaderProps {
    size?: number;
}

export const AnimatedMiroLoader: React.FC<AnimatedMiroLoaderProps> = ({
    size = MIRO_SIZE
}) => {
    const positionAnim = useRef(new Animated.Value(0)).current;
    const frameIndex = useRef(0);
    const [currentFrame, setCurrentFrame] = React.useState(0);
    const [facingRight, setFacingRight] = React.useState(true);

    // Walking animation - move left and right
    useEffect(() => {
        const walkAnimation = Animated.loop(
            Animated.sequence([
                // Walk right
                Animated.timing(positionAnim, {
                    toValue: 1,
                    duration: 2000,
                    easing: Easing.linear,
                    useNativeDriver: true,
                }),
                // Walk left
                Animated.timing(positionAnim, {
                    toValue: 0,
                    duration: 2000,
                    easing: Easing.linear,
                    useNativeDriver: true,
                }),
            ])
        );

        walkAnimation.start();

        return () => walkAnimation.stop();
    }, [positionAnim]);

    // Frame animation - alternate between walk frames
    useEffect(() => {
        const frameInterval = setInterval(() => {
            frameIndex.current = (frameIndex.current + 1) % MIRO_FRAMES.length;
            setCurrentFrame(frameIndex.current);
        }, 200); // Switch frames every 200ms

        return () => clearInterval(frameInterval);
    }, []);

    // Update facing direction based on position animation
    useEffect(() => {
        const listener = positionAnim.addListener(({ value }) => {
            // Facing right when moving from 0 to 1, left when moving from 1 to 0
            // We can detect direction by tracking value changes
        });

        return () => positionAnim.removeListener(listener);
    }, [positionAnim]);

    // Listen for direction changes
    useEffect(() => {
        let lastValue = 0;
        const id = positionAnim.addListener(({ value }) => {
            if (value > lastValue) {
                setFacingRight(true);
            } else if (value < lastValue) {
                setFacingRight(false);
            }
            lastValue = value;
        });

        return () => positionAnim.removeListener(id);
    }, [positionAnim]);

    const translateX = positionAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [-WALK_RANGE / 2, WALK_RANGE / 2],
    });

    return (
        <View style={styles.container}>
            <Animated.View
                style={[
                    styles.miroContainer,
                    {
                        transform: [
                            { translateX },
                            { scaleX: facingRight ? 1 : -1 }, // Flip horizontally when walking left
                        ],
                    },
                ]}
            >
                <Image
                    source={MIRO_FRAMES[currentFrame]}
                    style={[styles.miro, { width: size, height: size }]}
                    resizeMode="contain"
                />
            </Animated.View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        alignItems: 'center',
        justifyContent: 'center',
        height: MIRO_SIZE + 20,
    },
    miroContainer: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    miro: {
        width: MIRO_SIZE,
        height: MIRO_SIZE,
    },
});

export default AnimatedMiroLoader;
