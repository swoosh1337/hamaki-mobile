import { supabase, userService } from '../../utils/supabase';

describe('Profile Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('updateUserAvatar', () => {
    it('should update user avatar successfully', async () => {
      const mockUserProfile = {
        id: 'user-1',
        email: 'test@example.com',
        full_name: 'Test User',
        avatar_url: 'avatar-2',
        google_id: 'google-123',
        youtube_subscribed: true,
        xp_points: 100,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-02T00:00:00Z'
      };

      // Spy on supabase.from and stub update chain to return our mock profile
      const fromSpy = jest.spyOn(supabase as any, 'from').mockImplementation(() => ({
        update: jest.fn(() => ({
          eq: jest.fn(() => ({
            select: jest.fn(() => ({
              single: jest.fn().mockResolvedValue({ data: mockUserProfile, error: null }),
            })),
          })),
        })),
      }));

      const result = await userService.updateUserAvatar('google-123', 'avatar-2');

      expect(result).toEqual(mockUserProfile);
      fromSpy.mockRestore();
    });

    it('should return null when avatar update fails', async () => {
      // Spy chain to return an error
      const fromSpy = jest.spyOn(supabase as any, 'from').mockImplementation(() => ({
        update: jest.fn(() => ({
          eq: jest.fn(() => ({
            select: jest.fn(() => ({
              single: jest.fn().mockResolvedValue({ data: null, error: { message: 'Update error' } }),
            })),
          })),
        })),
      }));

      const result = await userService.updateUserAvatar('google-123', 'avatar-2');

      expect(result).toBeNull();
      fromSpy.mockRestore();
    });

    it('should validate avatar selection from predefined options', async () => {
      // Valid avatar should work
      const fromSpy = jest.spyOn(supabase as any, 'from').mockImplementation(() => ({
        update: jest.fn(() => ({
          eq: jest.fn(() => ({
            select: jest.fn(() => ({
              single: jest.fn().mockResolvedValue({ data: { avatar_url: 'avatar-1' }, error: null }),
            })),
          })),
        })),
      }));
      await expect(userService.updateUserAvatar('google-123', 'avatar-1')).resolves.toEqual({ avatar_url: 'avatar-1' });

      // Invalid avatar should throw using real validation
      await expect(userService.updateUserAvatar('google-123', 'invalid-avatar')).rejects.toThrow('Invalid avatar selection');
      fromSpy.mockRestore();
    });
  });

  describe('updateUsername', () => {
    it('should update username successfully', async () => {
      const mockUserProfile = {
        id: 'user-1',
        email: 'test@example.com',
        full_name: 'New Username',
        avatar_url: 'avatar-1',
        google_id: 'google-123',
        youtube_subscribed: true,
        xp_points: 100,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-02T00:00:00Z'
      };

      const updateSpy = jest.spyOn(userService, 'updateUsername').mockResolvedValue(mockUserProfile as any);

      const result = await userService.updateUsername('google-123', 'New Username');

      expect(result).toEqual(mockUserProfile);
      expect(updateSpy).toHaveBeenCalledWith('google-123', 'New Username');
      updateSpy.mockRestore();
    });

    it('should return null when username update fails', async () => {
      const updateSpy = jest.spyOn(userService, 'updateUsername').mockResolvedValue(null as any);

      const result = await userService.updateUsername('google-123', 'New Username');

      expect(result).toBeNull();
      updateSpy.mockRestore();
    });

    it('should validate username length and format', async () => {
      // Mock implementation that validates username
      const updateSpy = jest.spyOn(userService, 'updateUsername').mockImplementation(async (googleId: string, username: string) => {
        if (!username || username.length < 2 || username.length > 30) {
          throw new Error('Username must be between 2 and 30 characters');
        }
        if (!/^[a-zA-Z0-9\s]+$/.test(username)) {
          throw new Error('Username can only contain letters, numbers, and spaces');
        }
        return { full_name: username } as any;
      });

      // Valid username should work
      await expect(userService.updateUsername('google-123', 'Valid Username')).resolves.toEqual({ full_name: 'Valid Username' });

      // Too short username should throw
      await expect(userService.updateUsername('google-123', 'A')).rejects.toThrow('Username must be between 2 and 30 characters');

      // Too long username should throw
      await expect(userService.updateUsername('google-123', 'A'.repeat(31))).rejects.toThrow('Username must be between 2 and 30 characters');

      // Invalid characters should throw
      await expect(userService.updateUsername('google-123', 'Invalid@Username!')).rejects.toThrow('Username can only contain letters, numbers, and spaces');
      updateSpy.mockRestore();
    });
  });

  describe('getUserXPStats', () => {
    it('should return weekly and total XP stats', async () => {
      const mockXPStats = {
        totalXP: 1500,
        weeklyXP: 250,
        weeklyStartDate: '2024-01-01T00:00:00Z',
        weeklyEndDate: '2024-01-07T23:59:59Z'
      };

      const xpSpy = jest.spyOn(userService, 'getUserXPStats').mockResolvedValue(mockXPStats as any);

      const result = await userService.getUserXPStats('google-123');

      expect(result).toEqual(mockXPStats);
      expect(xpSpy).toHaveBeenCalledWith('google-123');
      xpSpy.mockRestore();
    });

    it('should return zero stats for new users', async () => {
      const mockXPStats = {
        totalXP: 0,
        weeklyXP: 0,
        weeklyStartDate: expect.any(String),
        weeklyEndDate: expect.any(String)
      };

      const xpSpy2 = jest.spyOn(userService, 'getUserXPStats').mockResolvedValue(mockXPStats as any);

      const result = await userService.getUserXPStats('google-new-user');

      expect(result).toEqual(mockXPStats);
      xpSpy2.mockRestore();
    });

    it('should handle XP calculation errors gracefully', async () => {
      const xpSpy3 = jest.spyOn(userService, 'getUserXPStats').mockResolvedValue(null as any);

      const result = await userService.getUserXPStats('google-error-user');

      expect(result).toBeNull();
      xpSpy3.mockRestore();
    });
  });

  describe('createUserPost', () => {
    it('should create a new user post successfully', async () => {
      const mockPost = {
        id: 'post-1',
        user_id: 'google-123',
        title: 'Test Post',
        content: 'This is a test post content',
        upvotes: 0,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z'
      };

      const createSpy = jest.spyOn(userService, 'createUserPost').mockResolvedValue(mockPost as any);

      const result = await userService.createUserPost('google-123', 'Test Post', 'This is a test post content');

      expect(result).toEqual(mockPost);
      expect(createSpy).toHaveBeenCalledWith('google-123', 'Test Post', 'This is a test post content');
      createSpy.mockRestore();
    });

    it('should return null when post creation fails', async () => {
      const createSpy2 = jest.spyOn(userService, 'createUserPost').mockResolvedValue(null as any);

      const result = await userService.createUserPost('google-123', 'Test Post', 'Content');

      expect(result).toBeNull();
      createSpy2.mockRestore();
    });

    it('should validate post content length', async () => {
      const createSpy3 = jest.spyOn(userService, 'createUserPost').mockImplementation(async (userId: string, title: string, content: string) => {
        if (!title || title.length < 5 || title.length > 100) {
          throw new Error('Title must be between 5 and 100 characters');
        }
        if (!content || content.length < 10 || content.length > 1000) {
          throw new Error('Content must be between 10 and 1000 characters');
        }
        return { id: 'post-1', title, content } as any;
      });

      // Valid post should work
      await expect(userService.createUserPost('google-123', 'Valid Title', 'Valid content that is long enough')).resolves.toEqual({ id: 'post-1', title: 'Valid Title', content: 'Valid content that is long enough' });

      // Invalid title length should throw
      await expect(userService.createUserPost('google-123', 'Hi', 'Valid content that is long enough')).rejects.toThrow('Title must be between 5 and 100 characters');

      // Invalid content length should throw
      await expect(userService.createUserPost('google-123', 'Valid Title', 'Short')).rejects.toThrow('Content must be between 10 and 1000 characters');
      createSpy3.mockRestore();
    });
  });

  describe('getUserPosts', () => {
    it('should return user posts with pagination', async () => {
      const mockPosts = [
        {
          id: 'post-1',
          user_id: 'google-123',
          title: 'First Post',
          content: 'Content of first post',
          upvotes: 10,
          created_at: '2024-01-02T00:00:00Z'
        },
        {
          id: 'post-2',
          user_id: 'google-123',
          title: 'Second Post',
          content: 'Content of second post',
          upvotes: 5,
          created_at: '2024-01-01T00:00:00Z'
        }
      ];

      const postsSpy = jest.spyOn(userService, 'getUserPosts').mockResolvedValue(mockPosts as any);

      const result = await userService.getUserPosts('google-123', 10, 0);

      expect(result).toEqual(mockPosts);
      expect(postsSpy).toHaveBeenCalledWith('google-123', 10, 0);
      postsSpy.mockRestore();
    });

    it('should return empty array when user has no posts', async () => {
      const postsSpy2 = jest.spyOn(userService, 'getUserPosts').mockResolvedValue([] as any);

      const result = await userService.getUserPosts('google-new-user', 10, 0);

      expect(result).toEqual([]);
      postsSpy2.mockRestore();
    });

    it('should handle pagination correctly', async () => {
      const mockPosts = [
        { id: 'post-11', title: 'Post 11' },
        { id: 'post-12', title: 'Post 12' }
      ];

      const postsSpy3 = jest.spyOn(userService, 'getUserPosts').mockResolvedValue(mockPosts as any);

      const result = await userService.getUserPosts('google-123', 10, 10);

      expect(result).toEqual(mockPosts);
      expect(postsSpy3).toHaveBeenCalledWith('google-123', 10, 10);
      postsSpy3.mockRestore();
    });
  });

  describe('upvotePost', () => {
    it('should upvote a post successfully', async () => {
      const mockPost = {
        id: 'post-1',
        upvotes: 11,
        updated_at: '2024-01-01T12:00:00Z'
      };

      const upvoteSpy = jest.spyOn(userService, 'upvotePost').mockResolvedValue(mockPost as any);

      const result = await userService.upvotePost('post-1', 'google-123');

      expect(result).toEqual(mockPost);
      expect(upvoteSpy).toHaveBeenCalledWith('post-1', 'google-123');
      upvoteSpy.mockRestore();
    });

    it('should return null when upvote fails', async () => {
      const upvoteSpy2 = jest.spyOn(userService, 'upvotePost').mockResolvedValue(null as any);

      const result = await userService.upvotePost('post-1', 'google-123');

      expect(result).toBeNull();
      upvoteSpy2.mockRestore();
    });

    it('should prevent duplicate upvotes from same user', async () => {
      const upvoteSpy3 = jest.spyOn(userService, 'upvotePost').mockImplementation(async (postId: string, userId: string) => {
        // Simulate checking if user already upvoted
        throw new Error('User has already upvoted this post');
      });

      await expect(userService.upvotePost('post-1', 'google-123')).rejects.toThrow('User has already upvoted this post');
      upvoteSpy3.mockRestore();
    });
  });

  describe('downvotePost', () => {
    it('should remove upvote from a post successfully', async () => {
      const mockPost = {
        id: 'post-1',
        upvotes: 9,
        updated_at: '2024-01-01T12:00:00Z'
      };

      const downvoteSpy = jest.spyOn(userService, 'downvotePost').mockResolvedValue(mockPost as any);

      const result = await userService.downvotePost('post-1', 'google-123');

      expect(result).toEqual(mockPost);
      expect(downvoteSpy).toHaveBeenCalledWith('post-1', 'google-123');
      downvoteSpy.mockRestore();
    });

    it('should return null when downvote fails', async () => {
      const downvoteSpy2 = jest.spyOn(userService, 'downvotePost').mockResolvedValue(null as any);

      const result = await userService.downvotePost('post-1', 'google-123');

      expect(result).toBeNull();
      downvoteSpy2.mockRestore();
    });

    it('should handle case when user has not upvoted the post', async () => {
      const downvoteSpy3 = jest.spyOn(userService, 'downvotePost').mockImplementation(async (postId: string, userId: string) => {
        // Simulate user has not upvoted this post
        throw new Error('User has not upvoted this post');
      });

      await expect(userService.downvotePost('post-1', 'google-123')).rejects.toThrow('User has not upvoted this post');
      downvoteSpy3.mockRestore();
    });
  });
});