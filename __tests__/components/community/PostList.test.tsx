import type { Post } from '@/types';
import { fireEvent, render } from '@testing-library/react-native';
import React from 'react';
import { PostList } from '../../../components/community/PostList';

// Mock the ProfilePostSkeleton component
jest.mock('../../../components/ui/SkeletonLoader', () => ({
    ProfilePostSkeleton: () => {
        const { View, Text } = require('react-native');
        return (
            <View testID="profile-post-skeleton">
                <Text>Loading...</Text>
            </View>
        );
    },
}));

// Mock the PostListItem component
jest.mock('../../../components/ideas/PostListItem', () => ({
    PostListItem: ({ post, onUpvote, isUpvoting }: any) => {
        const { Text, TouchableOpacity } = require('react-native');
        return (
            <TouchableOpacity
                testID={`post-item-${post.id}`}
                onPress={() => onUpvote(post.id)}
                disabled={isUpvoting}
            >
                <Text>{post.title}</Text>
                <Text>{post.upvotes} upvotes</Text>
            </TouchableOpacity>
        );
    },
}));

describe('PostList', () => {
    const mockPosts: Post[] = [
        {
            id: '1',
            title: 'Test Post 1',
            content: 'Content 1',
            upvotes: 10,
            user_id: 'user-1',
            status: 'approved',
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-01T00:00:00Z',
        },
        {
            id: '2',
            title: 'Test Post 2',
            content: 'Content 2',
            upvotes: 5,
            user_id: 'user-2',
            status: 'approved',
            created_at: '2024-01-02T00:00:00Z',
            updated_at: '2024-01-02T00:00:00Z',
        },
    ];

    const mockOnUpvote = jest.fn();
    const mockOnLoadMore = jest.fn();

    const defaultProps = {
        posts: mockPosts,
        isLoading: false,
        error: null,
        hasMore: false,
        upvotingPosts: new Set<string>(),
        onUpvote: mockOnUpvote,
        onLoadMore: mockOnLoadMore,
    };

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('Rendering Posts', () => {
        it('should render all posts', () => {
            const { getByText } = render(<PostList {...defaultProps} />);

            expect(getByText('Test Post 1')).toBeTruthy();
            expect(getByText('Test Post 2')).toBeTruthy();
        });

        it('should render post upvote counts', () => {
            const { getByText } = render(<PostList {...defaultProps} />);

            expect(getByText('10 upvotes')).toBeTruthy();
            expect(getByText('5 upvotes')).toBeTruthy();
        });

        it('should pass correct props to PostListItem', () => {
            const { getByTestId } = render(<PostList {...defaultProps} />);

            const post1 = getByTestId('post-item-1');
            const post2 = getByTestId('post-item-2');

            expect(post1).toBeTruthy();
            expect(post2).toBeTruthy();
        });

        it('should handle empty posts array', () => {
            const { queryByTestId } = render(
                <PostList {...defaultProps} posts={[]} />
            );

            expect(queryByTestId('post-item-1')).toBeNull();
            expect(queryByTestId('post-item-2')).toBeNull();
        });
    });

    describe('Loading State', () => {
        it('should show skeleton loaders when loading with no posts', () => {
            const { getAllByTestId } = render(
                <PostList {...defaultProps} posts={[]} isLoading={true} />
            );

            const skeletons = getAllByTestId('profile-post-skeleton');
            expect(skeletons).toHaveLength(5); // Default skeleton count
        });

        it('should not show skeletons when loading with existing posts', () => {
            const { queryByTestId, getByText } = render(
                <PostList {...defaultProps} isLoading={true} />
            );

            // Should show posts, not skeletons
            expect(getByText('Test Post 1')).toBeTruthy();
            expect(queryByTestId('profile-post-skeleton')).toBeNull();
        });

        it('should not show posts when loading from empty state', () => {
            const { queryByText } = render(
                <PostList {...defaultProps} posts={[]} isLoading={true} />
            );

            expect(queryByText('Test Post 1')).toBeNull();
            expect(queryByText('Test Post 2')).toBeNull();
        });
    });

    describe('Empty State', () => {
        it('should show empty state when no posts and not loading', () => {
            const { getByText } = render(
                <PostList {...defaultProps} posts={[]} isLoading={false} />
            );

            expect(getByText('No Community Posts Yet')).toBeTruthy();
            expect(
                getByText(/Be the first to share a video idea/)
            ).toBeTruthy();
        });

        it('should not show empty state when posts exist', () => {
            const { queryByText } = render(<PostList {...defaultProps} />);

            expect(queryByText('No Community Posts Yet')).toBeNull();
        });

        it('should not show empty state when loading', () => {
            const { queryByText } = render(
                <PostList {...defaultProps} posts={[]} isLoading={true} />
            );

            expect(queryByText('No Community Posts Yet')).toBeNull();
        });

        it('should not show empty state when there is an error', () => {
            const { queryByText } = render(
                <PostList
                    {...defaultProps}
                    posts={[]}
                    isLoading={false}
                    error="Network error"
                />
            );

            expect(queryByText('No Community Posts Yet')).toBeNull();
        });

        it('should render empty state icon', () => {
            const { UNSAFE_getByType } = render(
                <PostList {...defaultProps} posts={[]} isLoading={false} />
            );

            const icon = UNSAFE_getByType(require('@expo/vector-icons').Ionicons);
            expect(icon).toBeTruthy();
        });
    });

    describe('Load More Functionality', () => {
        it('should show Load More button when hasMore is true', () => {
            const { getByText } = render(
                <PostList {...defaultProps} hasMore={true} />
            );

            expect(getByText('Load More')).toBeTruthy();
        });

        it('should not show Load More button when hasMore is false', () => {
            const { queryByText } = render(
                <PostList {...defaultProps} hasMore={false} />
            );

            expect(queryByText('Load More')).toBeNull();
        });

        it('should call onLoadMore when Load More is pressed', () => {
            const { getByText } = render(
                <PostList {...defaultProps} hasMore={true} />
            );

            fireEvent.press(getByText('Load More'));

            expect(mockOnLoadMore).toHaveBeenCalledTimes(1);
        });

        it('should show loading indicator when loading more posts', () => {
            const { queryByText, UNSAFE_getByType } = render(
                <PostList {...defaultProps} hasMore={true} isLoading={true} />
            );

            // Should not show "Load More" text when loading
            expect(queryByText('Load More')).toBeNull();

            // Should show ActivityIndicator
            const ActivityIndicator = require('react-native').ActivityIndicator;
            expect(UNSAFE_getByType(ActivityIndicator)).toBeTruthy();
        });

        it('should show loading indicator instead of text when loading more', () => {
            const { queryByText, UNSAFE_getByType } = render(
                <PostList {...defaultProps} hasMore={true} isLoading={true} />
            );

            // Should not show "Load More" text
            expect(queryByText('Load More')).toBeNull();

            // Should show ActivityIndicator
            const ActivityIndicator = require('react-native').ActivityIndicator;
            expect(UNSAFE_getByType(ActivityIndicator)).toBeTruthy();
        });
    });

    describe('Upvote Functionality', () => {
        it('should call onUpvote when post is pressed', () => {
            const { getByTestId } = render(<PostList {...defaultProps} />);

            fireEvent.press(getByTestId('post-item-1'));

            expect(mockOnUpvote).toHaveBeenCalledTimes(1);
            expect(mockOnUpvote).toHaveBeenCalledWith('1');
        });

        it('should pass upvoting state to post items', () => {
            const upvotingSet = new Set(['1']);
            const { getByTestId } = render(
                <PostList {...defaultProps} upvotingPosts={upvotingSet} />
            );

            const post1 = getByTestId('post-item-1');
            expect(post1.props.disabled).toBe(true);
        });

        it('should not disable posts that are not being upvoted', () => {
            const upvotingSet = new Set(['1']);
            const { getByTestId } = render(
                <PostList {...defaultProps} upvotingPosts={upvotingSet} />
            );

            const post2 = getByTestId('post-item-2');
            expect(post2.props.disabled).toBe(false);
        });

        it('should handle upvoting multiple posts', () => {
            const { getByTestId } = render(<PostList {...defaultProps} />);

            fireEvent.press(getByTestId('post-item-1'));
            fireEvent.press(getByTestId('post-item-2'));

            expect(mockOnUpvote).toHaveBeenCalledTimes(2);
            expect(mockOnUpvote).toHaveBeenNthCalledWith(1, '1');
            expect(mockOnUpvote).toHaveBeenNthCalledWith(2, '2');
        });
    });

    describe('Error Handling', () => {
        it('should still render posts when there is an error', () => {
            const { getByText } = render(
                <PostList {...defaultProps} error="Network error" />
            );

            // Posts should still be visible
            expect(getByText('Test Post 1')).toBeTruthy();
            expect(getByText('Test Post 2')).toBeTruthy();
        });

        it('should not show empty state with error and posts', () => {
            const { queryByText } = render(
                <PostList {...defaultProps} error="Network error" />
            );

            expect(queryByText('No Community Posts Yet')).toBeNull();
        });
    });

    describe('Edge Cases', () => {
        it('should handle single post', () => {
            const singlePost = [mockPosts[0]];
            const { getByText, queryByText } = render(
                <PostList {...defaultProps} posts={singlePost} />
            );

            expect(getByText('Test Post 1')).toBeTruthy();
            expect(queryByText('Test Post 2')).toBeNull();
        });

        it('should handle large number of posts', () => {
            const manyPosts = Array.from({ length: 100 }, (_, i) => ({
                ...mockPosts[0],
                id: `post-${i}`,
                title: `Post ${i}`,
            }));

            const { getAllByTestId } = render(
                <PostList {...defaultProps} posts={manyPosts} />
            );

            const postItems = getAllByTestId(/^post-item-/);
            expect(postItems).toHaveLength(100);
        });

        it('should handle rapid upvote clicks', () => {
            const { getByTestId } = render(<PostList {...defaultProps} />);

            const post = getByTestId('post-item-1');
            fireEvent.press(post);
            fireEvent.press(post);
            fireEvent.press(post);

            expect(mockOnUpvote).toHaveBeenCalledTimes(3);
        });

        it('should handle rapid load more clicks', () => {
            const { getByText } = render(
                <PostList {...defaultProps} hasMore={true} />
            );

            const loadMoreButton = getByText('Load More');
            fireEvent.press(loadMoreButton);
            fireEvent.press(loadMoreButton);

            expect(mockOnLoadMore).toHaveBeenCalledTimes(2);
        });
    });
});
