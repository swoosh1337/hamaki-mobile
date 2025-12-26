/**
 * Sponsor Service
 *
 * Handles all sponsor and prize-related database operations.
 * No React dependencies - pure data access layer.
 *
 * Usage:
 *   import { sponsorService } from '@/services/supabase/sponsorService';
 *   const sponsors = await sponsorService.getActiveSponsorsWithPrizes();
 */

import { createLogger } from '@/utils/logger';
import { supabase } from './client';

const log = createLogger('Service:Sponsor');

/**
 * Prize for a specific rank
 */
export interface SponsorPrize {
    rank: number;
    amount: string;
    description?: string;
}

/**
 * Sponsor with their prizes
 */
export interface SponsorWithPrizes {
    id: string;
    name: string;
    thumbnail: string;
    description?: string;
    prizes: SponsorPrize[];
}

/**
 * Sponsor service for prize management
 */
export const sponsorService = {
    /**
     * Get all active sponsors with their prizes
     * Ordered by sort_order for consistent display
     */
    async getActiveSponsorsWithPrizes(): Promise<SponsorWithPrizes[]> {
        try {
            log.debug('Fetching active sponsors with prizes');

            const { data: sponsors, error } = await supabase
                .from('sponsors')
                .select(`
                    id,
                    name,
                    thumbnail,
                    description,
                    sponsor_prizes(rank, amount, description)
                `)
                .eq('is_active', true)
                .order('sort_order', { ascending: true });

            if (error) {
                log.error('Error fetching sponsors:', error);
                throw error;
            }

            const result: SponsorWithPrizes[] = (sponsors || []).map((sponsor: any) => ({
                id: sponsor.id,
                name: sponsor.name,
                thumbnail: sponsor.thumbnail,
                description: sponsor.description,
                prizes: (sponsor.sponsor_prizes || []).sort(
                    (a: SponsorPrize, b: SponsorPrize) => a.rank - b.rank
                ),
            }));

            log.debug('Fetched sponsors', { count: result.length });
            return result;
        } catch (error) {
            log.error('Error fetching sponsors:', error);
            throw error;
        }
    },
};
