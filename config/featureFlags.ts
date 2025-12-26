/**
 * Feature Flags Configuration
 * 
 * Central place to toggle features on/off.
 * Set DEV_MODE to true for development features.
 */

// ============================================================================
// MASTER DEV MODE SWITCH
// ============================================================================
export const DEV_MODE = __DEV__ ?? false;

// ============================================================================
// FEATURE FLAGS
// ============================================================================

export const FEATURE_FLAGS = {
    /**
     * When true, game cooldowns are DISABLED (unlimited plays)
     * When false, game cooldowns are ENABLED (production behavior)
     */
    DISABLE_GAME_COOLDOWN: DEV_MODE,

    /**
     * When true, show debug overlays in games
     */
    SHOW_GAME_DEBUG_INFO: false,

    /**
     * When true, skip asset loading animations
     */
    SKIP_LOADING_ANIMATIONS: false,

    /**
     * When true, log verbose asset loading info
     */
    VERBOSE_ASSET_LOGGING: DEV_MODE,
} as const;

// Export individual flags for easy importing
export const {
    DISABLE_GAME_COOLDOWN,
    SHOW_GAME_DEBUG_INFO,
    SKIP_LOADING_ANIMATIONS,
    VERBOSE_ASSET_LOGGING,
} = FEATURE_FLAGS;
