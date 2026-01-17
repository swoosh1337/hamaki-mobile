/**
 * No Pogodi Game Canvas - Atlas Version 
 * 
 * Uses Skia's native <Image fit="contain"> for proper aspect ratio,
 * combined with Group clipping to crop frames from atlases.
 * 
 * This gives us:
 * - 98% asset size reduction (WebP atlases)
 * - Lazy loading via shared GameAssetLoader
 * - Native Skia aspect ratio handling (no stretching)
 */

import {
    Canvas,
    Group,
    Line,
    Rect,
    rect,
    Image as SkiaImage,
    vec,
} from '@shopify/react-native-skia';
import React, { useMemo } from 'react';
import { ActivityIndicator, Dimensions, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors } from '@/constants/Colors';
import { NoPogodGameState } from '@/features/games/noPogod';
import { NOPOGOD_ASSET_CONFIG, NOPOGOD_GAME_ID, NoPogodAtlasNames } from '@/features/games/noPogod/config/assetConfig';
import { ITEMS_FRAMES, MIRO_FRAMES, SHONZIKA_FRAMES } from '@/features/games/noPogod/generated/frameConstants';
import { ResponsiveScalingManager } from '@/features/games/noPogod/utils/responsiveScaling';
import { NoPogodSpriteRenderer } from '@/features/games/noPogod/utils/spriteRenderer';
import type { LoadedAtlas } from '@/features/games/shared';
import { useGameAssets } from '@/features/games/shared';
import { createLogger } from '@/utils/logger';

const log = createLogger('NoPogodCanvasAtlas');

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface NoPogodGameCanvasAtlasProps {
    gameState: NoPogodGameState;
    spriteRenderer: NoPogodSpriteRenderer;
    responsiveScaling?: ResponsiveScalingManager;
}

/**
 * Renders a sprite from an atlas using Group clipping + Image
 * Memoized to prevent unnecessary re-renders during game loop
 */
const AtlasSprite = React.memo<{
    atlas: LoadedAtlas;
    frameName: string;
    x: number;
    y: number;
    width: number;
    height: number;
    flipX?: boolean;
}>(({ atlas, frameName, x, y, width, height, flipX = false }) => {
    const frame = atlas.frames[frameName];

    // Fallback: render a placeholder if frame not found
    if (!frame) {
        log.warn(`Frame not found: ${frameName}, rendering placeholder`);
        return (
            <Rect
                x={x}
                y={y}
                width={width}
                height={height}
                color="rgba(255, 0, 255, 0.5)"
            />
        );
    }

    // Calculate the scale factor to fit the frame into the destination
    const scaleX = width / frame.width;
    const scaleY = height / frame.height;
    // Use min to preserve aspect ratio (like fit="contain")
    const scale = Math.min(scaleX, scaleY);

    // Actual rendered size after aspect ratio preservation
    const renderedWidth = frame.width * scale;
    const renderedHeight = frame.height * scale;

    // Center within the destination bounds
    const offsetX = (width - renderedWidth) / 2;
    const offsetY = (height - renderedHeight) / 2;

    // Final position
    const finalX = x + offsetX;
    const finalY = y + offsetY;

    // Clip rect in local coordinates (at origin, then translated)
    const clipRect = rect(0, 0, renderedWidth, renderedHeight);

    // Simple rendering without flip (most common case)
    if (!flipX) {
        return (
            <Group
                transform={[{ translateX: finalX }, { translateY: finalY }]}
                clip={clipRect}
            >
                <SkiaImage
                    image={atlas.image}
                    x={-frame.x * scale}
                    y={-frame.y * scale}
                    width={atlas.meta.size.width * scale}
                    height={atlas.meta.size.height * scale}
                />
            </Group>
        );
    }

    // With horizontal flip
    return (
        <Group
            transform={[{ translateX: finalX }, { translateY: finalY }]}
            clip={clipRect}
        >
            <Group transform={[
                { translateX: renderedWidth },
                { scaleX: -1 }
            ]}>
                <SkiaImage
                    image={atlas.image}
                    x={-frame.x * scale}
                    y={-frame.y * scale}
                    width={atlas.meta.size.width * scale}
                    height={atlas.meta.size.height * scale}
                />
            </Group>
        </Group>
    );
});
AtlasSprite.displayName = 'AtlasSprite';

export const NoPogodGameCanvasAtlas: React.FC<NoPogodGameCanvasAtlasProps> = ({
    gameState,
    spriteRenderer,
    responsiveScaling,
}) => {
    const insets = useSafeAreaInsets();
    // Use the SHARED game asset system with NoPogod config
    const { isLoading, isReady, assets, error } = useGameAssets<NoPogodAtlasNames>(
        NOPOGOD_GAME_ID,
        NOPOGOD_ASSET_CONFIG
    );

    // Initialize responsive scaling
    const scaling = useMemo(
        () => responsiveScaling ?? new ResponsiveScalingManager(SCREEN_WIDTH, SCREEN_HEIGHT, insets),
        [responsiveScaling, insets]
    );
    const scalingConfig = useMemo(() => scaling.getScalingConfig(), [scaling]);
    const responsiveSizes = useMemo(() => scaling.getSizes(), [scaling]);

    // Calculate sprite positions
    const renderData = useMemo(() => {
        if (!spriteRenderer) {
            const positions = scaling.getPositions();
            return {
                miro: {
                    x: positions.playerPositions.center,
                    y: positions.miroGroundY,
                    width: responsiveSizes.characterSize,
                    height: responsiveSizes.characterSize,
                },
                shonzika: {
                    x: positions.playerPositions.center,
                    y: positions.shonzikaY,
                    width: responsiveSizes.characterSize,
                    height: responsiveSizes.characterSize,
                },
                items: [],
            };
        }
        return spriteRenderer.getAllSprites(gameState);
    }, [gameState, spriteRenderer, scaling, responsiveSizes]);

    // Get current Miro frame name based on state
    const getMiroFrameName = (): string => {
        if (gameState.player.isMoving) {
            return gameState.player.animationProgress < 0.5
                ? MIRO_FRAMES.STEP1
                : MIRO_FRAMES.STEP2;
        }
        return MIRO_FRAMES.ANGLE90;
    };

    // Get current Shonzika frame name based on state
    const getShonzikaFrameName = (): string => {
        if (gameState.shonzika.sprite === 'THROWING') {
            return SHONZIKA_FRAMES.ANGLE90;
        }
        if (gameState.shonzika.sprite === 'WALKING' || gameState.shonzika.isMoving) {
            return gameState.shonzika.animationProgress < 0.5
                ? SHONZIKA_FRAMES.WALKING1
                : SHONZIKA_FRAMES.WALKING2;
        }
        return SHONZIKA_FRAMES.ANGLE90;
    };

    // Get item frame name based on type
    const getItemFrameName = (itemType: string): string => {
        switch (itemType) {
            case 'EGG': return ITEMS_FRAMES.EGG;
            case 'TOMATO': return ITEMS_FRAMES.TOMATO;
            case 'PEPPER': return ITEMS_FRAMES.PEPPER;
            case 'ELECTRIC_SHOCK': return ITEMS_FRAMES.ELECTRIC_SHOCK;
            case 'BOMB': return ITEMS_FRAMES.BOMB;
            default: return ITEMS_FRAMES.EGG;
        }
    };

    // Loading state
    if (isLoading || !isReady) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={Colors.dark.tint} />
                <Text style={styles.loadingText}>Loading Game...</Text>
                <Text style={styles.loadingSubtext}>Preparing atlas assets</Text>
            </View>
        );
    }

    // Error state
    if (error) {
        return (
            <View style={styles.loadingContainer}>
                <Text style={styles.loadingText}>Failed to load assets</Text>
                <Text style={styles.loadingSubtext}>{error.message}</Text>
            </View>
        );
    }

    const { background, atlases } = assets;
    const miro = atlases.miro;
    const shonzika = atlases.shonzika;
    const items = atlases.items;

    // Render rope
    const renderRope = () => {
        const shonzikaSprite = renderData.shonzika;
        const ropeY = shonzikaSprite.y + shonzikaSprite.height;
        const postWidth = 6;
        const postHeight = 40;
        const postTopY = ropeY - postHeight;
        const leftPostX = 20;
        const rightPostX = scalingConfig.screenWidth - 20 - postWidth;

        return (
            <>
                <Rect x={leftPostX} y={postTopY} width={postWidth} height={postHeight} color="#654321" />
                <Rect x={rightPostX} y={postTopY} width={postWidth} height={postHeight} color="#654321" />
                <Line
                    p1={vec(leftPostX + postWidth / 2, ropeY)}
                    p2={vec(rightPostX + postWidth / 2, ropeY)}
                    color="#8B4513"
                    style="stroke"
                    strokeWidth={4}
                />
                <Line
                    p1={vec(leftPostX + postWidth / 2, ropeY + 1)}
                    p2={vec(rightPostX + postWidth / 2, ropeY + 1)}
                    color="#A0826D"
                    style="stroke"
                    strokeWidth={1}
                    opacity={0.5}
                />
            </>
        );
    };

    return (
        <View style={styles.container}>
            <Canvas style={styles.canvas}>
                {/* Background - standalone WebP, use native fit */}
                {background && (
                    <SkiaImage
                        image={background}
                        x={0}
                        y={0}
                        width={scalingConfig.screenWidth}
                        height={scalingConfig.screenHeight}
                        fit="cover"
                    />
                )}

                {/* Rope */}
                {renderRope()}

                {/* Shonzika - from atlas with clipping */}
                {shonzika && (
                    <AtlasSprite
                        atlas={shonzika}
                        frameName={getShonzikaFrameName()}
                        x={renderData.shonzika.x}
                        y={renderData.shonzika.y}
                        width={renderData.shonzika.width}
                        height={renderData.shonzika.height}
                        flipX={gameState.shonzika.facingDirection === -1}
                    />
                )}

                {/* Miro - from atlas with clipping */}
                {miro && (
                    <AtlasSprite
                        atlas={miro}
                        frameName={getMiroFrameName()}
                        x={renderData.miro.x}
                        y={renderData.miro.y}
                        width={renderData.miro.width}
                        height={renderData.miro.height}
                        flipX={gameState.player.position === 'LEFT'}
                    />
                )}

                {/* Falling items - direct iteration to prevent index mismatch */}
                {items && gameState.items.map((item) => {
                    const itemSize = responsiveSizes.itemSize;
                    return (
                        <AtlasSprite
                            key={item.id}
                            atlas={items}
                            frameName={getItemFrameName(item.type)}
                            x={item.x - itemSize / 2}
                            y={item.y - itemSize / 2}
                            width={itemSize}
                            height={itemSize}
                        />
                    );
                })}
            </Canvas>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        position: 'relative',
    },
    canvas: {
        flex: 1,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: Colors.dark.background,
        gap: 16,
    },
    loadingText: {
        fontSize: 24,
        fontFamily: 'hamaki-eng',
        color: Colors.dark.tint,
        marginTop: 16,
        paddingHorizontal: 12,
    },
    loadingSubtext: {
        fontSize: 14,
        fontFamily: 'SpaceMono',
        color: Colors.dark.text,
        opacity: 0.7,
    },
});
