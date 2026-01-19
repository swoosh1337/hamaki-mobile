import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
    ActivityIndicator,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';

import { PostListItem } from '@/components/ideas/PostListItem';
import { ProfilePostSkeleton } from '@/components/ui/SkeletonLoader';
import { Colors } from '@/constants/Colors';
import type { Post } from '@/types';

interface PostListProps {
    posts: Post[];
    isLoading: boolean;
    error: string | null;
    hasMore: boolean;
    upvotingPosts: Set<string>;
    onUpvote: (postId: string) => void;
    onLoadMore: () => void;
}

/**
 * PostList Component
 * 
 * Displays a list of community posts with loading states, empty states,
 * and infinite scroll functionality.
 */
export const PostList: React.FC<PostListProps> = ({
    posts,
    isLoading,
    error,
    hasMore,
    upvotingPosts,
    onUpvote,
    onLoadMore,
}) => {
    // Loading state - show skeletons
    if (isLoading && posts.length === 0) {
        return (
            <>
                {[...Array(5)].map((_, index) => (
                    <ProfilePostSkeleton key={`community-post-skeleton-${index}`} />
                ))}
            </>
        );
    }

    // Empty state
    if (!isLoading && posts.length === 0 && !error) {
        return (
            <View style={styles.emptyPostsContainer}>
                <Ionicons name="people-outline" size={64} color={Colors.dark.tabIconDefault} />
                <Text style={styles.emptyTitle}>Community-ის პოსტები არ არსებობს</Text>
                <Text style={styles.emptyDescription}>
                   იყავი პირველი ვინც დაპოსტავს
                </Text>
            </View>
        );
    }

    // Posts list
    return (
        <>
            {posts.map((post) => (
                <PostListItem
                    key={post.id}
                    post={post}
                    onUpvote={onUpvote}
                    isUpvoting={upvotingPosts.has(post.id)}
                />
            ))}

            {/* Load More Button */}
            {hasMore && (
                <TouchableOpacity
                    style={styles.loadMoreButton}
                    onPress={onLoadMore}
                    disabled={isLoading}
                >
                    {isLoading ? (
                        <ActivityIndicator size="small" color={Colors.dark.tint} />
                    ) : (
                        <Text style={styles.loadMoreText}>Load More</Text>
                    )}
                </TouchableOpacity>
            )}
        </>
    );
};

const styles = StyleSheet.create({
    emptyPostsContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        padding: 40,
        minHeight: 300,
    },
    emptyTitle: {
        fontSize: 24,
        fontFamily: 'SpaceMono',
        color: Colors.dark.tint,
        marginTop: 16,
        marginBottom: 8,
    },
    emptyDescription: {
        fontSize: 16,
        fontFamily: 'SpaceMono',
        color: Colors.dark.text,
        textAlign: 'center',
        opacity: 0.7,
        lineHeight: 24,
    },
    loadMoreButton: {
        alignItems: 'center',
        padding: 16,
        marginTop: 8,
    },
    loadMoreText: {
        color: Colors.dark.tint,
        fontSize: 16,
        fontWeight: '500',
    },
});
