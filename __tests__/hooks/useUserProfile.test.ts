/**
 * useUserProfile Hook Tests
 */

import { useUserProfile } from '@/hooks/useUserProfile';
import { userService } from '@/services/supabase/userService';
import { act, renderHook, waitFor } from '@testing-library/react-native';

// Mock the userService
jest.mock('@/services/supabase/userService', () => ({
    userService: {
        getUserProfile: jest.fn(),
        getUserProfileById: jest.fn(),
        getUserXPStats: jest.fn(),
        updateUserAvatar: jest.fn(),
        updateUsername: jest.fn(),
        updateUserXP: jest.fn(),
    },
}));

const mockUserService = userService as jest.Mocked<typeof userService>;

describe('useUserProfile', () => {
    const mockGoogleId = 'google-123';
    const mockUserId = 'user-456';

    const mockProfile = {
        id: mockUserId,
        google_id: mockGoogleId,
        email: 'test@example.com',
        full_name: 'Test User',
        avatar_url: 'https://example.com/avatar.jpg',
        xp_points: 1000,
        is_subscribed: true,
        youtube_subscribed: true,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
    };

    const mockXPStats = {
        totalXP: 1000,
        weeklyXP: 150,
        weeklyStartDate: '2024-01-01T00:00:00Z',
        weeklyEndDate: '2024-01-07T23:59:59Z',
    };

    beforeEach(() => {
        jest.clearAllMocks();
        mockUserService.getUserProfile.mockResolvedValue(mockProfile);
        mockUserService.getUserProfileById.mockResolvedValue(mockProfile);
        mockUserService.getUserXPStats.mockResolvedValue(mockXPStats);
    });

    describe('initial state', () => {
        it('should start with null profile when no IDs provided', () => {
            const { result } = renderHook(() => useUserProfile());

            expect(result.current.profile).toBeNull();
            expect(result.current.xpStats).toBeNull();
            expect(result.current.isLoading).toBe(false);
            expect(result.current.error).toBeNull();
        });

        it('should not auto-fetch when autoFetch is false', () => {
            renderHook(() => useUserProfile({ googleId: mockGoogleId, autoFetch: false }));

            expect(mockUserService.getUserProfile).not.toHaveBeenCalled();
        });
    });

    describe('fetching by googleId', () => {
        it('should fetch profile by googleId', async () => {
            const { result } = renderHook(() => useUserProfile({ googleId: mockGoogleId }));

            await waitFor(() => {
                expect(result.current.profile).not.toBeNull();
            });

            expect(mockUserService.getUserProfile).toHaveBeenCalledWith(mockGoogleId);
            expect(result.current.profile?.full_name).toBe('Test User');
        });

        it('should also fetch XP stats after profile', async () => {
            const { result } = renderHook(() => useUserProfile({ googleId: mockGoogleId }));

            await waitFor(() => {
                expect(result.current.xpStats).not.toBeNull();
            });

            expect(mockUserService.getUserXPStats).toHaveBeenCalledWith(mockGoogleId);
            expect(result.current.xpStats?.totalXP).toBe(1000);
            expect(result.current.xpStats?.weeklyXP).toBe(150);
        });
    });

    describe('fetching by userId', () => {
        it('should fetch profile by userId', async () => {
            const { result } = renderHook(() => useUserProfile({ userId: mockUserId }));

            await waitFor(() => {
                expect(result.current.profile).not.toBeNull();
            });

            expect(mockUserService.getUserProfileById).toHaveBeenCalledWith(mockUserId);
        });
    });

    describe('error handling', () => {
        it('should handle profile not found', async () => {
            mockUserService.getUserProfile.mockResolvedValue(null);

            const { result } = renderHook(() => useUserProfile({ googleId: mockGoogleId }));

            await waitFor(() => {
                expect(result.current.error).not.toBeNull();
            });

            expect(result.current.error?.message).toBe('Profile not found');
        });

        it('should handle fetch errors', async () => {
            mockUserService.getUserProfile.mockRejectedValue(new Error('Database error'));

            const { result } = renderHook(() => useUserProfile({ googleId: mockGoogleId }));

            await waitFor(() => {
                expect(result.current.error).not.toBeNull();
            });

            expect(result.current.error?.message).toBe('Database error');
        });
    });

    describe('updateAvatar', () => {
        it('should update avatar successfully', async () => {
            const updatedProfile = { ...mockProfile, avatar_url: 'new-avatar.jpg' };
            mockUserService.updateUserAvatar.mockResolvedValue(updatedProfile);

            const { result } = renderHook(() => useUserProfile({ googleId: mockGoogleId }));

            await waitFor(() => {
                expect(result.current.profile).not.toBeNull();
            });

            let success: boolean;
            await act(async () => {
                success = await result.current.updateAvatar('new-avatar.jpg');
            });

            expect(success!).toBe(true);
            expect(mockUserService.updateUserAvatar).toHaveBeenCalledWith(mockGoogleId, 'new-avatar.jpg');
            expect(result.current.profile?.avatar_url).toBe('new-avatar.jpg');
        });

        it('should return false when no profile exists', async () => {
            const { result } = renderHook(() => useUserProfile({ autoFetch: false }));

            let success: boolean;
            await act(async () => {
                success = await result.current.updateAvatar('new-avatar.jpg');
            });

            expect(success!).toBe(false);
        });

        it('should handle update failure', async () => {
            mockUserService.updateUserAvatar.mockResolvedValue(null);

            const { result } = renderHook(() => useUserProfile({ googleId: mockGoogleId }));

            await waitFor(() => {
                expect(result.current.profile).not.toBeNull();
            });

            let success: boolean;
            await act(async () => {
                success = await result.current.updateAvatar('invalid-avatar');
            });

            expect(success!).toBe(false);
        });
    });

    describe('updateUsername', () => {
        it('should update username successfully', async () => {
            const updatedProfile = { ...mockProfile, full_name: 'New Username' };
            mockUserService.updateUsername.mockResolvedValue(updatedProfile);

            const { result } = renderHook(() => useUserProfile({ googleId: mockGoogleId }));

            await waitFor(() => {
                expect(result.current.profile).not.toBeNull();
            });

            let success: boolean;
            await act(async () => {
                success = await result.current.updateUsername('New Username');
            });

            expect(success!).toBe(true);
            expect(mockUserService.updateUsername).toHaveBeenCalledWith(mockGoogleId, 'New Username');
            expect(result.current.profile?.full_name).toBe('New Username');
        });

        it('should throw validation errors', async () => {
            mockUserService.updateUsername.mockRejectedValue(
                new Error('Username must be between 2 and 30 characters')
            );

            const { result } = renderHook(() => useUserProfile({ googleId: mockGoogleId }));

            await waitFor(() => {
                expect(result.current.profile).not.toBeNull();
            });

            await expect(result.current.updateUsername('X')).rejects.toThrow(
                'Username must be between 2 and 30 characters'
            );
        });
    });

    describe('addXP', () => {
        it('should add XP successfully', async () => {
            mockUserService.updateUserXP.mockResolvedValue(true);
            mockUserService.getUserXPStats.mockResolvedValue({
                ...mockXPStats,
                totalXP: 1100,
            });

            const { result } = renderHook(() => useUserProfile({ googleId: mockGoogleId }));

            await waitFor(() => {
                expect(result.current.profile).not.toBeNull();
            });

            let success: boolean;
            await act(async () => {
                success = await result.current.addXP(100);
            });

            expect(success!).toBe(true);
            expect(mockUserService.updateUserXP).toHaveBeenCalledWith(mockGoogleId, 1100);
            expect(result.current.profile?.xp_points).toBe(1100);
        });

        it('should return false when no profile exists', async () => {
            const { result } = renderHook(() => useUserProfile({ autoFetch: false }));

            let success: boolean;
            await act(async () => {
                success = await result.current.addXP(100);
            });

            expect(success!).toBe(false);
        });

        it('should handle XP update failure', async () => {
            mockUserService.updateUserXP.mockResolvedValue(false);

            const { result } = renderHook(() => useUserProfile({ googleId: mockGoogleId }));

            await waitFor(() => {
                expect(result.current.profile).not.toBeNull();
            });

            let success: boolean;
            await act(async () => {
                success = await result.current.addXP(100);
            });

            expect(success!).toBe(false);
        });
    });

    describe('refetch', () => {
        it('should refetch profile data', async () => {
            const { result } = renderHook(() => useUserProfile({ googleId: mockGoogleId }));

            await waitFor(() => {
                expect(result.current.profile).not.toBeNull();
            });

            // Update mock
            const updatedProfile = { ...mockProfile, xp_points: 2000 };
            mockUserService.getUserProfile.mockResolvedValue(updatedProfile);

            await act(async () => {
                await result.current.refetch();
            });

            await waitFor(() => {
                expect(result.current.profile?.xp_points).toBe(2000);
            });
        });
    });

    describe('loading state', () => {
        it('should set loading while fetching', async () => {
            mockUserService.getUserProfile.mockImplementation(
                () => new Promise(resolve => setTimeout(() => resolve(mockProfile), 100))
            );

            const { result } = renderHook(() => useUserProfile({ googleId: mockGoogleId }));

            expect(result.current.isLoading).toBe(true);

            await waitFor(() => {
                expect(result.current.isLoading).toBe(false);
            });
        });
    });
});
