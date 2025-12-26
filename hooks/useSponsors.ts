/**
 * useSponsors Hook
 *
 * Fetches active sponsors with their prizes.
 * Simple wrapper around sponsorService.
 *
 * Architecture:
 *   UI → useSponsors → sponsorService → Supabase
 *
 * Usage:
 * ```typescript
 * const { sponsors, isLoading, refetch } = useSponsors();
 * ```
 */

import { sponsorService, SponsorWithPrizes } from '@/services/supabase/sponsorService';
import { createLogger } from '@/utils/logger';
import { useCallback, useEffect, useState } from 'react';

const log = createLogger('Hook:Sponsors');

/**
 * Hook return type
 */
export interface UseSponsorsReturn {
    /** List of active sponsors with their prizes */
    sponsors: SponsorWithPrizes[];
    /** Loading state */
    isLoading: boolean;
    /** Error state */
    error: Error | null;
    /** Refetch sponsors */
    refetch: () => Promise<void>;
}

interface UseSponsorsOptions {
    /** Auto-fetch on mount (default: true) */
    autoFetch?: boolean;
}

/**
 * Hook for fetching active sponsors with prizes
 */
export function useSponsors(options: UseSponsorsOptions = {}): UseSponsorsReturn {
    const { autoFetch = true } = options;

    const [sponsors, setSponsors] = useState<SponsorWithPrizes[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<Error | null>(null);

    const fetchSponsors = useCallback(async () => {
        try {
            setIsLoading(true);
            setError(null);
            log.debug('Fetching sponsors');

            const data = await sponsorService.getActiveSponsorsWithPrizes();
            setSponsors(data);

            log.debug('Sponsors fetched', { count: data.length });
        } catch (err) {
            const error = err instanceof Error ? err : new Error('Failed to fetch sponsors');
            log.error('Error fetching sponsors', error);
            setError(error);
        } finally {
            setIsLoading(false);
        }
    }, []);

    const refetch = useCallback(async () => {
        await fetchSponsors();
    }, [fetchSponsors]);

    useEffect(() => {
        if (autoFetch) {
            fetchSponsors();
        }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    return {
        sponsors,
        isLoading,
        error,
        refetch,
    };
}
