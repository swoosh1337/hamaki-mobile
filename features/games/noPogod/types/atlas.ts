/**
 * Sprite Atlas Types
 * 
 * Type definitions for sprite atlas metadata and frames.
 * Used by useGameAssets hook and sprite rendering.
 */

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
 * Complete atlas definition (matches JSON output)
 */
export interface AtlasDefinition {
    frames: AtlasFrameMap;
    meta: AtlasMeta;
}

/**
 * Loaded atlas with SkImage reference
 */
import type { SkImage } from '@shopify/react-native-skia';

export interface LoadedAtlas {
    /** The Skia image texture */
    image: SkImage;
    /** Frame definitions from JSON */
    frames: AtlasFrameMap;
    /** Atlas metadata */
    meta: AtlasMeta;
}

/**
 * All game atlases
 */
export interface GameAtlases {
    background: SkImage | null;
    miro: LoadedAtlas | null;
    shonzika: LoadedAtlas | null;
    items: LoadedAtlas | null;
}

/**
 * Get source rectangle for Skia Image rendering
 * Use this with Skia's clip or src props
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
 * @param destX - Desired center X position
 * @param destY - Desired center Y position  
 * @param destWidth - Rendered width
 * @param destHeight - Rendered height
 * @param pivot - Pivot point (0-1 normalized)
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
