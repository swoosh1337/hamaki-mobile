/**
 * Shonzika AI Controller
 * 
 * Handles Shonzika's movement, animation, and throwing behavior.
 * Shonzika is the antagonist who throws items at the player.
 */

import { ANIMATION, POSITIONS } from './config';
import type { PlayerPosition, ShonzikaState } from './types';

/**
 * Creates the initial Shonzika state
 */
export function createInitialShonzikaState(
    screenWidth: number,
    screenHeight: number
): ShonzikaState {
    const x = screenWidth * POSITIONS.SHONZIKA.x;
    const y = screenHeight * POSITIONS.SHONZIKA.y;

    return {
        position: 'CENTER',
        x,
        y,
        targetX: x,
        startX: x,
        isMoving: false,
        sprite: 'IDLE',
        throwCooldown: 0,
        visualThrowTimer: 0,
        animationProgress: 0,
        movementStartTime: 0,
        nextMoveTime: 0,
    };
}

/**
 * Calculates the X bounds for Shonzika movement
 */
export function getMovementBounds(screenWidth: number): {
    minX: number;
    maxX: number;
} {
    const padding = ANIMATION.SHONZIKA_EDGE_PADDING + ANIMATION.SHONZIKA_CHARACTER_HALF_WIDTH;
    return {
        minX: padding,
        maxX: screenWidth - padding,
    };
}

/**
 * Picks a random direction for Shonzika to move
 */
export function pickRandomDirection(): 1 | -1 {
    return Math.random() < 0.5 ? -1 : 1;
}

/**
 * Determines the next X position for continuous walking
 * Uses frame-based movement (not time-based) like the original engine
 */
export function calculateNextPosition(
    currentX: number,
    direction: 1 | -1,
    _deltaTime: number, // Kept for API compatibility, but not used
    screenWidth: number
): { newX: number; newDirection: 1 | -1 } {
    // Frame-based speed: pixels per frame (not per ms)
    // Original used eased movement over 2000ms across ~300px = ~2.5px per frame at 60fps
    const speed = 1.5; // pixels per frame
    const bounds = getMovementBounds(screenWidth);

    let newX = currentX + direction * speed;
    let newDirection = direction;

    // Bounce off edges
    if (newX <= bounds.minX) {
        newX = bounds.minX;
        newDirection = 1;
    } else if (newX >= bounds.maxX) {
        newX = bounds.maxX;
        newDirection = -1;
    }

    return { newX, newDirection };
}

/**
 * Updates Shonzika's position for continuous walking
 */
export function updateShonzikaPosition(
    state: ShonzikaState,
    deltaTime: number,
    screenWidth: number,
    currentDirection: 1 | -1
): { newState: ShonzikaState; newDirection: 1 | -1 } {
    const { newX, newDirection } = calculateNextPosition(
        state.x,
        currentDirection,
        deltaTime,
        screenWidth
    );

    // Calculate animation progress for walk cycle
    const walkCycleProgress = (Date.now() / 1000 * ANIMATION.SHONZIKA_WALK_CYCLES_PER_SEC) % 1;

    // Determine position based on screen region
    const leftThird = screenWidth / 3;
    const rightThird = (screenWidth * 2) / 3;
    let position: PlayerPosition = 'CENTER';
    if (newX < leftThird) {
        position = 'LEFT';
    } else if (newX > rightThird) {
        position = 'RIGHT';
    }

    return {
        newState: {
            ...state,
            x: newX,
            position,
            isMoving: true,
            sprite: state.visualThrowTimer > 0 ? 'THROWING' : 'WALKING',
            animationProgress: walkCycleProgress,
        },
        newDirection,
    };
}

/**
 * Triggers a throw animation
 */
export function triggerThrow(state: ShonzikaState): ShonzikaState {
    return {
        ...state,
        sprite: 'THROWING',
        visualThrowTimer: ANIMATION.SHONZIKA_THROW_VISUAL_MS,
    };
}

/**
 * Updates the throw visual timer
 */
export function updateThrowTimer(
    state: ShonzikaState,
    deltaTime: number
): ShonzikaState {
    if (state.visualThrowTimer <= 0) {
        return state;
    }

    const newTimer = state.visualThrowTimer - deltaTime;

    if (newTimer <= 0) {
        return {
            ...state,
            visualThrowTimer: 0,
            sprite: state.isMoving ? 'WALKING' : 'IDLE',
        };
    }

    return {
        ...state,
        visualThrowTimer: newTimer,
    };
}

/**
 * Gets Shonzika's hand position (where items spawn from)
 */
export function getHandPosition(state: ShonzikaState): { x: number; y: number } {
    // Hand is slightly below and to the side of Shonzika's center
    return {
        x: state.x,
        y: state.y + 30,  // Below the character
    };
}

/**
 * Gets Shonzika's full position info for rendering
 */
export function getShonzikaRenderInfo(state: ShonzikaState): {
    x: number;
    y: number;
    sprite: 'IDLE' | 'THROWING' | 'WALKING';
    animationProgress: number;
    isMoving: boolean;
} {
    return {
        x: state.x,
        y: state.y,
        sprite: state.sprite,
        animationProgress: state.animationProgress,
        isMoving: state.isMoving,
    };
}

/**
 * Determines if Shonzika should throw based on timing
 */
export function shouldThrow(
    lastThrowTime: number,
    currentTime: number,
    throwInterval: number
): boolean {
    return (currentTime - lastThrowTime) >= throwInterval;
}

/**
 * Calculate time until next throw for display purposes
 */
export function getThrowCooldownRemaining(
    lastThrowTime: number,
    currentTime: number,
    throwInterval: number
): number {
    const elapsed = currentTime - lastThrowTime;
    return Math.max(0, throwInterval - elapsed);
}
