/**
 * usePosts Hook Tests
 */

import { usePosts } from '@/hooks/usePosts';
import { postService } from '@/services/supabase/postService';
import { act, renderHook, waitFor } from '@testing-library/react-native';

// Mock the postService
jest.mock('@/services/supabase/postService', () => ({
    postService: {
        getApprovedPostsWithUserUpvotes: jest.fn(),
        upvotePost: jest.fn(),
        removeUpvote: jest.fn(),
    },
}));

const mockPostService = postService as jest.Mocked<typeof postService>;

describe('usePosts', () => {
    const mockUserId = 'test-user-123';
    const mockPosts = [
        {
            id: 'post-1',
            user_id: 'author-1',
            title: 'First Post',
            content: 'Content 1',
            upvotes: 10,
            status: 'approved' as const,
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-01T00:00:00Z',
            isUpvoted: false,
            user: { full_name: 'Author One', avatar_url: null },
        },
        {
            id: 'post-2',
            user_id: 'author-2',
            title: 'Second Post',
            content: 'Content 2',
            upvotes: 5,
            status: 'approved' as const,
            created_at: '2024-01-02T00:00:00Z',
            updated_at: '2024-01-02T00:00:00Z',
            isUpvoted: true,
            user: { full_name: 'Author Two', avatar_url: 'https://example.com/avatar.jpg' },
        },
    ];

    beforeEach(() => {
        jest.clearAllMocks();
        mockPostService.getApprovedPostsWithUserUpvotes.mockResolvedValue(mockPosts);
    });

    describe('initial state', () => {
        it('should start with empty posts and not loading when no userId', () => {
            const { result } = renderHook(() => usePosts());

            expect(result.current.posts).toEqual([]);
            expect(result.current.isLoading).toBe(false);
            expect(result.current.error).toBeNull();
        });

        it('should auto-fetch posts when userId is provided', async () => {
            const { result } = renderHook(() => usePosts({ userId: mockUserId }));

            await waitFor(() => {
                expect(result.current.posts).toHaveLength(2);
            });

            expect(mockPostService.getApprovedPostsWithUserUpvotes).toHaveBeenCalledWith(
                mockUserId,
                20, // default limit
                0,  // initial offset
                'upvotes' // default sort
            );
        });

        it('should not auto-fetch when autoFetch is false', () => {
            renderHook(() => usePosts({ userId: mockUserId, autoFetch: false }));

            expect(mockPostService.getApprovedPostsWithUserUpvotes).not.toHaveBeenCalled();
        });
    });

    describe('fetching', () => {
        it('should set loading state while fetching', async () => {
            // Delay the response to check loading state
            mockPostService.getApprovedPostsWithUserUpvotes.mockImplementation(
                () => new Promise(resolve => setTimeout(() => resolve(mockPosts), 100))
            );

            const { result } = renderHook(() => usePosts({ userId: mockUserId }));

            expect(result.current.isLoading).toBe(true);

            await waitFor(() => {
                expect(result.current.isLoading).toBe(false);
            });
        });

        it('should handle fetch errors', async () => {
            mockPostService.getApprovedPostsWithUserUpvotes.mockRejectedValue(
                new Error('Network error')
            );

            const { result } = renderHook(() => usePosts({ userId: mockUserId }));

            await waitFor(() => {
                expect(result.current.error).not.toBeNull();
            });

            expect(result.current.error?.message).toBe('Network error');
            expect(result.current.posts).toEqual([]);
        });

        it('should use custom sort option', async () => {
            const { result } = renderHook(() =>
                usePosts({ userId: mockUserId, sortBy: 'latest' })
            );

            await waitFor(() => {
                expect(result.current.posts).toHaveLength(2);
            });

            expect(mockPostService.getApprovedPostsWithUserUpvotes).toHaveBeenCalledWith(
                mockUserId,
                20,
                0,
                'latest'
            );
        });
    });

    describe('pagination', () => {
        it('should set hasMore based on returned posts count', async () => {
            // Return less than limit = no more posts
            mockPostService.getApprovedPostsWithUserUpvotes.mockResolvedValue([mockPosts[0]]);

            const { result } = renderHook(() =>
                usePosts({ userId: mockUserId, limit: 10 })
            );

            await waitFor(() => {
                expect(result.current.hasMore).toBe(false);
            });
        });

        it('should load more posts on loadMore', async () => {
            const morePosts = [
                { ...mockPosts[0], id: 'post-3', title: 'Third Post' },
            ];

            mockPostService.getApprovedPostsWithUserUpvotes
                .mockResolvedValueOnce(mockPosts)
                .mockResolvedValueOnce(morePosts);

            const { result } = renderHook(() =>
                usePosts({ userId: mockUserId, limit: 2 })
            );

            await waitFor(() => {
                expect(result.current.posts).toHaveLength(2);
            });

            await act(async () => {
                await result.current.loadMore();
            });

            await waitFor(() => {
                expect(result.current.posts).toHaveLength(3);
            });
        });
    });

    describe('upvoting', () => {
        it('should upvote a post and update local state', async () => {
            mockPostService.upvotePost.mockResolvedValue({
                ...mockPosts[0],
                upvotes: 11,
            });

            const { result } = renderHook(() => usePosts({ userId: mockUserId }));

            await waitFor(() => {
                expect(result.current.posts).toHaveLength(2);
            });

            let success: boolean;
            await act(async () => {
                success = await result.current.upvote('post-1');
            });

            expect(success!).toBe(true);
            expect(mockPostService.upvotePost).toHaveBeenCalledWith('post-1', mockUserId);

            // Check local state updated
            const updatedPost = result.current.posts.find(p => p.id === 'post-1');
            expect(updatedPost?.upvotes).toBe(11);
            expect(updatedPost?.isUpvoted).toBe(true);
        });

        it('should handle upvote failure', async () => {
            mockPostService.upvotePost.mockRejectedValue(new Error('Already upvoted'));

            const { result } = renderHook(() => usePosts({ userId: mockUserId }));

            await waitFor(() => {
                expect(result.current.posts).toHaveLength(2);
            });

            let success: boolean;
            await act(async () => {
                success = await result.current.upvote('post-1');
            });

            expect(success!).toBe(false);
        });
    });

    describe('remove upvote', () => {
        it('should remove upvote and update local state', async () => {
            mockPostService.removeUpvote.mockResolvedValue({
                ...mockPosts[1],
                upvotes: 4,
            });

            const { result } = renderHook(() => usePosts({ userId: mockUserId }));

            await waitFor(() => {
                expect(result.current.posts).toHaveLength(2);
            });

            let success: boolean;
            await act(async () => {
                success = await result.current.removeUpvote('post-2');
            });

            expect(success!).toBe(true);

            const updatedPost = result.current.posts.find(p => p.id === 'post-2');
            expect(updatedPost?.upvotes).toBe(4);
            expect(updatedPost?.isUpvoted).toBe(false);
        });
    });

    describe('isUpvoted helper', () => {
        it('should return correct upvote status', async () => {
            const { result } = renderHook(() => usePosts({ userId: mockUserId }));

            await waitFor(() => {
                expect(result.current.posts).toHaveLength(2);
            });

            expect(result.current.isUpvoted('post-1')).toBe(false);
            expect(result.current.isUpvoted('post-2')).toBe(true);
            expect(result.current.isUpvoted('non-existent')).toBe(false);
        });
    });

    describe('refetch', () => {
        it('should reset and refetch posts', async () => {
            const { result } = renderHook(() => usePosts({ userId: mockUserId }));

            await waitFor(() => {
                expect(result.current.posts).toHaveLength(2);
            });

            const newPosts = [{ ...mockPosts[0], title: 'Updated Title' }];
            mockPostService.getApprovedPostsWithUserUpvotes.mockResolvedValue(newPosts);

            await act(async () => {
                await result.current.refetch();
            });

            await waitFor(() => {
                expect(result.current.posts[0].title).toBe('Updated Title');
            });
        });
    });
});
