import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
    // Handle CORS preflight requests
    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders })
    }

    try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
        const missingVars = []
        if (!supabaseUrl) missingVars.push('SUPABASE_URL')
        if (!supabaseServiceKey) missingVars.push('SUPABASE_SERVICE_ROLE_KEY')
        if (missingVars.length > 0) {
            throw new Error(`Missing environment variables: ${missingVars.join(', ')}`)
        }

        const supabase = createClient(supabaseUrl, supabaseServiceKey, {
            auth: {
                autoRefreshToken: false,
                persistSession: false
            }
        })

        console.log('Checking for scheduled posts to publish...')

        // Find posts that are scheduled to be published and the time has passed
        const { data: scheduledPosts, error: fetchError } = await supabase
            .from('content_posts')
            .select('*')
            .not('scheduled_publish_at', 'is', null)
            .eq('is_published', false)
            .lte('scheduled_publish_at', new Date().toISOString())

        if (fetchError) {
            console.error('Error fetching scheduled posts:', fetchError)
            throw fetchError
        }

        console.log(`Found ${scheduledPosts?.length || 0} posts to publish`)

        let publishedCount = 0
        if (scheduledPosts && scheduledPosts.length > 0) {
            // Update all scheduled posts to published
            const postIds = scheduledPosts.map(post => post.id)

            const { error: updateError } = await supabase
                .from('content_posts')
                .update({
                    is_published: true,
                    published_at: new Date().toISOString(),
                    scheduled_publish_at: null // Clear the schedule once published
                })
                .in('id', postIds)

            if (updateError) {
                console.error('Error updating posts:', updateError)
                throw updateError
            }

            publishedCount = postIds.length
            console.log(`Successfully published ${publishedCount} scheduled posts`)

            // Log each published post
            scheduledPosts.forEach(post => {
                console.log(`Published: "${post.title}" (ID: ${post.id})`)
            })
        }

        // Clean up old posts (older than 1 week)
        // IMPORTANT: Skip videos from YouTube channels (they have channelId in metadata)
        console.log('Checking for old posts to remove (excluding YouTube channel videos)...')
        const oneWeekAgo = new Date()
        oneWeekAgo.setDate(oneWeekAgo.getDate() - 7)

        // Get old posts that are NOT YouTube channel videos
        const { data: oldPosts, error: oldPostsError } = await supabase
            .from('content_posts')
            .select('id, title, published_at, metadata')
            .lt('published_at', oneWeekAgo.toISOString())
            .is('metadata->>channelId', null)
            .is('metadata->>channelKey', null)

        if (oldPostsError) {
            console.error('Error fetching old posts:', oldPostsError)
        } else if (oldPosts && oldPosts.length > 0) {
            console.log(`Found ${oldPosts.length} old non-channel posts to unpublish`)

            const oldPostIds = oldPosts.map(post => post.id)

                const { error: unfeaturedError } = await supabase
                    .from('content_posts')
                    .update({
                        is_featured: false,
                        featured_order: 0,
                        is_published: false // Also unpublish old posts from regular feed
                    })
                    .in('id', oldPostIds)

                if (unfeaturedError) {
                    console.error('Error unfeaturing old posts:', unfeaturedError)
            } else {
                console.log(`Successfully unpublished ${oldPostIds.length} old posts`)
                oldPosts.forEach(post => {
                    console.log(`Unpublished: "${post.title}" (Published: ${post.published_at})`)
                })
            }
        } else {
            console.log('No old posts to remove')
        }

        // ============ CLEANUP USER POSTS TABLE (max 30 posts) ============
        console.log('Checking user posts table for cleanup (max 30 posts)...')

        // Count total posts in posts table
        const { count: totalPosts, error: countError } = await supabase
            .from('posts')
            .select('*', { count: 'exact', head: true })

        if (countError) {
            console.error('Error counting posts:', countError)
        } else {
            console.log(`Total user posts: ${totalPosts}`)

            if (totalPosts && totalPosts > 30) {
                const postsToDelete = totalPosts - 30
                console.log(`Need to delete ${postsToDelete} oldest posts to maintain 30 limit`)

                // Get the oldest posts that exceed the limit
                const { data: oldestPosts, error: oldestError } = await supabase
                    .from('posts')
                    .select('id, title, created_at')
                    .order('created_at', { ascending: true })
                    .limit(postsToDelete)

                if (oldestError) {
                    console.error('Error fetching oldest posts:', oldestError)
                } else if (oldestPosts && oldestPosts.length > 0) {
                    const idsToDelete = oldestPosts.map(p => p.id)

                    // First delete related upvotes
                    const { error: upvotesError } = await supabase
                        .from('post_upvotes')
                        .delete()
                        .in('post_id', idsToDelete)

                    if (upvotesError) {
                        console.error('Error deleting related upvotes:', upvotesError)
                    }

                    // Then delete the posts
                    const { error: deleteError } = await supabase
                        .from('posts')
                        .delete()
                        .in('id', idsToDelete)

                    if (deleteError) {
                        console.error('Error deleting old posts:', deleteError)
                    } else {
                        console.log(`Successfully deleted ${oldestPosts.length} oldest user posts:`)
                        oldestPosts.forEach(post => {
                            console.log(`  Deleted: "${post.title}" (Created: ${post.created_at})`)
                        })
                    }
                }
            } else {
                console.log('User posts count is within limit (≤30)')
            }
        }

        return new Response(
            JSON.stringify({
                success: true,
                publishedCount: publishedCount,
                publishedPosts: scheduledPosts?.map(p => ({ id: p.id, title: p.title })) || [],
            }),
            {
                headers: {
                    ...corsHeaders,
                    'Content-Type': 'application/json'
                }
            }
        )

    } catch (error) {
        console.error('Error in publish-scheduled-posts function:', error)
        const errorMessage = error instanceof Error ? error.message : String(error)
        return new Response(
            JSON.stringify({
                error: errorMessage,
                success: false
            }),
            {
                status: 500,
                headers: {
                    ...corsHeaders,
                    'Content-Type': 'application/json'
                }
            }
        )
    }
})
