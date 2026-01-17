/**
 * YouTube Quota State Manager
 *
 * Tracks YouTube API quota exhaustion state to enable graceful degradation.
 * When quota is exhausted, UI shows cached data with appropriate messaging.
 *
 * Quota resets at midnight Pacific Time (YouTube's quota reset time).
 *
 * Usage:
 * ```typescript
 * import { youtubeQuotaState } from '@/utils/youtubeQuotaState';
 *
 * // Check if quota is exhausted before making API calls
 * if (youtubeQuotaState.isQuotaExhausted()) {
 *     return cachedData;
 * }
 *
 * // Mark quota as exhausted when 403 quotaExceeded error received
 * youtubeQuotaState.setQuotaExhausted();
 * ```
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createLogger } from '@/utils/logger';

const log = createLogger('YouTubeQuotaState');

const QUOTA_STATE_KEY = '@youtube_quota_exhausted';

interface QuotaState {
    /** Timestamp when quota was marked as exhausted */
    exhaustedAt: number;
    /** Expected reset time (midnight Pacific Time) */
    resetsAt: number;
}

/**
 * Calculate next YouTube quota reset time (midnight Pacific Time)
 * YouTube resets quotas at midnight PT daily
 */
function getNextQuotaResetTime(): number {
    const now = new Date();

    // Get current time in Pacific Time
    const pacificTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));

    // Set to midnight
    pacificTime.setHours(0, 0, 0, 0);

    // If it's already past midnight PT today, set to tomorrow
    if (now.getTime() > pacificTime.getTime()) {
        pacificTime.setDate(pacificTime.getDate() + 1);
    }

    return pacificTime.getTime();
}

/**
 * YouTube Quota State Manager
 * Singleton pattern for global state management
 */
class YouTubeQuotaStateManager {
    private state: QuotaState | null = null;
    private initialized = false;
    private listeners: Array<(exhausted: boolean) => void> = [];

    /**
     * Initialize state from AsyncStorage
     * Call this on app startup
     */
    async initialize(): Promise<void> {
        if (this.initialized) return;

        try {
            const stored = await AsyncStorage.getItem(QUOTA_STATE_KEY);
            if (stored) {
                this.state = JSON.parse(stored);

                // Check if quota has reset since last exhaustion
                if (this.state && Date.now() >= this.state.resetsAt) {
                    log.info('Quota has reset since last exhaustion, clearing state');
                    await this.clearQuotaExhausted();
                }
            }
            this.initialized = true;
        } catch (error) {
            log.error('Failed to initialize quota state:', error);
            this.initialized = true;
        }
    }

    /**
     * Check if YouTube API quota is currently exhausted
     */
    isQuotaExhausted(): boolean {
        if (!this.state) return false;

        // Check if quota has reset
        if (Date.now() >= this.state.resetsAt) {
            // Quota has reset - clear state (fire and forget)
            this.clearQuotaExhausted().catch(() => {});
            return false;
        }

        return true;
    }

    /**
     * Get time remaining until quota resets (in milliseconds)
     * Returns 0 if quota is not exhausted
     */
    getTimeUntilReset(): number {
        if (!this.state || !this.isQuotaExhausted()) return 0;
        return Math.max(0, this.state.resetsAt - Date.now());
    }

    /**
     * Get formatted time until reset (e.g., "5 საათი 30 წუთი")
     * Returns null if quota is not exhausted
     */
    getFormattedTimeUntilReset(): string | null {
        const ms = this.getTimeUntilReset();
        if (ms === 0) return null;

        const hours = Math.floor(ms / (1000 * 60 * 60));
        const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));

        if (hours > 0) {
            return `${hours} საათი ${minutes} წუთი`;
        }
        return `${minutes} წუთი`;
    }

    /**
     * Mark quota as exhausted
     * Called when YouTube API returns 403 with quotaExceeded
     */
    async setQuotaExhausted(): Promise<void> {
        const now = Date.now();
        this.state = {
            exhaustedAt: now,
            resetsAt: getNextQuotaResetTime(),
        };

        try {
            await AsyncStorage.setItem(QUOTA_STATE_KEY, JSON.stringify(this.state));
            log.warn('YouTube quota marked as exhausted', {
                resetsAt: new Date(this.state.resetsAt).toISOString(),
                timeUntilReset: this.getFormattedTimeUntilReset(),
            });
            this.notifyListeners(true);
        } catch (error) {
            log.error('Failed to persist quota exhausted state:', error);
        }
    }

    /**
     * Clear quota exhausted state (quota has reset)
     */
    async clearQuotaExhausted(): Promise<void> {
        this.state = null;

        try {
            await AsyncStorage.removeItem(QUOTA_STATE_KEY);
            log.info('YouTube quota state cleared (quota reset)');
            this.notifyListeners(false);
        } catch (error) {
            log.error('Failed to clear quota state:', error);
        }
    }

    /**
     * Subscribe to quota state changes
     * Returns unsubscribe function
     */
    subscribe(listener: (exhausted: boolean) => void): () => void {
        this.listeners.push(listener);
        return () => {
            this.listeners = this.listeners.filter(l => l !== listener);
        };
    }

    private notifyListeners(exhausted: boolean): void {
        for (const listener of this.listeners) {
            try {
                listener(exhausted);
            } catch (error) {
                log.error('Error in quota state listener:', error);
            }
        }
    }
}

// Singleton instance
export const youtubeQuotaState = new YouTubeQuotaStateManager();

/**
 * User-facing messages for quota exhausted state (Georgian)
 */
export const QUOTA_EXHAUSTED_MESSAGES = {
    /** Short message for toast/alert */
    short: 'YouTube-ის კვოტა ამოიწურა. სცადეთ მოგვიანებით.',

    /** Message for verification button disabled state */
    buttonDisabled: 'ვერიფიკაცია დროებით მიუწვდომელია',

    /** Message with time until reset */
    withTimeRemaining: (timeRemaining: string) =>
        `YouTube-ის კვოტა ამოიწურა. განახლდება ${timeRemaining}-ში.`,

    /** Message for showing cached data */
    usingCache: 'ნაჩვენებია შენახული მონაცემები.',

    /** Full explanation message */
    full: 'YouTube API-ის დღიური ლიმიტი ამოიწურა. ვერიფიკაცია ხელმისაწვდომი იქნება შუაღამის შემდეგ (ამერიკის დრო).',
} as const;

/**
 * Check if an error indicates YouTube quota exhaustion
 * Checks for specific error patterns from YouTube API
 */
export function isQuotaExhaustedError(error: unknown): boolean {
    if (!error) return false;

    // Check error message
    const message = error instanceof Error ? error.message : String(error);
    const lowerMessage = message.toLowerCase();

    // YouTube quota error indicators
    const quotaIndicators = [
        'quotaexceeded',
        'dailylimitexceeded',
        'quota exceeded',
        'daily limit exceeded',
        'usagelimits',
        'rate limit exceeded',
    ];

    for (const indicator of quotaIndicators) {
        if (lowerMessage.includes(indicator)) {
            return true;
        }
    }

    // Check for 403 status - but be more conservative about treating as quota
    // Edge Functions may return "YouTube API error: 403" for various 403 reasons
    if (message.includes('YouTube API error: 403') || message.includes('403')) {
        // Exclude known non-quota 403 reasons before treating as quota
        const nonQuotaIndicators = [
            'forbidden',
            'permission',
            'access denied',
            'not authorized',
            'invalid api key',
            'api key not valid',
            'private video',
            'video unavailable',
        ];

        const isLikelyNonQuota = nonQuotaIndicators.some(indicator =>
            lowerMessage.includes(indicator)
        );

        // Only treat as quota if no non-quota indicators found
        if (!isLikelyNonQuota) {
            return true;
        }
    }

    return false;
}
