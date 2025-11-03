// Mock modules first
jest.mock('../../utils/supabase');
jest.mock('../../utils/errorHandling');

import React from 'react';
import { renderHook, waitFor, act } from '@testing-library/react-native';
import { ContentProvider, useContent } from '../../contexts/ContentContext';
import { supabase } from '../../utils/supabase';
import { mockCurrentTime, restoreTime, mockTimestamp } from '../__helpers__/testHelpers';

// Mock supabase methods
const mockSupabase = supabase as jest.Mocked<typeof supabase>;

describe('ContentContext - NEW Label Logic', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCurrentTime();

    // Mock console to reduce noise
    console.log = jest.fn();
    console.error = jest.fn();
  });

  afterEach(() => {
    restoreTime();
  });

  const createMockPost = (id: string, publishedAt: string, isFeatured = false) => ({
    id,
    type: 'video',
    title: `Test Post ${id}`,
    excerpt: 'Test excerpt',
    content: 'Test content',
    thumbnail: 'https://test.com/thumb.jpg',
    is_published: true,
    published_at: publishedAt,
    is_featured: isFeatured,
    featured_order: isFeatured ? 1 : 0,
    metadata: {},
    created_at: publishedAt,
    updated_at: publishedAt,
  });

  const mockSubscription = {
    unsubscribe: jest.fn(),
  };

  const setupSupabaseMock = (posts: any[]) => {
    const mockFrom = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          order: jest.fn().mockResolvedValue({
            data: posts,
            error: null,
          }),
        }),
      }),
    });

    const mockChannel = jest.fn().mockReturnValue({
      on: jest.fn().mockReturnThis(),
      subscribe: jest.fn().mockReturnValue(mockSubscription),
    });

    mockSupabase.from = mockFrom as any;
    mockSupabase.channel = mockChannel as any;
  };

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <ContentProvider>{children}</ContentProvider>
  );

  describe('hasNewContent based on post age', () => {
    it('should show NEW label when featured post is less than 24 hours old', async () => {
      // Post published 12 hours ago
      const recentPublishedAt = new Date(mockTimestamp - 12 * 60 * 60 * 1000).toISOString();
      const posts = [
        createMockPost('post1', recentPublishedAt, true), // Featured
      ];

      setupSupabaseMock(posts);

      const { result } = renderHook(() => useContent(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Give time for the NEW label check effect to run
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
      });

      expect(result.current.hasNewContent).toBe(true);
      expect(result.current.featuredPosts).toHaveLength(1);
    });

    it('should NOT show NEW label when featured post is more than 24 hours old', async () => {
      // Post published 25 hours ago
      const oldPublishedAt = new Date(mockTimestamp - 25 * 60 * 60 * 1000).toISOString();
      const posts = [
        createMockPost('post1', oldPublishedAt, true), // Featured
      ];

      setupSupabaseMock(posts);

      const { result } = renderHook(() => useContent(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Give time for the NEW label check effect to run
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
      });

      expect(result.current.hasNewContent).toBe(false);
      expect(result.current.featuredPosts).toHaveLength(1);
    });

    it('should show NEW label when at least one featured post is within 24 hours', async () => {
      // One recent, one old
      const recentPublishedAt = new Date(mockTimestamp - 12 * 60 * 60 * 1000).toISOString();
      const oldPublishedAt = new Date(mockTimestamp - 48 * 60 * 60 * 1000).toISOString();

      const posts = [
        createMockPost('post1', recentPublishedAt, true), // Featured & Recent
        createMockPost('post2', oldPublishedAt, true),    // Featured & Old
      ];

      setupSupabaseMock(posts);

      const { result } = renderHook(() => useContent(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Give time for the NEW label check effect to run
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
      });

      expect(result.current.hasNewContent).toBe(true);
      expect(result.current.featuredPosts).toHaveLength(2);
    });

    it('should NOT show NEW label when all featured posts are older than 24 hours', async () => {
      const oldPublishedAt1 = new Date(mockTimestamp - 25 * 60 * 60 * 1000).toISOString();
      const oldPublishedAt2 = new Date(mockTimestamp - 48 * 60 * 60 * 1000).toISOString();

      const posts = [
        createMockPost('post1', oldPublishedAt1, true), // Featured & Old
        createMockPost('post2', oldPublishedAt2, true), // Featured & Old
      ];

      setupSupabaseMock(posts);

      const { result } = renderHook(() => useContent(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Give time for the NEW label check effect to run
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
      });

      expect(result.current.hasNewContent).toBe(false);
      expect(result.current.featuredPosts).toHaveLength(2);
    });

    it('should NOT show NEW label for non-featured posts even if recent', async () => {
      // Recent but not featured
      const recentPublishedAt = new Date(mockTimestamp - 12 * 60 * 60 * 1000).toISOString();
      const posts = [
        createMockPost('post1', recentPublishedAt, false), // NOT Featured
      ];

      setupSupabaseMock(posts);

      const { result } = renderHook(() => useContent(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Give time for the NEW label check effect to run
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
      });

      expect(result.current.hasNewContent).toBe(false);
      expect(result.current.featuredPosts).toHaveLength(0);
      expect(result.current.posts).toHaveLength(1);
    });

    it('should handle exactly 24 hours boundary correctly', async () => {
      // Post published exactly 24 hours ago
      const exactlyOneDayAgo = new Date(mockTimestamp - 24 * 60 * 60 * 1000).toISOString();
      const posts = [
        createMockPost('post1', exactlyOneDayAgo, true), // Featured
      ];

      setupSupabaseMock(posts);

      const { result } = renderHook(() => useContent(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Give time for the NEW label check effect to run
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
      });

      // At exactly 24 hours, should NOT show NEW (boundary is exclusive: > 24 hours ago)
      expect(result.current.hasNewContent).toBe(false);
    });

    it('should handle 23 hours 59 minutes correctly (within 24 hours)', async () => {
      // Post published 23 hours and 59 minutes ago
      const almostOneDayAgo = new Date(mockTimestamp - 23 * 60 * 60 * 1000 - 59 * 60 * 1000).toISOString();
      const posts = [
        createMockPost('post1', almostOneDayAgo, true), // Featured
      ];

      setupSupabaseMock(posts);

      const { result } = renderHook(() => useContent(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Give time for the NEW label check effect to run
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
      });

      expect(result.current.hasNewContent).toBe(true);
    });

    it('should NOT show NEW label when there are no featured posts', async () => {
      const posts: any[] = [];

      setupSupabaseMock(posts);

      const { result } = renderHook(() => useContent(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Give time for the NEW label check effect to run
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
      });

      expect(result.current.hasNewContent).toBe(false);
      expect(result.current.featuredPosts).toHaveLength(0);
    });
  });

  describe('Periodic check updates', () => {
    it('should calculate NEW label correctly based on current time', async () => {
      // Post published 23 hours ago (should show NEW at first)
      const almostOneDayAgo = new Date(mockTimestamp - 23 * 60 * 60 * 1000).toISOString();
      const posts = [
        createMockPost('post1', almostOneDayAgo, true),
      ];

      setupSupabaseMock(posts);

      const { result } = renderHook(() => useContent(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Give time for the NEW label check effect to run
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
      });

      // Initially should show NEW (23 hours < 24 hours)
      expect(result.current.hasNewContent).toBe(true);
      expect(result.current.featuredPosts).toHaveLength(1);
    });

    it('should correctly identify when post crosses 24-hour boundary', async () => {
      // Post published 25 hours ago (should NOT show NEW)
      const moreThanOneDayAgo = new Date(mockTimestamp - 25 * 60 * 60 * 1000).toISOString();
      const posts = [
        createMockPost('post1', moreThanOneDayAgo, true),
      ];

      setupSupabaseMock(posts);

      const { result } = renderHook(() => useContent(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Give time for the NEW label check effect to run
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
      });

      // Should NOT show NEW (25 hours > 24 hours)
      expect(result.current.hasNewContent).toBe(false);
      expect(result.current.featuredPosts).toHaveLength(1);
    });
  });
});
