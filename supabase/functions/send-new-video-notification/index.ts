/**
 * send-new-video-notification Edge Function
 * 
 * Sends push notifications to all users when a new video is uploaded.
 * Uses batching to respect Expo Push API rate limits (600/minute).
 */

// @ts-nocheck - Deno runtime types
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { errorResponse } from '../_shared/response.ts';

const BATCH_SIZE = 500;
const BATCH_DELAY_MS = 2 * 60 * 1000; // 2 minutes

// Initialize Supabase client
const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface ExpoPushMessage {
    to: string;
    title: string;
    body: string;
    data?: Record<string, unknown>;
    sound?: string;
}

interface ExpoPushTicket {
    status: 'ok' | 'error';
    id?: string;
    details?: {
        error: 'DeviceNotRegistered' | 'InvalidCredentials' | 'MessageTooBig' | 'MessageRateExceeded';
    };
}

interface NotificationPayload {
    channelKey: string;
    channelName: string;
    videoId: string;
    videoTitle: string;
    thumbnail?: string;
}

/**
 * Helper to chunk array into batches
 */
function chunk<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
        chunks.push(array.slice(i, i + size));
    }
    return chunks;
}

/**
 * Sleep helper
 */
function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Send a batch of push notifications via Expo
 */
async function sendBatch(messages: ExpoPushMessage[]): Promise<ExpoPushTicket[]> {
    const response = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
        },
        body: JSON.stringify(messages),
    });

    if (!response.ok) {
        throw new Error(`Expo Push API error: ${response.status}`);
    }

    const result = await response.json();
    return result.data || [];
}

/**
 * Handle push tickets and clear invalid tokens
 */
async function handlePushTickets(
    supabase: ReturnType<typeof createClient>,
    tickets: ExpoPushTicket[],
    messages: ExpoPushMessage[]
): Promise<number> {
    const invalidTokens: string[] = [];

    tickets.forEach((ticket, index) => {
        if (ticket.status === 'error') {
            if (ticket.details?.error === 'DeviceNotRegistered') {
                // Token is no longer valid - user uninstalled app
                invalidTokens.push(messages[index].to);
            }
        }
    });

    // Clear invalid tokens from database
    if (invalidTokens.length > 0) {
        await supabase
            .from('users')
            .update({ expo_push_token: null })
            .in('expo_push_token', invalidTokens);
    }

    return invalidTokens.length;
}

/**
 * Main handler
 */
Deno.serve(async (req: Request) => {
    console.log('[send-new-video-notification] Request received:', {
        method: req.method,
        url: req.url,
        timestamp: new Date().toISOString(),
    });

    try {
        // Only allow POST requests
        if (req.method !== 'POST') {
            console.error('[send-new-video-notification] Method not allowed:', req.method);
            return new Response(
                JSON.stringify({ success: false, error: 'Method not allowed' }),
                { status: 405, headers: { 'Content-Type': 'application/json' } }
            );
        }

        // Parse request body
        let payload: NotificationPayload;
        try {
            payload = await req.json();
            console.log('[send-new-video-notification] Payload:', {
                channelKey: payload.channelKey,
                videoId: payload.videoId,
                videoTitle: payload.videoTitle?.substring(0, 50),
            });
        } catch (parseError) {
            console.error('[send-new-video-notification] Failed to parse body:', parseError);
            return new Response(
                JSON.stringify({ success: false, error: 'Invalid JSON body' }),
                { status: 400, headers: { 'Content-Type': 'application/json' } }
            );
        }

        const { channelKey, channelName, videoId, videoTitle } = payload;

        if (!videoId || !videoTitle) {
            console.error('[send-new-video-notification] Missing required fields');
            return new Response(
                JSON.stringify({ success: false, error: 'Missing videoId or videoTitle' }),
                { status: 400, headers: { 'Content-Type': 'application/json' } }
            );
        }

        // Create Supabase client
        const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

        // Query all users with push tokens and notifications enabled
        const { data: users, error } = await supabase
            .from('users')
            .select('id, expo_push_token')
            .not('expo_push_token', 'is', null)
            .eq('push_notifications_enabled', true);

        if (error) {
            console.error('Failed to query users:', error);
            return new Response(
                JSON.stringify({ success: false, error: 'Failed to query users' }),
                { status: 500, headers: { 'Content-Type': 'application/json' } }
            );
        }

        if (!users || users.length === 0) {
            return new Response(
                JSON.stringify({
                    success: true,
                    message: 'No users with push tokens',
                    sent: 0
                }),
                { status: 200, headers: { 'Content-Type': 'application/json' } }
            );
        }

        // Build push messages
        const messages: ExpoPushMessage[] = users.map(user => ({
            to: user.expo_push_token,
            title: '🎬 ახალი ვიდეო დაიდოოო!',
            body: videoTitle,
            data: {
                videoId,
                channelKey,
                channelName,
                type: 'new_video',
            },
            sound: 'default',
        }));

        // Process in batches
        const batches = chunk(messages, BATCH_SIZE);
        let totalSent = 0;
        let totalInvalidCleared = 0;

        for (let i = 0; i < batches.length; i++) {
            const batch = batches[i];

            try {
                // Send batch
                const tickets = await sendBatch(batch);

                // Handle failures (invalid tokens)
                const invalidCleared = await handlePushTickets(supabase, tickets, batch);

                totalSent += batch.length - invalidCleared;
                totalInvalidCleared += invalidCleared;

                console.log(`Batch ${i + 1}/${batches.length}: sent ${batch.length}, cleared ${invalidCleared} invalid tokens`);

                // Wait before next batch (except for last batch)
                if (i < batches.length - 1) {
                    console.log(`Waiting ${BATCH_DELAY_MS / 1000}s before next batch...`);
                    await sleep(BATCH_DELAY_MS);
                }
            } catch (batchError) {
                console.error(`Batch ${i + 1} failed:`, batchError);
                // Continue with next batch
            }
        }

        return new Response(
            JSON.stringify({
                success: true,
                totalUsers: users.length,
                totalSent,
                totalInvalidCleared,
                batches: batches.length,
                videoTitle,
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
    } catch (error) {
        console.error('Error sending notifications:', error);
        return errorResponse('Failed to send notifications', 500, 'INTERNAL_ERROR');
    }
});
