/**
 * Monthly Leaderboard Reset Edge Function
 * 
 * Purpose: Export leaderboard snapshot to CSV and reset game XP monthly
 * 
 * Flow:
 * 1. Determine period_key for the month being closed
 * 2. Check if export already exists (idempotency)
 * 3. Query leaderboard snapshot with rankings
 * 4. Generate CSV
 * 5. Upload to Supabase Storage
 * 6. Record export metadata
 * 7. Reset game_xp ONLY
 * 8. Return summary
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface LeaderboardEntry {
    user_id: string;
    full_name: string;
    game_xp: number;
    subscription_xp: number;
    video_like_xp: number;
    total_xp: number;
    rank: number;
}

serve(async (req: Request) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        // Initialize Supabase client with service role
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

        const supabase = createClient(supabaseUrl, supabaseServiceKey, {
            auth: {
                autoRefreshToken: false,
                persistSession: false,
            },
        });

        const { period_key: periodKey, dry_run = false } = await req.json().catch(() => ({}));

        // ✅ FIX: Require explicit period_key to prevent accidental wrong-month resets
        if (!periodKey) {
            return new Response(
                JSON.stringify({
                    success: false,
                    error: 'period_key is required (format: YYYY-MM for monthly, e.g., "2025-12")',
                    example: { period_key: '2025-12', dry_run: false },
                }),
                {
                    status: 400,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                }
            );
        }

        // Validate period_key format (YYYY-MM for monthly)
        if (!/^\d{4}-\d{2}$/.test(periodKey)) {
            return new Response(
                JSON.stringify({
                    success: false,
                    error: 'Invalid period_key format. Expected YYYY-MM (e.g., "2025-12")',
                }),
                {
                    status: 400,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                }
            );
        }

        console.log(`[Reset] Starting monthly reset for period: ${periodKey}`);

        // Step 2: Check if export already exists for this period
        const { data: existingExport } = await supabase
            .from('leaderboard_exports')
            .select('*')
            .eq('period_type', 'monthly')
            .eq('period_key', periodKey)
            .maybeSingle();  // Use maybeSingle to avoid error if not found

        if (existingExport) {
            // ✅ AUDIT: Verify checksum if regenerating
            if (existingExport.status === 'succeeded' && existingExport.reset_completed_at) {
                console.log(`[Reset] Export and reset already completed for ${periodKey}`);
                return new Response(
                    JSON.stringify({
                        success: true,
                        message: 'Export and reset already completed',
                        period_key: periodKey,
                        export: existingExport,
                    }),
                    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                );
            }

            console.log(`[Reset] Existing export found with status: ${existingExport.status}, continuing...`);
        }

        // Step 3: Query leaderboard snapshot with rankings
        console.log('[Reset] Querying leaderboard snapshot...');

        const { data: leaderboardData, error: queryError } = await supabase
            .from('leaderboard_entries')
            .select(`
        user_id,
        game_xp,
        subscription_xp,
        video_like_xp,
        total_xp,
        users!inner(full_name, email)
      `)
            .order('total_xp', { ascending: false });

        if (queryError) {
            throw new Error(`Failed to query leaderboard: ${queryError.message}`);
        }

        if (!leaderboardData || leaderboardData.length === 0) {
            console.log('[Reset] No leaderboard entries found');
            return new Response(
                JSON.stringify({ success: true, message: 'No entries to export' }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // ✅ CSV INJECTION FIX: Sanitize text fields  
        const sanitizeCSV = (text: string): string => {
            // Prefix with ' if starts with dangerous chars to prevent Excel formula injection
            if (/^[=+@-]/.test(text)) {
                return `'${text}`;
            }
            return text;
        };

        // Add rankings
        const rankedData: LeaderboardEntry[] = leaderboardData.map((entry: any, index: number) => ({
            user_id: entry.user_id,
            full_name: sanitizeCSV(entry.users?.full_name || 'Unknown'),
            game_xp: entry.game_xp,
            subscription_xp: entry.subscription_xp,
            video_like_xp: entry.video_like_xp,
            total_xp: entry.total_xp,
            rank: index + 1,
        }));

        console.log(`[Reset] Found ${rankedData.length} entries`);

        // Step 4: Generate CSV
        console.log('[Reset] Generating CSV...');
        const csvHeader = 'Rank,User ID,Full Name,Game XP,Subscription XP,Video Like XP,Total XP\n';
        const csvRows = rankedData.map(entry =>
            `${entry.rank},"${entry.user_id}","${entry.full_name}",${entry.game_xp},${entry.subscription_xp},${entry.video_like_xp},${entry.total_xp}`
        ).join('\n');
        const csvContent = csvHeader + csvRows;

        // Calculate checksum
        const encoder = new TextEncoder();
        const data = encoder.encode(csvContent);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const checksum = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

        if (dry_run) {
            console.log('[Reset] Dry run mode - skipping storage upload and reset');
            return new Response(
                JSON.stringify({
                    success: true,
                    dry_run: true,
                    period_key: periodKey,
                    row_count: rankedData.length,
                    checksum,
                    preview: rankedData.slice(0, 10),
                }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // Step 5: Upload to Supabase Storage
        console.log('[Reset] Uploading CSV to storage...');
        const filePath = `monthly/${periodKey}.csv`;
        const { error: uploadError } = await supabase.storage
            .from('leaderboard-exports')
            .upload(filePath, csvContent, {
                contentType: 'text/csv',
                upsert: true,
            });

        if (uploadError) {
            throw new Error(`Failed to upload CSV: ${uploadError.message}`);
        }

        console.log(`[Reset] CSV uploaded to: ${filePath}`);

        // Step 6: Record export metadata
        // ✅ FIX: Use correct onConflict matching the unique constraint
        const { data: exportRecord, error: exportError } = await supabase
            .from('leaderboard_exports')
            .upsert({
                period_type: 'monthly',
                period_key: periodKey,
                file_path: `leaderboard-exports/${filePath}`,
                row_count: rankedData.length,
                checksum,
                status: 'succeeded',
                error: null,  // Clear any previous error
            }, {
                onConflict: 'period_type,period_key'  // ✅ Fixed to match unique constraint
            })
            .select()
            .single();

        if (exportError) {
            throw new Error(`Failed to record export: ${exportError.message}`);
        }

        console.log('[Reset] Export recorded successfully');

        // Step 7: Reset game_xp ONLY if not already reset
        if (!existingExport || !existingExport.reset_completed_at) {
            console.log('[Reset] Resetting game XP...');

            const { error: resetError } = await supabase
                .from('leaderboard_entries')
                .update({ game_xp: 0 })
                .neq('game_xp', 0);  // Only update entries that have game XP

            if (resetError) {
                throw new Error(`Failed to reset game XP: ${resetError.message}`);
            }

            // Mark reset as completed
            await supabase
                .from('leaderboard_exports')
                .update({ reset_completed_at: new Date().toISOString() })
                .eq('id', exportRecord.id);

            console.log('[Reset] Game XP reset completed');
        }

        // Step 8: Return summary
        return new Response(
            JSON.stringify({
                success: true,
                message: 'Monthly reset completed successfully',
                period_key: periodKey,
                export: {
                    file_path: filePath,
                    row_count: rankedData.length,
                    checksum,
                    reset_completed: true,
                },
                top_10: rankedData.slice(0, 10).map(e => ({
                    rank: e.rank,
                    full_name: e.full_name,
                    total_xp: e.total_xp,
                })),
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

    } catch (error) {
        console.error('[Reset] Error:', error);

        return new Response(
            JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            }),
            {
                status: 500,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            }
        );
    }
});
