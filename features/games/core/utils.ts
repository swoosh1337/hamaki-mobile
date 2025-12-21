/**
 * Core Game Engine Utilities
 * 
 * Shared utilities and helpers for all game engines.
 */

/**
 * Clamp a value between min and max
 */
export function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

/**
 * Linear interpolation between two values
 */
export function lerp(start: number, end: number, t: number): number {
    return start + (end - start) * clamp(t, 0, 1);
}

/**
 * Ease in-out quadratic function for smooth animations
 */
export function easeInOutQuad(t: number): number {
    return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

/**
 * Check if two rectangles are colliding
 */
export function rectanglesCollide(
    rect1: { x: number; y: number; width: number; height: number },
    rect2: { x: number; y: number; width: number; height: number }
): boolean {
    return (
        rect1.x < rect2.x + rect2.width &&
        rect1.x + rect1.width > rect2.x &&
        rect1.y < rect2.y + rect2.height &&
        rect1.y + rect1.height > rect2.y
    );
}

/**
 * Check if a point is inside a rectangle
 */
export function pointInRectangle(
    point: { x: number; y: number },
    rect: { x: number; y: number; width: number; height: number }
): boolean {
    return (
        point.x >= rect.x &&
        point.x <= rect.x + rect.width &&
        point.y >= rect.y &&
        point.y <= rect.y + rect.height
    );
}

/**
 * Calculate distance between two points
 */
export function distance(
    point1: { x: number; y: number },
    point2: { x: number; y: number }
): number {
    const dx = point2.x - point1.x;
    const dy = point2.y - point1.y;
    return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Generate a random value between min and max
 */
export function randomBetween(min: number, max: number): number {
    return min + Math.random() * (max - min);
}

/**
 * Generate a random integer between min and max (inclusive)
 */
export function randomIntBetween(min: number, max: number): number {
    return Math.floor(randomBetween(min, max + 1));
}

/**
 * Pick a random item from an array
 */
export function randomChoice<T>(array: T[]): T {
    return array[Math.floor(Math.random() * array.length)];
}

/**
 * Generate a unique ID
 */
export function generateId(prefix: string = 'id'): string {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Format seconds to display string (e.g., "60s", "1:30")
 */
export function formatTime(seconds: number): string {
    if (seconds < 60) {
        return `${Math.ceil(seconds)}s`;
    }
    const mins = Math.floor(seconds / 60);
    const secs = Math.ceil(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}
