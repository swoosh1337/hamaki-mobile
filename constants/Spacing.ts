/**
 * Spacing Constants
 * 
 * Consistent spacing values used throughout the app.
 */

export const Spacing = {
    /** 4px */
    xs: 4,
    /** 8px */
    sm: 8,
    /** 12px */
    md: 12,
    /** 16px */
    lg: 16,
    /** 24px */
    xl: 24,
    /** 32px */
    xxl: 32,
    /** 48px */
    xxxl: 48,
} as const;

export type SpacingKey = keyof typeof Spacing;
