/**
 * Typography Constants
 * 
 * Font families, sizes, and weights used throughout the app.
 */

export const Typography = {
    fonts: {
        heading: 'HamakiGeo',
        body: 'SpaceMono',
        mono: 'SpaceMono',
    },

    sizes: {
        /** 10px */
        xs: 10,
        /** 12px */
        sm: 12,
        /** 14px */
        md: 14,
        /** 16px */
        lg: 16,
        /** 18px */
        xl: 18,
        /** 20px */
        xxl: 20,
        /** 24px */
        h3: 24,
        /** 28px */
        h2: 28,
        /** 32px */
        h1: 32,
        /** 40px */
        hero: 40,
    },

    weights: {
        regular: '400' as const,
        medium: '500' as const,
        semibold: '600' as const,
        bold: '700' as const,
    },

    lineHeights: {
        tight: 1.2,
        normal: 1.5,
        relaxed: 1.75,
    },
} as const;

export type FontFamily = keyof typeof Typography.fonts;
export type FontSize = keyof typeof Typography.sizes;
export type FontWeight = keyof typeof Typography.weights;
