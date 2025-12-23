/**
 * Item Spawner
 * 
 * Handles item creation, spawning logic, and weighted random selection.
 * This is a pure logic module with no React dependencies.
 */

import { ITEM_DEFINITIONS, PHYSICS, SIZES, SPAWN_WEIGHTS, TIMING } from './config';
import type { FallingItem, ItemType, ShonzikaState } from './types';

/**
 * State for managing item spawning
 */
export interface SpawnerState {
    lastSpawnTime: number;
    nextSpawnTime: number;
    itemIdCounter: number;
}

/**
 * Creates initial spawner state
 */
export function createInitialSpawnerState(): SpawnerState {
    return {
        lastSpawnTime: 0,
        nextSpawnTime: 0,
        itemIdCounter: 0,
    };
}

/**
 * Generates the next spawn time with random variance
 */
export function calculateNextSpawnTime(currentTime: number): number {
    const variance = (Math.random() - 0.5) * 2 * TIMING.ITEM_SPAWN_VARIANCE;
    return currentTime + TIMING.ITEM_SPAWN_INTERVAL + variance;
}

/**
 * Checks if it's time to spawn a new item
 */
export function shouldSpawnItem(
    spawnerState: SpawnerState,
    currentTime: number
): boolean {
    return currentTime >= spawnerState.nextSpawnTime;
}

/**
 * Selects a random item type based on spawn weights
 */
export function selectRandomItemType(): ItemType {
    const totalWeight = Object.values(SPAWN_WEIGHTS).reduce((sum, w) => sum + w, 0);
    let random = Math.random() * totalWeight;

    for (const [type, weight] of Object.entries(SPAWN_WEIGHTS)) {
        random -= weight;
        if (random <= 0) {
            return type as ItemType;
        }
    }

    // Fallback (should never happen)
    return 'EGG';
}

/**
 * Generates a unique item ID
 */
export function generateItemId(spawnerState: SpawnerState): string {
    return `item_${spawnerState.itemIdCounter}_${Date.now()}`;
}

/**
 * Creates a new falling item at the Shonzika's hand position
 */
export function createFallingItem(
    itemType: ItemType,
    spawnX: number,
    spawnY: number,
    itemId: string
): FallingItem {
    const definition = ITEM_DEFINITIONS[itemType];

    return {
        id: itemId,
        type: itemType,
        x: spawnX,
        y: spawnY,
        velocityX: 0,  // Straight down drop
        velocityY: PHYSICS.ITEM_FALL_SPEED,
        sprite: null,  // Will be set by renderer
        points: definition.points,
        isBad: definition.isBad,
        isDeadly: definition.isDeadly,
        mustCatch: definition.mustCatch,
        shouldAvoid: definition.shouldAvoid,
    };
}

/**
 * Spawns a new item and updates spawner state
 */
export function spawnItem(
    spawnerState: SpawnerState,
    shonzika: ShonzikaState,
    currentTime: number
): { item: FallingItem; newState: SpawnerState } {
    const itemType = selectRandomItemType();
    const itemId = generateItemId(spawnerState);

    // Get spawn position from Shonzika's hand
    const spawnX = shonzika.x;
    const spawnY = shonzika.y + 30; // Offset below Shonzika

    const item = createFallingItem(itemType, spawnX, spawnY, itemId);

    const newState: SpawnerState = {
        lastSpawnTime: currentTime,
        nextSpawnTime: calculateNextSpawnTime(currentTime),
        itemIdCounter: spawnerState.itemIdCounter + 1,
    };

    return { item, newState };
}

/**
 * Updates item positions based on physics
 * Uses frame-based movement like the original engine (not time-based)
 */
export function updateItemPositions(
    items: FallingItem[],
    _deltaTime: number // Kept for API compatibility, but not used
): FallingItem[] {
    return items.map(item => ({
        ...item,
        // Frame-based movement: velocity is in pixels per frame
        x: item.x + item.velocityX,
        y: item.y + item.velocityY,
        // Apply acceleration per frame (not per ms)
        velocityY: item.velocityY + PHYSICS.ITEM_FALL_ACCELERATION,
    }));
}

/**
 * Removes items that have fallen off screen
 */
export function removeOffscreenItems(
    items: FallingItem[],
    screenHeight: number
): FallingItem[] {
    const offscreenThreshold = screenHeight + SIZES.ITEM_SIZE;
    return items.filter(item => item.y < offscreenThreshold);
}

/**
 * Gets the bounding box for an item
 */
export function getItemBoundingBox(item: FallingItem): {
    x: number;
    y: number;
    width: number;
    height: number;
} {
    const halfSize = SIZES.ITEM_SIZE / 2;
    return {
        x: item.x - halfSize,
        y: item.y - halfSize,
        width: SIZES.ITEM_SIZE,
        height: SIZES.ITEM_SIZE,
    };
}

/**
 * Gets spawn weight percentages for display
 */
export function getSpawnRates(): Record<ItemType, number> {
    const totalWeight = Object.values(SPAWN_WEIGHTS).reduce((sum, w) => sum + w, 0);
    const rates: Partial<Record<ItemType, number>> = {};

    for (const [type, weight] of Object.entries(SPAWN_WEIGHTS)) {
        rates[type as ItemType] = (weight / totalWeight) * 100;
    }

    return rates as Record<ItemType, number>;
}
