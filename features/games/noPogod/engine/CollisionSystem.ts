/**
 * Collision System
 * 
 * Handles collision detection between player and items,
 * and the resulting game effects (scoring, lives, game over).
 */

import { SIZES } from './config';
import type { FallingItem, PlayerState } from './types';

/**
 * Result of processing a collision
 */
export interface CollisionOutcome {
    /** Points to add (can be 0) */
    pointsEarned: number;
    /** Lives lost (usually 0 or 1) */
    livesLost: number;
    /** Whether this triggers immediate game over */
    isGameOver: boolean;
    /** Whether speed boost should be activated */
    activateSpeedBoost: boolean;
    /** The item type that was caught */
    itemType: FallingItem['type'];
}

/**
 * Checks if two bounding boxes overlap
 */
export function boxesOverlap(
    box1: { x: number; y: number; width: number; height: number },
    box2: { x: number; y: number; width: number; height: number }
): boolean {
    return (
        box1.x < box2.x + box2.width &&
        box1.x + box1.width > box2.x &&
        box1.y < box2.y + box2.height &&
        box1.y + box1.height > box2.y
    );
}

/**
 * Checks if a point is within a radius of another point
 */
export function pointsWithinRadius(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    radius: number
): boolean {
    const dx = x2 - x1;
    const dy = y2 - y1;
    return (dx * dx + dy * dy) <= (radius * radius);
}

/**
 * Gets player catch zone (area where items can be caught)
 */
export function getPlayerCatchZone(player: PlayerState): {
    centerX: number;
    centerY: number;
    radius: number;
} {
    return {
        centerX: player.x,
        centerY: player.y,
        radius: SIZES.CHARACTER_SIZE / 2,
    };
}

/**
 * Checks if an item is within the player's catch zone
 */
export function isItemInCatchZone(
    item: FallingItem,
    player: PlayerState
): boolean {
    const catchZone = getPlayerCatchZone(player);
    const catchRadius = catchZone.radius;

    // Item must be close enough horizontally
    const distanceX = Math.abs(item.x - player.x);
    if (distanceX > catchRadius) {
        return false;
    }

    // Item must be at or below player height (within item size)
    const distanceY = Math.abs(item.y - player.y);
    if (distanceY > SIZES.ITEM_SIZE) {
        return false;
    }

    // Item must have reached the catch zone (not above player)
    if (item.y < player.y - SIZES.ITEM_SIZE) {
        return false;
    }

    return true;
}

/**
 * Finds all items colliding with the player
 */
export function findCollidingItems(
    items: FallingItem[],
    player: PlayerState
): FallingItem[] {
    return items.filter(item => isItemInCatchZone(item, player));
}

/**
 * Determines the outcome of catching an item
 */
export function processItemCatch(item: FallingItem): CollisionOutcome {
    switch (item.type) {
        case 'EGG':
        case 'TOMATO':
            return {
                pointsEarned: item.points,
                livesLost: 0,
                isGameOver: false,
                activateSpeedBoost: false,
                itemType: item.type,
            };

        case 'PEPPER':
            return {
                pointsEarned: item.points,
                livesLost: 0,
                isGameOver: false,
                activateSpeedBoost: true,  // Pepper gives speed boost!
                itemType: item.type,
            };

        case 'ELECTRIC_SHOCK':
            return {
                pointsEarned: 0,
                livesLost: 1,
                isGameOver: false,
                activateSpeedBoost: false,
                itemType: item.type,
            };

        case 'BOMB':
            return {
                pointsEarned: 0,
                livesLost: 0,  // No lives lost - instant game over
                isGameOver: true,
                activateSpeedBoost: false,
                itemType: item.type,
            };

        default:
            // Type safety fallback
            return {
                pointsEarned: 0,
                livesLost: 0,
                isGameOver: false,
                activateSpeedBoost: false,
                itemType: item.type,
            };
    }
}

/**
 * Processes item miss (item fell past player without being caught)
 */
export function processItemMiss(item: FallingItem): CollisionOutcome {
    // Currently missing items has no penalty
    // (bombs are safe to miss, good items just lose opportunity)
    return {
        pointsEarned: 0,
        livesLost: 0,
        isGameOver: false,
        activateSpeedBoost: false,
        itemType: item.type,
    };
}

/**
 * Full collision processing for all items
 * Returns items that were NOT caught (remaining items)
 * and all collision outcomes
 */
export function processCollisions(
    items: FallingItem[],
    player: PlayerState
): {
    remainingItems: FallingItem[];
    outcomes: CollisionOutcome[];
} {
    const remainingItems: FallingItem[] = [];
    const outcomes: CollisionOutcome[] = [];

    for (const item of items) {
        if (isItemInCatchZone(item, player)) {
            // Item caught
            const outcome = processItemCatch(item);
            outcomes.push(outcome);
        } else {
            // Item not caught - keep for next frame
            remainingItems.push(item);
        }
    }

    return { remainingItems, outcomes };
}

/**
 * Aggregates multiple collision outcomes
 */
export function aggregateOutcomes(outcomes: CollisionOutcome[]): {
    totalPoints: number;
    totalLivesLost: number;
    shouldGameOver: boolean;
    shouldActivateSpeedBoost: boolean;
} {
    const initial = {
        totalPoints: 0,
        totalLivesLost: 0,
        shouldGameOver: false,
        shouldActivateSpeedBoost: false,
    };

    return outcomes.reduce((acc, outcome) => ({
        totalPoints: acc.totalPoints + outcome.pointsEarned,
        totalLivesLost: acc.totalLivesLost + outcome.livesLost,
        shouldGameOver: acc.shouldGameOver || outcome.isGameOver,
        shouldActivateSpeedBoost: acc.shouldActivateSpeedBoost || outcome.activateSpeedBoost,
    }), initial);
}
