/**
 * Item Spawner
 * 
 * Handles item creation, spawning logic, and weighted random selection.
 * This is a pure logic module with no React dependencies.
 */

import { ITEM_DEFINITIONS, MULTI_THROW, PHYSICS, SIZES, SPAWN_WEIGHTS, TIMING } from './config';
import type { FallingItem, ItemType, ShonzikaState } from './types';

/**
 * State for managing item spawning
 */
export interface SpawnerState {
    lastSpawnTime: number;
    nextSpawnTime: number;
    itemIdCounter: number;
    /** Number of items remaining in current burst (0 = no burst active) */
    burstPendingCount: number;
    /** Time when next burst item should spawn (only used if burstPendingCount > 0) */
    nextBurstTime: number;
}

/**
 * Creates initial spawner state
 */
export function createInitialSpawnerState(): SpawnerState {
    return {
        lastSpawnTime: 0,
        nextSpawnTime: 0,
        itemIdCounter: 0,
        burstPendingCount: 0,
        nextBurstTime: 0,
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
        burstPendingCount: spawnerState.burstPendingCount,
        nextBurstTime: spawnerState.nextBurstTime,
    };

    return { item, newState };
}

/**
 * Checks if a burst throw should be initiated (random chance)
 * Returns the number of items to throw in the burst (1 = no burst)
 */
export function rollForBurstThrow(): number {
    const shouldBurst = Math.random() < MULTI_THROW.CHANCE;
    if (!shouldBurst) return 1;

    // Random between MIN_ITEMS and MAX_ITEMS
    return Math.floor(Math.random() * (MULTI_THROW.MAX_ITEMS - MULTI_THROW.MIN_ITEMS + 1)) + MULTI_THROW.MIN_ITEMS;
}

/**
 * Spawns item and potentially starts a burst sequence
 * Returns the spawned item and updated state with burst tracking
 */
export function spawnWithBurst(
    spawnerState: SpawnerState,
    shonzika: ShonzikaState,
    currentTime: number
): { item: FallingItem; newState: SpawnerState } {
    // Check if we're in the middle of a burst
    if (spawnerState.burstPendingCount > 0) {
        // Spawn the next burst item
        const { item, newState } = spawnItem(spawnerState, shonzika, currentTime);

        // Decrement burst count
        const remainingBurst = spawnerState.burstPendingCount - 1;

        return {
            item,
            newState: {
                ...newState,
                burstPendingCount: remainingBurst,
                nextBurstTime: remainingBurst > 0 ? currentTime + MULTI_THROW.BURST_DELAY_MS : 0,
                // Don't update nextSpawnTime yet - will be set after burst completes
                nextSpawnTime: remainingBurst > 0 ? newState.nextSpawnTime : calculateNextSpawnTime(currentTime),
            },
        };
    }

    // Starting a new spawn - roll for burst
    const burstCount = rollForBurstThrow();
    const { item, newState } = spawnItem(spawnerState, shonzika, currentTime);

    if (burstCount > 1) {
        // Start burst sequence (we already spawned 1, so pending is burstCount - 1)
        return {
            item,
            newState: {
                ...newState,
                burstPendingCount: burstCount - 1,
                nextBurstTime: currentTime + MULTI_THROW.BURST_DELAY_MS,
                nextSpawnTime: currentTime + MULTI_THROW.BURST_DELAY_MS, // Short delay for next item
            },
        };
    }

    // No burst, normal spawn
    return { item, newState };
}

/**
 * Checks if it's time to spawn the next item (either regular or burst)
 */
export function shouldSpawnNextItem(
    spawnerState: SpawnerState,
    currentTime: number
): boolean {
    // If in burst mode, check burst timing
    if (spawnerState.burstPendingCount > 0) {
        return currentTime >= spawnerState.nextBurstTime;
    }
    // Normal spawn check
    return currentTime >= spawnerState.nextSpawnTime;
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
