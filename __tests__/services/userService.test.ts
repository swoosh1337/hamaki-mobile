/**
 * UserService Unit Tests
 */

import { supabase } from '@/services/supabase/client';
import { userService } from '@/services/supabase/userService';

// Mock the Supabase client
jest.mock('@/services/supabase/client', () => ({
    supabase: {
        from: jest.fn(),
    },
}));

const mockSupabase = supabase as jest.Mocked<typeof supabase>;

describe('userService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    const mockUser = {
        id: 'user-123',
        google_id: 'google-123',
        email: 'test@example.com',
        full_name: 'Test User',
        avatar_url: 'https://example.com/avatar.jpg',
        xp_points: 1000,
        youtube_subscribed: true,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
    };

    describe('getUserProfile', () => {
        it('should return user profile by google_id', async () => {
            (mockSupabase.from as jest.Mock).mockReturnValue({
                select: jest.fn().mockReturnValue({
                    eq: jest.fn().mockReturnValue({
                        single: jest.fn().mockResolvedValue({ data: mockUser, error: null }),
                    }),
                }),
            });

            const result = await userService.getUserProfile('google-123');

            expect(result).toEqual(mockUser);
            expect(mockSupabase.from).toHaveBeenCalledWith('users');
        });

        it('should return null when user not found', async () => {
            (mockSupabase.from as jest.Mock).mockReturnValue({
                select: jest.fn().mockReturnValue({
                    eq: jest.fn().mockReturnValue({
                        single: jest.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
                    }),
                }),
            });

            const result = await userService.getUserProfile('non-existent');

            expect(result).toBeNull();
        });

        it('should return null on error', async () => {
            (mockSupabase.from as jest.Mock).mockReturnValue({
                select: jest.fn().mockReturnValue({
                    eq: jest.fn().mockReturnValue({
                        single: jest.fn().mockResolvedValue({ data: null, error: { message: 'DB Error' } }),
                    }),
                }),
            });

            const result = await userService.getUserProfile('google-123');

            expect(result).toBeNull();
        });
    });

    describe('getUserProfileById', () => {
        it('should return user profile by id', async () => {
            (mockSupabase.from as jest.Mock).mockReturnValue({
                select: jest.fn().mockReturnValue({
                    eq: jest.fn().mockReturnValue({
                        single: jest.fn().mockResolvedValue({ data: mockUser, error: null }),
                    }),
                }),
            });

            const result = await userService.getUserProfileById('user-123');

            expect(result).toEqual(mockUser);
        });

        it('should return null when user not found', async () => {
            (mockSupabase.from as jest.Mock).mockReturnValue({
                select: jest.fn().mockReturnValue({
                    eq: jest.fn().mockReturnValue({
                        single: jest.fn().mockResolvedValue({ data: null, error: null }),
                    }),
                }),
            });

            const result = await userService.getUserProfileById('non-existent');

            expect(result).toBeNull();
        });
    });

    describe('upsertUserProfile', () => {
        // Note: upsertUserProfile has complex internal logic (checks existing user, then updates or inserts)
        // These tests focus on error handling; full integration tests cover the happy path

        it('should return null on error', async () => {
            (mockSupabase.from as jest.Mock).mockReturnValue({
                select: jest.fn().mockReturnValue({
                    eq: jest.fn().mockReturnValue({
                        single: jest.fn().mockResolvedValue({ data: null, error: { message: 'Connection error' } }),
                    }),
                }),
            });

            const result = await userService.upsertUserProfile({
                googleId: 'google-123',
                email: 'test@example.com',
                fullName: 'Test',
                isSubscribed: true,
            });

            expect(result).toBeNull();
        });

        it('should handle network exceptions gracefully', async () => {
            (mockSupabase.from as jest.Mock).mockReturnValue({
                select: jest.fn().mockReturnValue({
                    eq: jest.fn().mockReturnValue({
                        single: jest.fn().mockRejectedValue(new Error('Network failure')),
                    }),
                }),
            });

            const result = await userService.upsertUserProfile({
                googleId: 'google-123',
                email: 'test@example.com',
                fullName: 'Test',
                isSubscribed: true,
            });

            expect(result).toBeNull();
        });
    });

    describe('updateUserXP', () => {
        it('should update user XP successfully', async () => {
            (mockSupabase.from as jest.Mock).mockReturnValue({
                update: jest.fn().mockReturnValue({
                    eq: jest.fn().mockResolvedValue({ error: null }),
                }),
            });

            const result = await userService.updateUserXP('google-123', 1500);

            expect(result).toBe(true);
        });

        it('should return false on error', async () => {
            (mockSupabase.from as jest.Mock).mockReturnValue({
                update: jest.fn().mockReturnValue({
                    eq: jest.fn().mockResolvedValue({ error: { message: 'Update failed' } }),
                }),
            });

            const result = await userService.updateUserXP('google-123', 1500);

            expect(result).toBe(false);
        });
    });

    describe('updateUserAvatar', () => {
        it('should update avatar successfully', async () => {
            const updatedUser = { ...mockUser, avatar_url: 'avatar-1' };

            (mockSupabase.from as jest.Mock).mockReturnValue({
                update: jest.fn().mockReturnValue({
                    eq: jest.fn().mockReturnValue({
                        select: jest.fn().mockReturnValue({
                            single: jest.fn().mockResolvedValue({ data: updatedUser, error: null }),
                        }),
                    }),
                }),
            });

            const result = await userService.updateUserAvatar('google-123', 'avatar-1');

            expect(result).toEqual(updatedUser);
            expect(result?.avatar_url).toBe('avatar-1');
        });

        it('should return null on database error', async () => {
            (mockSupabase.from as jest.Mock).mockReturnValue({
                update: jest.fn().mockReturnValue({
                    eq: jest.fn().mockReturnValue({
                        select: jest.fn().mockReturnValue({
                            single: jest.fn().mockResolvedValue({ data: null, error: { message: 'Error' } }),
                        }),
                    }),
                }),
            });

            const result = await userService.updateUserAvatar('google-123', 'https://example.com/avatar.jpg');

            expect(result).toBeNull();
        });

        it('should throw error for invalid avatar', async () => {
            await expect(
                userService.updateUserAvatar('google-123', 'not-a-valid-avatar')
            ).rejects.toThrow('Invalid avatar selection');
        });
    });

    describe('updateUsername', () => {
        it('should update username successfully', async () => {
            const updatedUser = { ...mockUser, full_name: 'New Username' };

            (mockSupabase.from as jest.Mock).mockReturnValue({
                update: jest.fn().mockReturnValue({
                    eq: jest.fn().mockReturnValue({
                        select: jest.fn().mockReturnValue({
                            single: jest.fn().mockResolvedValue({ data: updatedUser, error: null }),
                        }),
                    }),
                }),
            });

            const result = await userService.updateUsername('google-123', 'New Username');

            expect(result).toEqual(updatedUser);
            expect(result?.full_name).toBe('New Username');
        });

        it('should throw error for username too short', async () => {
            await expect(
                userService.updateUsername('google-123', 'A')
            ).rejects.toThrow('Username must be between 2 and 30 characters');
        });

        it('should throw error for username too long', async () => {
            await expect(
                userService.updateUsername('google-123', 'A'.repeat(31))
            ).rejects.toThrow('Username must be between 2 and 30 characters');
        });

        it('should throw error for invalid characters in username', async () => {
            await expect(
                userService.updateUsername('google-123', 'User@Name!')
            ).rejects.toThrow('Username can only contain letters, numbers, and spaces');
        });
    });

    describe('getUserXPStats', () => {
        it('should return null on error', async () => {
            (mockSupabase.from as jest.Mock).mockReturnValue({
                select: jest.fn().mockReturnValue({
                    eq: jest.fn().mockReturnValue({
                        single: jest.fn().mockResolvedValue({ data: null, error: { message: 'Error' } }),
                    }),
                }),
            });

            const result = await userService.getUserXPStats('google-123');

            expect(result).toBeNull();
        });

        it('should handle missing user gracefully', async () => {
            (mockSupabase.from as jest.Mock).mockReturnValue({
                select: jest.fn().mockReturnValue({
                    eq: jest.fn().mockReturnValue({
                        single: jest.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
                    }),
                }),
            });

            const result = await userService.getUserXPStats('non-existent');

            expect(result).toBeNull();
        });
    });

    describe('getGoogleIdByUserId', () => {
        it('should return google_id for user', async () => {
            (mockSupabase.from as jest.Mock).mockReturnValue({
                select: jest.fn().mockReturnValue({
                    eq: jest.fn().mockReturnValue({
                        single: jest.fn().mockResolvedValue({
                            data: { google_id: 'google-123' },
                            error: null
                        }),
                    }),
                }),
            });

            const result = await userService.getGoogleIdByUserId('user-123');

            expect(result).toBe('google-123');
        });

        it('should return null when user not found', async () => {
            (mockSupabase.from as jest.Mock).mockReturnValue({
                select: jest.fn().mockReturnValue({
                    eq: jest.fn().mockReturnValue({
                        single: jest.fn().mockResolvedValue({
                            data: null,
                            error: { code: 'PGRST116' }
                        }),
                    }),
                }),
            });

            const result = await userService.getGoogleIdByUserId('non-existent');

            expect(result).toBeNull();
        });
    });

    describe('error handling', () => {
        it('should handle network errors gracefully', async () => {
            (mockSupabase.from as jest.Mock).mockReturnValue({
                select: jest.fn().mockReturnValue({
                    eq: jest.fn().mockReturnValue({
                        single: jest.fn().mockRejectedValue(new Error('Network error')),
                    }),
                }),
            });

            const result = await userService.getUserProfile('google-123');

            expect(result).toBeNull();
        });
    });

    describe('deleteUserAccount', () => {
        it('should successfully delete user account', async () => {
            (mockSupabase.from as jest.Mock).mockReturnValue({
                delete: jest.fn().mockReturnValue({
                    eq: jest.fn().mockResolvedValue({ error: null }),
                }),
            });

            const result = await userService.deleteUserAccount('google-123');

            expect(result).toBe(true);
            expect(mockSupabase.from).toHaveBeenCalledWith('users');
        });

        it('should return false when deletion fails', async () => {
            const mockError = { message: 'Database error', code: '500' };
            (mockSupabase.from as jest.Mock).mockReturnValue({
                delete: jest.fn().mockReturnValue({
                    eq: jest.fn().mockResolvedValue({ error: mockError }),
                }),
            });

            const result = await userService.deleteUserAccount('google-123');

            expect(result).toBe(false);
        });

        it('should return false when exception occurs', async () => {
            (mockSupabase.from as jest.Mock).mockImplementation(() => {
                throw new Error('Network error');
            });

            const result = await userService.deleteUserAccount('google-123');

            expect(result).toBe(false);
        });

        it('should call delete with correct google_id', async () => {
            const mockEq = jest.fn().mockResolvedValue({ error: null });
            const mockDelete = jest.fn().mockReturnValue({
                eq: mockEq,
            });
            (mockSupabase.from as jest.Mock).mockReturnValue({
                delete: mockDelete,
            });

            await userService.deleteUserAccount('google-456');

            expect(mockDelete).toHaveBeenCalled();
            expect(mockEq).toHaveBeenCalledWith('google_id', 'google-456');
        });
    });
});
