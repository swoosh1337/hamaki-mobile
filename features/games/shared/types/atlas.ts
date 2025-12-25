/**
 * Generic Game Atlas Types
 * 
 * Shared type definitions for sprite atlases that can be used by ANY game.
 * Following clean architecture - these types are game-agnostic.
 */

import type { SkImage } from '@shopify/react-native-skia';

/**
 * A single frame within a sprite atlas
 */
export interface AtlasFrame {
    /** X position in the atlas texture */
    x: number;
    /** Y position in the atlas texture */
    y: number;
    /** Width of the frame */
    width: number;
    /** Height of the frame */
    height: number;
    /** Pivot point for rotation/positioning (normalized 0-1) */
    pivot: {
        x: number;
        y: number;
    };
}

/**
 * Map of frame names to their atlas coordinates
 */
export interface AtlasFrameMap {
    [frameName: string]: AtlasFrame;
}

/**
 * Metadata for a sprite atlas
 */
export interface AtlasMeta {
    /** Atlas image filename */
    image: string;
    /** Atlas dimensions */
    size: {
        width: number;
        height: number;
    };
    /** Scale factor (usually 1) */
    scale: number;
    /** Generation timestamp */
    generatedAt: string;
}

/**
 * Complete atlas definition (matches JSON output from generator)
 */
export interface AtlasDefinition {
    frames: AtlasFrameMap;
    meta: AtlasMeta;
}

/**
 * Loaded atlas with SkImage reference - ready for rendering
 */
export interface LoadedAtlas {
    /** The Skia image texture */
    image: SkImage;
    /** Frame definitions from JSON */
    frames: AtlasFrameMap;
    /** Atlas metadata */
    meta: AtlasMeta;
}

/**
 * Configuration for loading a game's asset pack
 */
export interface GameAssetConfig {
    /** Unique game identifier */
    gameId: string;
    /** Background image source (require statement) */
    background?: number;
    /** Atlas configurations */
    atlases: {
        [atlasName: string]: {
            /** Image source (require statement) */
            image: number;
            /** JSON definition */
            definition: AtlasDefinition;
        };
    };
}

/**
 * Generic loaded game assets - keys are dynamic based on GameAssetConfig
 */
export interface LoadedGameAssets<T extends string = string> {
    /** Background image if configured */
    background: SkImage | null;
    /** Loaded atlases by name */
    atlases: {
        [K in T]?: LoadedAtlas | null;
    };
}

/**
 * State of the asset loading process
 */
export interface AssetLoadingState {
    isLoading: boolean;
    isLoaded: boolean;
    error: Error | null;
}

/**
 * Get source rectangle for Skia Image rendering
 */
export function getFrameSourceRect(frame: AtlasFrame): {
    x: number;
    y: number;
    width: number;
    height: number;
} {
    return {
        x: frame.x,
        y: frame.y,
        width: frame.width,
        height: frame.height,
    };
}

/**
 * Calculate destination position using pivot
 */
export function calculatePivotedPosition(
    destX: number,
    destY: number,
    destWidth: number,
    destHeight: number,
    pivot: { x: number; y: number }
): { x: number; y: number } {
    return {
        x: destX - destWidth * pivot.x,
        y: destY - destHeight * pivot.y,
    };
}
