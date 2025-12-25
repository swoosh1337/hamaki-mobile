/**
 * No Pogodi Game Canvas - Atlas Version
 * 
 * Uses the SHARED GameAssetLoader system for sprite atlas rendering.
 * This demonstrates how any game can use the common infrastructure.
 */

import {
    Canvas,
    Line,
    Picture,
    Rect,
    Skia,
    Image as SkiaImage,
    createPicture,
    rect,
    vec,
} from '@shopify/react-native-skia';
import React, { useMemo } from 'react';
import { ActivityIndicator, Dimensions, StyleSheet, Text, View } from 'react-native';

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

export const NoPogodGameCanvasAtlas: React.FC<NoPogodGameCanvasAtlasProps> = ({
    gameState,
    spriteRenderer,
    responsiveScaling,
}) => {
    // Use the SHARED game asset system with NoPogod config
    const { isLoading, isReady, assets, error } = useGameAssets<NoPogodAtlasNames>(
        NOPOGOD_GAME_ID,
        NOPOGOD_ASSET_CONFIG
    );

    // Initialize responsive scaling
    const scaling = responsiveScaling || new ResponsiveScalingManager(SCREEN_WIDTH, SCREEN_HEIGHT);
    const scalingConfig = scaling.getScalingConfig();
    const responsiveSizes = scaling.getSizes();

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

    /**
     * Create a Picture that draws a sprite from an atlas using drawImageRect
     * Now with aspect ratio preservation (like fit="contain")
     */
    const createAtlasSpritePicture = useMemo(() => {
        return (
            atlas: LoadedAtlas,
            frameName: string,
            destX: number,
            destY: number,
            destWidth: number,
            destHeight: number,
            flipX: boolean = false
        ) => {
            const frame = atlas.frames[frameName];
            if (!frame) {
                log.warn(`Frame not found: ${frameName}`);
                return null;
            }

            // Source rect from atlas
            const srcRect = rect(frame.x, frame.y, frame.width, frame.height);

            // Calculate aspect-ratio-preserving dimensions (like fit="contain")
            const srcAspect = frame.width / frame.height;
            const dstAspect = destWidth / destHeight;

            let finalWidth = destWidth;
            let finalHeight = destHeight;

            if (srcAspect > dstAspect) {
                // Source is wider than destination - fit by width
                finalHeight = destWidth / srcAspect;
            } else {
                // Source is taller than destination - fit by height
                finalWidth = destHeight * srcAspect;
            }

            // Apply pivot to center the sprite properly
            const pivotedX = destX - finalWidth * frame.pivot.x;
            const pivotedY = destY - finalHeight * frame.pivot.y;
            const dstRect = rect(pivotedX, pivotedY, finalWidth, finalHeight);

            return createPicture((canvas) => {
                if (flipX) {
                    canvas.save();
                    canvas.translate(pivotedX + finalWidth, pivotedY);
                    canvas.scale(-1, 1);
                    canvas.translate(-pivotedX, -pivotedY);
                    canvas.drawImageRect(atlas.image, srcRect, dstRect, Skia.Paint());
                    canvas.restore();
                } else {
                    canvas.drawImageRect(atlas.image, srcRect, dstRect, Skia.Paint());
                }
            });
        };
    }, []);

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

    // Create sprite pictures
    const miroPicture = miro ? createAtlasSpritePicture(
        miro,
        getMiroFrameName(),
        renderData.miro.x + renderData.miro.width / 2,
        renderData.miro.y + renderData.miro.height,
        renderData.miro.width,
        renderData.miro.height,
        gameState.player.position === 'LEFT'
    ) : null;

    const shonzikaPicture = shonzika ? createAtlasSpritePicture(
        shonzika,
        getShonzikaFrameName(),
        renderData.shonzika.x + renderData.shonzika.width / 2,
        renderData.shonzika.y + renderData.shonzika.height,
        renderData.shonzika.width,
        renderData.shonzika.height,
        gameState.shonzika.position === 'LEFT'
    ) : null;

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
                {/* Background */}
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

                {/* Shonzika */}
                {shonzikaPicture && <Picture picture={shonzikaPicture} />}

                {/* Miro */}
                {miroPicture && <Picture picture={miroPicture} />}

                {/* Falling items */}
                {items && renderData.items.map((itemSprite, index) => {
                    const item = gameState.items[index];
                    if (!item) return null;

                    const itemPicture = createAtlasSpritePicture(
                        items,
                        getItemFrameName(item.type),
                        itemSprite.x + itemSprite.width / 2,
                        itemSprite.y + itemSprite.height / 2,
                        itemSprite.width,
                        itemSprite.height
                    );

                    return itemPicture ? <Picture key={item.id} picture={itemPicture} /> : null;
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
