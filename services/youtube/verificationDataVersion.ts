/**
 * Verification Data Version Service
 * 
 * Tracks when verification data has been updated so hooks can refresh.
 * Uses a simple version number stored in AsyncStorage.
 */

import { createLogger } from '@/utils/logger';
import AsyncStorage from '@react-native-async-storage/async-storage';

const log = createLogger('VerificationDataVersion');

const DATA_VERSION_KEY = 'verification_data_version';

/**
 * Get the current data version
 */
export async function getDataVersion(): Promise<number> {
    try {
        const version = await AsyncStorage.getItem(DATA_VERSION_KEY);
        return version ? parseInt(version, 10) : 0;
    } catch {
        return 0;
    }
}

/**
 * Increment the data version (call after background verification updates DB)
 */
export async function incrementDataVersion(): Promise<number> {
    try {
        const current = await getDataVersion();
        const newVersion = current + 1;
        await AsyncStorage.setItem(DATA_VERSION_KEY, newVersion.toString());
        log.debug('Data version incremented to', newVersion);
        return newVersion;
    } catch (error) {
        log.error('Failed to increment data version', error);
        return 0;
    }
}

/**
 * Check if data needs refresh by comparing versions
 */
export async function hasNewerData(lastKnownVersion: number): Promise<boolean> {
    const currentVersion = await getDataVersion();
    return currentVersion > lastKnownVersion;
}
