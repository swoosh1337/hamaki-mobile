/**
 * Player Controller
 * 
 * Handles all player (Miro) movement and animation logic.
 * This is a pure logic module with no React dependencies.
 */

import { ANIMATION, POSITIONS, SIZES } from './config';
import type { PlayerPosition, PlayerState } from './types';

/**
 * Player movement direction
 */
export type MovementDirection = 'LEFT' | 'RIGHT';

/**
 * Creates the initial player state
 */
export function createInitialPlayerState(
    screenWidth: number,
    screenHeight: number
): PlayerState {
    const centerX = screenWidth * POSITIONS.PLAYER.CENTER;

    return {
        position: 'CENTER',
        x: centerX,
        y: screenHeight * POSITIONS.MIRO_GROUND_Y,
        targetX: centerX,
        startX: centerX,
        isMoving: false,
        sprite: 'IDLE',
        animationProgress: 0,
        movementStartTime: 0,
        speedBoostActive: false,
        speedBoostEndTime: 0,
    };
}

/**
 * Gets the X coordinate for a given position
 */
export function getPositionX(position: PlayerPosition, screenWidth: number): number {
    const positionMap = {
        LEFT: POSITIONS.PLAYER.LEFT,
        CENTER: POSITIONS.PLAYER.CENTER,
        RIGHT: POSITIONS.PLAYER.RIGHT,
    };
    return screenWidth * positionMap[position];
}

/**
 * Moves the player to a new position
 */
export function movePlayer(
    state: PlayerState,
    newPosition: PlayerPosition,
    screenWidth: number,
    currentTime: number
): PlayerState {
    if (state.position === newPosition) {
        return state;
    }

    const targetX = getPositionX(newPosition, screenWidth);

    return {
        ...state,
        position: newPosition,
        startX: state.x,
        targetX,
        isMoving: true,
        sprite: 'MOVING',
        animationProgress: 0,
        movementStartTime: currentTime,
    };
}

/**
 * Starts continuous movement in a direction
 */
export function startContinuousMovement(
    state: PlayerState,
    direction: MovementDirection,
    screenWidth: number,
    currentTime: number
): PlayerState {
    const newPosition: PlayerPosition = direction === 'LEFT' ? 'LEFT' : 'RIGHT';

    if (state.position === newPosition && state.isMoving) {
        return state;
    }

    return movePlayer(state, newPosition, screenWidth, currentTime);
}

/**
 * Stops continuous movement
 */
export function stopContinuousMovement(state: PlayerState): PlayerState {
    if (!state.isMoving) {
        return state;
    }

    return {
        ...state,
        isMoving: false,
        sprite: 'IDLE',
    };
}

/**
 * Updates player position based on animation progress
 */
export function updatePlayerPosition(
    state: PlayerState,
    currentTime: number,
    deltaTime: number
): PlayerState {
    if (!state.isMoving) {
        return state;
    }

    // Calculate movement duration based on speed boost
    const moveDuration = state.speedBoostActive
        ? ANIMATION.PLAYER_MOVE_DURATION_BOOSTED
        : ANIMATION.PLAYER_MOVE_DURATION;

    // Calculate animation progress
    const elapsed = currentTime - state.movementStartTime;
    const progress = Math.min(1, elapsed / moveDuration);

    // Ease-out interpolation for smooth movement
    const easeProgress = easeOutQuad(progress);
    const newX = state.startX + (state.targetX - state.startX) * easeProgress;

    // Check if movement is complete
    if (progress >= 1) {
        return {
            ...state,
            x: state.targetX,
            isMoving: false,
            sprite: 'IDLE',
            animationProgress: 1,
        };
    }

    return {
        ...state,
        x: newX,
        animationProgress: progress,
    };
}

/**
 * Activates speed boost
 */
export function activateSpeedBoost(
    state: PlayerState,
    currentTime: number
): PlayerState {
    return {
        ...state,
        speedBoostActive: true,
        speedBoostEndTime: currentTime + ANIMATION.SPEED_BOOST_DURATION,
    };
}

/**
 * Updates speed boost state
 */
export function updateSpeedBoost(
    state: PlayerState,
    currentTime: number
): PlayerState {
    if (!state.speedBoostActive) {
        return state;
    }

    if (currentTime >= state.speedBoostEndTime) {
        return {
            ...state,
            speedBoostActive: false,
            speedBoostEndTime: 0,
        };
    }

    return state;
}

/**
 * Gets the player's bounding box for collision detection
 */
export function getPlayerBoundingBox(state: PlayerState): {
    x: number;
    y: number;
    width: number;
    height: number;
} {
    const halfSize = SIZES.CHARACTER_SIZE / 2;
    return {
        x: state.x - halfSize,
        y: state.y - halfSize,
        width: SIZES.CHARACTER_SIZE,
        height: SIZES.CHARACTER_SIZE,
    };
}

/**
 * Gets remaining speed boost time in milliseconds
 */
export function getSpeedBoostTimeRemaining(
    state: PlayerState,
    currentTime: number
): number {
    if (!state.speedBoostActive) {
        return 0;
    }
    return Math.max(0, state.speedBoostEndTime - currentTime);
}

/**
 * Quadratic ease-out function for smooth animation
 */
function easeOutQuad(t: number): number {
    return t * (2 - t);
}

/**
 * Determines player position from touch X coordinate
 */
export function getPositionFromTouch(
    touchX: number,
    screenWidth: number
): PlayerPosition {
    const leftThreshold = screenWidth * 0.33;
    const rightThreshold = screenWidth * 0.67;

    if (touchX < leftThreshold) {
        return 'LEFT';
    } else if (touchX > rightThreshold) {
        return 'RIGHT';
    }
    return 'CENTER';
}

/**
 * Gets touch zone boundaries
 */
export function getTouchZones(screenWidth: number): {
    left: number;
    center: number;
    right: number;
} {
    return {
        left: screenWidth * 0.33,
        center: screenWidth * 0.67,
        right: screenWidth,
    };
}
