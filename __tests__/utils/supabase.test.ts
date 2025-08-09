import { supabase, userService } from '../../utils/supabase';
import {
    createMockSupabaseResponse,
    createMockUserProfile,
    mockCurrentTime,
    restoreTime,
} from '../__helpers__/testHelpers';

// Mock the Supabase client
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    from: jest.fn(),
  })),
}));

describe('Supabase Utils', () => {
  let mockFrom: jest.MockedFunction<any>;
  let mockSelect: jest.MockedFunction<any>;
  let mockUpsert: jest.MockedFunction<any>;
  let mockUpdate: jest.MockedFunction<any>;
  let mockEq: jest.MockedFunction<any>;
  let mockOrder: jest.MockedFunction<any>;
  let mockLimit: jest.MockedFunction<any>;
  let mockSingle: jest.MockedFunction<any>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCurrentTime();
    
    // Create a chain of mocked methods
    mockSelect = jest.fn().mockReturnThis();
    mockUpsert = jest.fn().mockReturnThis();
    mockUpdate = jest.fn().mockReturnThis();
    mockEq = jest.fn().mockReturnThis();
    mockOrder = jest.fn().mockReturnThis();
    mockLimit = jest.fn().mockReturnThis();
    mockSingle = jest.fn();

    mockFrom = jest.fn(() => ({
      select: mockSelect,
      upsert: mockUpsert,
      update: mockUpdate,
      eq: mockEq,
      order: mockOrder,
      limit: mockLimit,
      single: mockSingle,
    }));

    (supabase as any).from = mockFrom;
  });

  afterEach(() => {
    restoreTime();
  });

  describe('userService.upsertUserProfile', () => {
    const mockUserData = {
      googleId: 'google-test-id',
      email: 'test@example.com',
      fullName: 'Test User',
      avatarUrl: 'https://test.com/avatar.jpg',
      isSubscribed: true,
    };

    it('should create new user profile when user does not exist', async () => {
      // Mock getUserProfile to return null (user doesn't exist)
      mockSingle.mockResolvedValueOnce(createMockSupabaseResponse(null, { code: 'PGRST116' }));
      
      // Mock successful insert
      const newUserProfile = createMockUserProfile({
        google_id: mockUserData.googleId,
        email: mockUserData.email,
        full_name: mockUserData.fullName,
        avatar_url: mockUserData.avatarUrl,
        youtube_subscribed: mockUserData.isSubscribed,
      });
      mockSingle.mockResolvedValueOnce(createMockSupabaseResponse(newUserProfile));

      const result = await userService.upsertUserProfile(mockUserData);

      expect(result).toEqual(newUserProfile);
      expect(mockFrom).toHaveBeenCalledWith('users');
      expect(mockUpsert).toHaveBeenCalledWith(expect.objectContaining({
        google_id: mockUserData.googleId,
        email: mockUserData.email,
        full_name: mockUserData.fullName,
        avatar_url: mockUserData.avatarUrl,
        youtube_subscribed: mockUserData.isSubscribed,
        xp_points: 0,
      }), { onConflict: 'google_id', returning: 'minimal' });
    });

    it('should update existing user when data has changed', async () => {
      const existingUser = createMockUserProfile({
        google_id: mockUserData.googleId,
        email: 'old@example.com', // Different email
        full_name: mockUserData.fullName,
        avatar_url: mockUserData.avatarUrl,
        youtube_subscribed: false, // Different subscription status
      });

      // Mock getUserProfile to return existing user
      mockSingle.mockResolvedValueOnce(createMockSupabaseResponse(existingUser));
      
      // Mock successful update
      const updatedUser = { ...existingUser, email: mockUserData.email, youtube_subscribed: true };
      mockSingle.mockResolvedValueOnce(createMockSupabaseResponse(updatedUser));

      const result = await userService.upsertUserProfile(mockUserData);

      expect(result).toEqual(updatedUser);
      expect(mockUpsert).toHaveBeenCalledWith(expect.objectContaining({
        google_id: mockUserData.googleId,
        email: mockUserData.email,
        full_name: mockUserData.fullName,
        avatar_url: mockUserData.avatarUrl,
        youtube_subscribed: mockUserData.isSubscribed,
      }), { onConflict: 'google_id', returning: 'minimal' });
    });

    it('should return existing user when no update is needed', async () => {
      const existingUser = createMockUserProfile({
        google_id: mockUserData.googleId,
        email: mockUserData.email,
        full_name: mockUserData.fullName,
        avatar_url: mockUserData.avatarUrl,
        youtube_subscribed: mockUserData.isSubscribed,
      });

      // Mock getUserProfile to return existing user with same data
      mockSingle.mockResolvedValueOnce(createMockSupabaseResponse(existingUser));
      // Upsert returns the same user
      mockSingle.mockResolvedValueOnce(createMockSupabaseResponse(existingUser));

      const result = await userService.upsertUserProfile(mockUserData);

      expect(result).toEqual(existingUser);
      // With upsert, we don't call update or insert directly
      expect(mockUpsert).toHaveBeenCalled();
    });

    it('should handle insert errors', async () => {
      // Mock getUserProfile to return null
      mockSingle.mockResolvedValueOnce(createMockSupabaseResponse(null, { code: 'PGRST116' }));
      
      // Mock insert error
      mockSingle.mockResolvedValueOnce(createMockSupabaseResponse(null, { message: 'Insert error' }));

      const result = await userService.upsertUserProfile(mockUserData);

      expect(result).toBeNull();
      expect(console.error).toHaveBeenCalledWith('Error upserting user profile:', { message: 'Insert error' });
    });

    it('should handle upsert errors for existing user', async () => {
      const existingUser = createMockUserProfile({
        google_id: mockUserData.googleId,
        email: 'old@example.com',
      });

      // Mock getUserProfile to return existing user
      mockSingle.mockResolvedValueOnce(createMockSupabaseResponse(existingUser));
      // Mock upsert error
      mockSingle.mockResolvedValueOnce(createMockSupabaseResponse(null, { message: 'Update error' }));

      const result = await userService.upsertUserProfile(mockUserData);

      expect(result).toBeNull();
      expect(console.error).toHaveBeenCalledWith('Error upserting user profile:', { message: 'Update error' });
    });

    it('should handle exceptions gracefully', async () => {
      // Mock getUserProfile to throw exception
      mockSingle.mockRejectedValueOnce(new Error('Network error'));

      const result = await userService.upsertUserProfile(mockUserData);

      expect(result).toBeNull();
      expect(console.error).toHaveBeenCalledWith('Error upserting user profile:', expect.any(Error));
    });
  });

  describe('userService.getUserProfile', () => {
    it('should retrieve user profile successfully', async () => {
      const userProfile = createMockUserProfile();
      mockSingle.mockResolvedValue(createMockSupabaseResponse(userProfile));

      const result = await userService.getUserProfile('google-test-id');

      expect(result).toEqual(userProfile);
      expect(mockFrom).toHaveBeenCalledWith('users');
      expect(mockSelect).toHaveBeenCalledWith('*');
      expect(mockEq).toHaveBeenCalledWith('google_id', 'google-test-id');
    });

    it('should return null when user not found', async () => {
      mockSingle.mockResolvedValue(createMockSupabaseResponse(null, { code: 'PGRST116' }));

      const result = await userService.getUserProfile('non-existent-id');

      expect(result).toBeNull();
    });

    it('should handle database errors', async () => {
      mockSingle.mockResolvedValue(createMockSupabaseResponse(null, { message: 'Database error' }));

      const result = await userService.getUserProfile('google-test-id');

      expect(result).toBeNull();
      expect(console.error).toHaveBeenCalledWith('Error fetching user profile:', { message: 'Database error' });
    });

    it('should handle exceptions', async () => {
      mockSingle.mockRejectedValue(new Error('Connection error'));

      const result = await userService.getUserProfile('google-test-id');

      expect(result).toBeNull();
      expect(console.error).toHaveBeenCalledWith('Error fetching user profile:', expect.any(Error));
    });
  });

  describe('userService.updateUserXP', () => {
    it('should update user XP successfully', async () => {
      const mockUpdate = jest.fn().mockResolvedValue(createMockSupabaseResponse({}, null));
      mockEq.mockReturnValue({ mockUpdate });

      // Mock the update chain properly
      (supabase as any).from = jest.fn(() => ({
        update: jest.fn(() => ({
          eq: jest.fn().mockResolvedValue(createMockSupabaseResponse({}, null)),
        })),
      }));

      const result = await userService.updateUserXP('google-test-id', 150);

      expect(result).toBe(true);
    });

    it('should handle XP update errors', async () => {
      (supabase as any).from = jest.fn(() => ({
        update: jest.fn(() => ({
          eq: jest.fn().mockResolvedValue(createMockSupabaseResponse(null, { message: 'Update error' })),
        })),
      }));

      const result = await userService.updateUserXP('google-test-id', 150);

      expect(result).toBe(false);
      expect(console.error).toHaveBeenCalledWith('Error updating user XP:', { message: 'Update error' });
    });

    it('should handle exceptions during XP update', async () => {
      (supabase as any).from = jest.fn(() => ({
        update: jest.fn(() => ({
          eq: jest.fn().mockRejectedValue(new Error('Connection error')),
        })),
      }));

      const result = await userService.updateUserXP('google-test-id', 150);

      expect(result).toBe(false);
      expect(console.error).toHaveBeenCalledWith('Error updating user XP:', expect.any(Error));
    });

    it('should include updated timestamp in XP update', async () => {
      const mockUpdateCall = jest.fn(() => ({
        eq: jest.fn().mockResolvedValue(createMockSupabaseResponse({}, null)),
      }));

      (supabase as any).from = jest.fn(() => ({
        update: mockUpdateCall,
      }));

      await userService.updateUserXP('google-test-id', 200);

      expect(mockUpdateCall).toHaveBeenCalledWith({
        xp_points: 200,
        updated_at: expect.any(String),
      });
    });
  });

  describe('userService.getLeaderboard', () => {
    it('should retrieve leaderboard successfully', async () => {
      const mockUsers = [
        createMockUserProfile({ xp_points: 500, full_name: 'Leader' }),
        createMockUserProfile({ xp_points: 300, full_name: 'Second Place' }),
        createMockUserProfile({ xp_points: 100, full_name: 'Third Place' }),
      ];

      // Mock the complete chain properly
      mockLimit.mockResolvedValue(createMockSupabaseResponse(mockUsers));

      const result = await userService.getLeaderboard(3);

      expect(result).toEqual(mockUsers);
      expect(mockFrom).toHaveBeenCalledWith('users');
      expect(mockSelect).toHaveBeenCalledWith('*');
      expect(mockOrder).toHaveBeenCalledWith('xp_points', { ascending: false });
      expect(mockLimit).toHaveBeenCalledWith(3);
    });

    it('should use default limit of 10 when not specified', async () => {
      const mockUsers = Array.from({ length: 10 }, (_, i) => 
        createMockUserProfile({ xp_points: 500 - i * 50, full_name: `User ${i + 1}` })
      );

      mockLimit.mockResolvedValue(createMockSupabaseResponse(mockUsers));

      const result = await userService.getLeaderboard();

      expect(result).toEqual(mockUsers);
      expect(mockLimit).toHaveBeenCalledWith(10);
    });

    it('should handle empty leaderboard', async () => {
      mockLimit.mockResolvedValue(createMockSupabaseResponse([]));

      const result = await userService.getLeaderboard();

      expect(result).toEqual([]);
    });

    it('should handle leaderboard query errors', async () => {
      mockLimit.mockResolvedValue(createMockSupabaseResponse(null, { message: 'Query error' }));

      const result = await userService.getLeaderboard();

      expect(result).toEqual([]);
      expect(console.error).toHaveBeenCalledWith('Error fetching leaderboard:', { message: 'Query error' });
    });

    it('should handle exceptions during leaderboard fetch', async () => {
      mockLimit.mockRejectedValue(new Error('Database connection error'));

      const result = await userService.getLeaderboard();

      expect(result).toEqual([]);
      expect(console.error).toHaveBeenCalledWith('Error fetching leaderboard:', expect.any(Error));
    });

    it('should handle null data response gracefully', async () => {
      mockLimit.mockResolvedValue(createMockSupabaseResponse(null, null));

      const result = await userService.getLeaderboard();

      expect(result).toEqual([]);
    });
  });

  describe('Edge cases and data validation', () => {
    it('should handle user profile with missing optional fields', async () => {
      const userData = {
        googleId: 'google-test-id',
        email: 'test@example.com',
        fullName: 'Test User',
        isSubscribed: true,
        // avatarUrl is undefined
      };

      mockSingle.mockResolvedValueOnce(createMockSupabaseResponse(null, { code: 'PGRST116' }));
      
      const newUserProfile = createMockUserProfile({
        google_id: userData.googleId,
        avatar_url: undefined,
      });
      mockSingle.mockResolvedValueOnce(createMockSupabaseResponse(newUserProfile));

      const result = await userService.upsertUserProfile(userData);

      expect(result).toBeTruthy();
      expect(mockUpsert).toHaveBeenCalledWith(expect.objectContaining({
        avatar_url: undefined,
      }), expect.any(Object));
    });

    it('should handle very long user names and emails', async () => {
      const longString = 'a'.repeat(1000);
      const userData = {
        googleId: 'google-test-id',
        email: `${longString}@example.com`,
        fullName: longString,
        isSubscribed: true,
      };

      mockSingle.mockResolvedValueOnce(createMockSupabaseResponse(null, { code: 'PGRST116' }));
      mockSingle.mockResolvedValueOnce(createMockSupabaseResponse(createMockUserProfile()));

      const result = await userService.upsertUserProfile(userData);

      expect(result).toBeTruthy();
    });

    it('should handle XP updates with edge values', async () => {
      const testCases = [0, -1, 999999, 1.5, NaN, Infinity];

      for (const xpValue of testCases) {
        (supabase as any).from = jest.fn(() => ({
          update: jest.fn(() => ({
            eq: jest.fn().mockResolvedValue(createMockSupabaseResponse({}, null)),
          })),
        }));

        const result = await userService.updateUserXP('google-test-id', xpValue);
        expect(result).toBe(true);
      }
    });

    it('should handle leaderboard with various limit values', async () => {
      const testLimits = [0, 1, 100, 1000];

      for (const limit of testLimits) {
        mockLimit.mockReturnValue(jest.fn().mockResolvedValue(createMockSupabaseResponse([])));
        
        await userService.getLeaderboard(limit);
        expect(mockLimit).toHaveBeenCalledWith(limit);
      }
    });
  });
});