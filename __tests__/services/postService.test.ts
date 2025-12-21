/**
 * Post Service Tests
 */

import { supabase } from '@/services/supabase/client';
import { postService } from '@/services/supabase/postService';

// Mock the Supabase client
jest.mock('@/services/supabase/client', () => ({
    supabase: {
        from: jest.fn(),
    },
}));

describe('postService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('createPost', () => {
        it('should create a post successfully', async () => {
            const mockPost = {
                id: 'post-1',
                user_id: 'user-1',
                title: 'Test Post Title',
                content: 'This is test content for the post',
                status: 'pending',
                upvotes: 0,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            };

            (supabase.from as jest.Mock).mockReturnValue({
                insert: jest.fn().mockReturnValue({
                    select: jest.fn().mockReturnValue({
                        single: jest.fn().mockResolvedValue({ data: mockPost, error: null }),
                    }),
                }),
            });

            const result = await postService.createPost({
                userId: 'user-1',
                title: 'Test Post Title',
                content: 'This is test content for the post',
            });

            expect(result).toEqual(mockPost);
            expect(supabase.from).toHaveBeenCalledWith('posts');
        });

        it('should throw error for title too short', async () => {
            await expect(
                postService.createPost({
                    userId: 'user-1',
                    title: 'Hi',
                    content: 'This is valid content for the post',
                })
            ).rejects.toThrow('Title must be between 5 and 100 characters');
        });

        it('should throw error for content too short', async () => {
            await expect(
                postService.createPost({
                    userId: 'user-1',
                    title: 'Valid Title',
                    content: 'Short',
                })
            ).rejects.toThrow('Content must be between 10 and 1000 characters');
        });

        it('should include category when provided', async () => {
            const mockPost = {
                id: 'post-1',
                user_id: 'user-1',
                title: 'Test Post Title',
                content: 'This is test content for the post',
                category: 'feature-request',
                status: 'pending',
                upvotes: 0,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            };

            const insertMock = jest.fn().mockReturnValue({
                select: jest.fn().mockReturnValue({
                    single: jest.fn().mockResolvedValue({ data: mockPost, error: null }),
                }),
            });

            (supabase.from as jest.Mock).mockReturnValue({
                insert: insertMock,
            });

            await postService.createPost({
                userId: 'user-1',
                title: 'Test Post Title',
                content: 'This is test content for the post',
                category: 'feature-request',
            });

            expect(insertMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    category: 'feature-request',
                })
            );
        });
    });

    describe('getApprovedPosts', () => {
        it('should fetch approved posts sorted by upvotes', async () => {
            const mockPosts = [
                { id: 'post-1', title: 'Post 1', upvotes: 10 },
                { id: 'post-2', title: 'Post 2', upvotes: 5 },
            ];

            (supabase.from as jest.Mock).mockReturnValue({
                select: jest.fn().mockReturnValue({
                    eq: jest.fn().mockReturnValue({
                        order: jest.fn().mockReturnValue({
                            order: jest.fn().mockReturnValue({
                                range: jest.fn().mockResolvedValue({ data: mockPosts, error: null }),
                            }),
                        }),
                    }),
                }),
            });

            const result = await postService.getApprovedPosts();

            expect(result).toEqual(mockPosts);
            expect(supabase.from).toHaveBeenCalledWith('posts');
        });

        it('should return empty array on error', async () => {
            (supabase.from as jest.Mock).mockReturnValue({
                select: jest.fn().mockReturnValue({
                    eq: jest.fn().mockReturnValue({
                        order: jest.fn().mockReturnValue({
                            order: jest.fn().mockReturnValue({
                                range: jest.fn().mockResolvedValue({ data: null, error: { message: 'Error' } }),
                            }),
                        }),
                    }),
                }),
            });

            const result = await postService.getApprovedPosts();

            expect(result).toEqual([]);
        });
    });

    describe('upvotePost', () => {
        it('should upvote a post successfully', async () => {
            const mockPost = {
                id: 'post-1',
                upvotes: 1,
            };

            // Mock no existing upvote
            const selectMock = jest.fn()
                .mockReturnValueOnce({
                    eq: jest.fn().mockReturnValue({
                        eq: jest.fn().mockReturnValue({
                            single: jest.fn().mockResolvedValue({ data: null, error: null }),
                        }),
                    }),
                })
                .mockReturnValueOnce({
                    eq: jest.fn().mockResolvedValue({ count: 1, error: null }),
                });

            const insertMock = jest.fn().mockResolvedValue({ error: null });
            const updateMock = jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({
                    select: jest.fn().mockReturnValue({
                        single: jest.fn().mockResolvedValue({ data: mockPost, error: null }),
                    }),
                }),
            });

            (supabase.from as jest.Mock)
                .mockReturnValueOnce({ select: selectMock })  // Check existing upvote
                .mockReturnValueOnce({ insert: insertMock })   // Insert upvote
                .mockReturnValueOnce({ select: selectMock })   // Get upvote count
                .mockReturnValueOnce({ update: updateMock });  // Update post

            const result = await postService.upvotePost('post-1', 'user-1');

            expect(result).toEqual(mockPost);
        });

        it('should throw error if user already upvoted', async () => {
            (supabase.from as jest.Mock).mockReturnValue({
                select: jest.fn().mockReturnValue({
                    eq: jest.fn().mockReturnValue({
                        eq: jest.fn().mockReturnValue({
                            single: jest.fn().mockResolvedValue({ data: { id: 'upvote-1' }, error: null }),
                        }),
                    }),
                }),
            });

            await expect(
                postService.upvotePost('post-1', 'user-1')
            ).rejects.toThrow('User has already upvoted this post');
        });
    });

    describe('removeUpvote', () => {
        it('should throw error if user has not upvoted', async () => {
            (supabase.from as jest.Mock).mockReturnValue({
                select: jest.fn().mockReturnValue({
                    eq: jest.fn().mockReturnValue({
                        eq: jest.fn().mockReturnValue({
                            single: jest.fn().mockResolvedValue({ data: null, error: null }),
                        }),
                    }),
                }),
            });

            await expect(
                postService.removeUpvote('post-1', 'user-1')
            ).rejects.toThrow('User has not upvoted this post');
        });
    });

    describe('getPostUpvoteCount', () => {
        it('should return upvote count', async () => {
            (supabase.from as jest.Mock).mockReturnValue({
                select: jest.fn().mockReturnValue({
                    eq: jest.fn().mockResolvedValue({ count: 5, error: null }),
                }),
            });

            const result = await postService.getPostUpvoteCount('post-1');

            expect(result).toBe(5);
        });

        it('should return 0 on error', async () => {
            (supabase.from as jest.Mock).mockReturnValue({
                select: jest.fn().mockReturnValue({
                    eq: jest.fn().mockResolvedValue({ count: null, error: { message: 'Error' } }),
                }),
            });

            const result = await postService.getPostUpvoteCount('post-1');

            expect(result).toBe(0);
        });
    });
});
