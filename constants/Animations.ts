/**
 * Animation Constants
 * 
 * Consistent animation durations and easing functions.
 */

export const Animations = {
    durations: {
        /** 100ms - instant feedback */
        instant: 100,
        /** 200ms - fast transitions */
        fast: 200,
        /** 300ms - normal transitions */
        normal: 300,
        /** 500ms - slow/emphasized transitions */
        slow: 500,
        /** 1000ms - very slow transitions */
        verySlow: 1000,
    },

    /** Common spring configurations for react-native-reanimated */
    springs: {
        gentle: {
            damping: 20,
            stiffness: 90,
            mass: 1,
        },
        bouncy: {
            damping: 10,
            stiffness: 100,
            mass: 0.8,
        },
        stiff: {
            damping: 30,
            stiffness: 300,
            mass: 1,
        },
    },
} as const;

export type AnimationDuration = keyof typeof Animations.durations;
export type SpringConfig = keyof typeof Animations.springs;
