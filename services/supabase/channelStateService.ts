/**
 * Channel State Service
 *
 * Provides read-only access to server-synced YouTube channel state.
 * The youtube_channel_state table is updated by a server-side Edge Function,
 * this service only reads from it.
 *
 * ⚠️ This service NEVER calls YouTube API directly.
 */

import type { ChannelKey, YouTubeChannelState } from '@/types/youtube';
import { createLogger } from '@/utils/logger';
import { supabase } from './client';

const log = createLogger('Service:ChannelState');

/**
 * Channel state service for reading server-synced video data
 */
export const channelStateService = {
    /**
     * Get all channel states ordered by latest video date
     * Used for displaying the video likes feed
     */
    async getAll(): Promise<YouTubeChannelState[]> {
        try {
            const { data, error } = await supabase
                .from('youtube_channel_state')
                .select('*')
                .order('latest_video_published_at', { ascending: false });

            if (error) {
                log.error('Error fetching channel states:', error);
                throw error;
            }

            return data || [];
        } catch (error) {
            log.error('Exception fetching channel states:', error);
            throw error;
        }
    },

    /**
     * Get a single channel state by channel key
     */
    async getByChannelKey(channelKey: ChannelKey): Promise<YouTubeChannelState | null> {
        try {
            const { data, error } = await supabase
                .from('youtube_channel_state')
                .select('*')
                .eq('channel_key', channelKey)
                .single();

            if (error && error.code !== 'PGRST116') {
                log.error(`Error fetching channel state for ${channelKey}:`, error);
                throw error;
            }

            return data;
        } catch (error) {
            log.error(`Exception fetching channel state for ${channelKey}:`, error);
            throw error;
        }
    },

    /**
     * Get channel state by channel ID
     */
    async getByChannelId(channelId: string): Promise<YouTubeChannelState | null> {
        try {
            const { data, error } = await supabase
                .from('youtube_channel_state')
                .select('*')
                .eq('channel_id', channelId)
                .single();

            if (error && error.code !== 'PGRST116') {
                log.error(`Error fetching channel state for ${channelId}:`, error);
                throw error;
            }

            return data;
        } catch (error) {
            log.error(`Exception fetching channel state for ${channelId}:`, error);
            throw error;
        }
    },

    /**
     * Check if any channel has stale data (last_checked_at > 6 hours ago)
     * Useful for showing a "data may be outdated" warning
     */
    async hasStaleData(): Promise<boolean> {
        try {
            const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();

            const { data, error } = await supabase
                .from('youtube_channel_state')
                .select('channel_key')
                .lt('last_checked_at', sixHoursAgo)
                .limit(1);

            if (error) {
                log.warn('Error checking for stale data:', error);
                return false;
            }

            return (data?.length ?? 0) > 0;
        } catch {
            return false;
        }
    },
};
