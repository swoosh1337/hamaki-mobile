import {
  clearVideosCache,
  fetchHamakiVideos,
  formatTimeAgo,
  isVideoNew
} from '../../utils/youtube';
import {
  createMockFetch,
  createMockYouTubeSearchResponse,
  createMockYouTubeVideo,
  createMockYouTubeVideoStats,
  mockCurrentTime,
  mockTimestamp,
  restoreTime,
} from '../__helpers__/testHelpers';

describe('YouTube Utils', () => {
  let mockFetch: jest.MockedFunction<typeof fetch>;
  const originalConsoleLog = console.log;
  const originalConsoleError = console.error;

  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch = createMockFetch();
    mockCurrentTime();

    // Mock console to reduce noise in tests
    console.log = jest.fn();
    console.error = jest.fn();

    // Clear cache before each test
    clearVideosCache();
  });

  afterEach(() => {
    restoreTime();
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
  });

  describe('fetchHamakiVideos', () => {
    it('should fetch videos successfully', async () => {
      const mockVideos = [
        createMockYouTubeVideo('video1'),
        createMockYouTubeVideo('video2'),
      ];

      const mockStats = [
        createMockYouTubeVideoStats('video1', '1000'),
        createMockYouTubeVideoStats('video2', '2500'),
      ];

      // Mock search API response
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(createMockYouTubeSearchResponse(mockVideos)),
        } as Response)
        // Mock statistics API response
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ items: mockStats }),
        } as Response);

      const result = await fetchHamakiVideos(2);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        id: 'video1',
        videoId: 'video1',
        title: 'Test Video video1',
        description: 'Test description for video video1',
        thumbnail: 'https://test.com/thumb-video1.jpg',
        publishedAt: expect.any(String),
        viewCount: '1K',
        duration: 'PT5M30S',
      });

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should return cached results within cache duration', async () => {
      const mockVideos = [createMockYouTubeVideo('cached-video')];
      const mockStats = [createMockYouTubeVideoStats('cached-video')];

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(createMockYouTubeSearchResponse(mockVideos)),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ items: mockStats }),
        } as Response);

      // First call - should hit API
      const result1 = await fetchHamakiVideos();
      expect(mockFetch).toHaveBeenCalledTimes(2);

      // Reset mock to ensure no additional calls
      mockFetch.mockClear();

      // Second call - should return cached result
      const result2 = await fetchHamakiVideos();
      expect(mockFetch).not.toHaveBeenCalled();
      expect(result1).toEqual(result2);
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Returning cached HamaKi Studio videos'));
    });

    it('should handle API errors gracefully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: 'API Error' }),
      } as Response);

      await expect(fetchHamakiVideos()).rejects.toThrow();
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Error fetching HamaKi videos'), expect.anything());
    });

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      await expect(fetchHamakiVideos()).rejects.toThrow('Network error');
      expect(console.error).toHaveBeenCalled();
    });

    it('should handle empty response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(createMockYouTubeSearchResponse([])),
      } as Response);

      const result = await fetchHamakiVideos();

      expect(result).toEqual([]);
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('No videos found for HamaKi Studio channel'));
    });

    it('should format view counts correctly', async () => {
      const mockVideos = [createMockYouTubeVideo('test-video')];
      const mockStats = [createMockYouTubeVideoStats('test-video', '1500000')];

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(createMockYouTubeSearchResponse(mockVideos)),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ items: mockStats }),
        } as Response);

      const result = await fetchHamakiVideos();

      expect(result[0].viewCount).toBe('1.5M');
    });

    it('should handle missing statistics gracefully', async () => {
      const mockVideos = [createMockYouTubeVideo('test-video')];

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(createMockYouTubeSearchResponse(mockVideos)),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ items: [] }),
        } as Response);

      const result = await fetchHamakiVideos();

      expect(result[0].viewCount).toBeUndefined();
      expect(result[0].duration).toBeUndefined();
    });

    it('should use correct API parameters', async () => {
      const mockVideos = [createMockYouTubeVideo('test-video')];
      const mockStats = [createMockYouTubeVideoStats('test-video')];

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(createMockYouTubeSearchResponse(mockVideos)),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ items: mockStats }),
        } as Response);

      await fetchHamakiVideos(5);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('maxResults=5')
      );
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('channelId=test-channel-id')
      );
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('order=date')
      );
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('type=video')
      );
    });

    it('should use medium thumbnail as fallback', async () => {
      const mockVideo = {
        id: { videoId: 'test-video' },
        snippet: {
          title: 'Test Video',
          description: 'Test description',
          publishedAt: new Date().toISOString(),
          thumbnails: {
            medium: { url: 'https://test.com/medium-thumb.jpg' },
          },
        },
      };

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(createMockYouTubeSearchResponse([mockVideo])),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ items: [createMockYouTubeVideoStats('test-video')] }),
        } as Response);

      const result = await fetchHamakiVideos();

      expect(result[0].thumbnail).toBe('https://test.com/medium-thumb.jpg');
    });
  });

  describe('formatTimeAgo', () => {
    it('should format "Just now" for very recent videos', () => {
      const recentTime = new Date(mockTimestamp - 30 * 1000).toISOString(); // 30 seconds ago

      const result = formatTimeAgo(recentTime);

      expect(result).toBe('Just now');
    });

    it('should format hours correctly', () => {
      const hoursAgo = new Date(mockTimestamp - 3 * 60 * 60 * 1000).toISOString(); // 3 hours ago

      const result = formatTimeAgo(hoursAgo);

      expect(result).toBe('3 hours ago');
    });

    it('should format single hour correctly', () => {
      const oneHourAgo = new Date(mockTimestamp - 1 * 60 * 60 * 1000).toISOString(); // 1 hour ago

      const result = formatTimeAgo(oneHourAgo);

      expect(result).toBe('1 hour ago');
    });

    it('should format days correctly', () => {
      const daysAgo = new Date(mockTimestamp - 3 * 24 * 60 * 60 * 1000).toISOString(); // 3 days ago

      const result = formatTimeAgo(daysAgo);

      expect(result).toBe('3 days ago');
    });

    it('should format single day correctly', () => {
      const oneDayAgo = new Date(mockTimestamp - 1 * 24 * 60 * 60 * 1000).toISOString(); // 1 day ago

      const result = formatTimeAgo(oneDayAgo);

      expect(result).toBe('1 day ago');
    });

    it('should format weeks correctly', () => {
      const weeksAgo = new Date(mockTimestamp - 2 * 7 * 24 * 60 * 60 * 1000).toISOString(); // 2 weeks ago

      const result = formatTimeAgo(weeksAgo);

      expect(result).toBe('2 weeks ago');
    });

    it('should format months correctly', () => {
      const monthsAgo = new Date(mockTimestamp - 45 * 24 * 60 * 60 * 1000).toISOString(); // ~1.5 months ago

      const result = formatTimeAgo(monthsAgo);

      expect(result).toBe('1 month ago');
    });
  });

  describe('isVideoNew', () => {
    it('should return true for videos uploaded within 24 hours', () => {
      const recentVideo = new Date(mockTimestamp - 12 * 60 * 60 * 1000).toISOString(); // 12 hours ago

      const result = isVideoNew(recentVideo);

      expect(result).toBe(true);
    });

    it('should return false for videos uploaded more than 24 hours ago', () => {
      const oldVideo = new Date(mockTimestamp - 25 * 60 * 60 * 1000).toISOString(); // 25 hours ago

      const result = isVideoNew(oldVideo);

      expect(result).toBe(false);
    });

    it('should return true for videos uploaded exactly 24 hours ago', () => {
      const exactlyOneDayAgo = new Date(mockTimestamp - 24 * 60 * 60 * 1000).toISOString();

      const result = isVideoNew(exactlyOneDayAgo);

      expect(result).toBe(true);
    });

    it('should return true for future dates (edge case)', () => {
      const futureDate = new Date(mockTimestamp + 60 * 60 * 1000).toISOString(); // 1 hour in future

      const result = isVideoNew(futureDate);

      expect(result).toBe(true);
    });
  });

  describe('clearVideosCache', () => {
    it('should clear the cache', async () => {
      // First, populate the cache
      const mockVideos = [createMockYouTubeVideo('test-video')];
      const mockStats = [createMockYouTubeVideoStats('test-video')];

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(createMockYouTubeSearchResponse(mockVideos)),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ items: mockStats }),
        } as Response);

      await fetchHamakiVideos();
      expect(mockFetch).toHaveBeenCalledTimes(2);

      // Clear the cache
      clearVideosCache();
      mockFetch.mockClear();

      // Next call should hit the API again
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(createMockYouTubeSearchResponse(mockVideos)),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ items: mockStats }),
        } as Response);

      await fetchHamakiVideos();
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('YouTube videos cache cleared'));
    });
  });

  describe('View count formatting', () => {
    const testCases = [
      { input: 999, expected: '999' },
      { input: 1000, expected: '1K' },
      { input: 1500, expected: '1K' },
      { input: 15000, expected: '15K' },
      { input: 150000, expected: '150K' },
      { input: 1000000, expected: '1.0M' },
      { input: 1500000, expected: '1.5M' },
      { input: 15000000, expected: '15.0M' },
    ];

    testCases.forEach(({ input, expected }) => {
      it(`should format ${input} views as "${expected}"`, async () => {
        const mockVideos = [createMockYouTubeVideo('test-video')];
        const mockStats = [createMockYouTubeVideoStats('test-video', input.toString())];

        mockFetch
          .mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve(createMockYouTubeSearchResponse(mockVideos)),
          } as Response)
          .mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve({ items: mockStats }),
          } as Response);

        const result = await fetchHamakiVideos();
        expect(result[0].viewCount).toBe(expected);
      });
    });
  });

  describe('Error scenarios', () => {
    it('should handle malformed search response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ items: null }),
      } as Response);

      const result = await fetchHamakiVideos();
      expect(result).toEqual([]);
    });

    it('should handle statistics API failure gracefully', async () => {
      const mockVideos = [createMockYouTubeVideo('test-video')];

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(createMockYouTubeSearchResponse(mockVideos)),
        } as Response)
        .mockResolvedValueOnce({
          ok: false,
          json: () => Promise.resolve({ error: 'Statistics API error' }),
        } as Response);

      // The function actually continues with undefined statistics rather than throwing
      const result = await fetchHamakiVideos();
      expect(result).toHaveLength(1);
      expect(result[0].viewCount).toBeUndefined();
      expect(result[0].duration).toBeUndefined();
    });

    it('should handle JSON parse errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.reject(new Error('JSON parse error')),
      } as Response);

      await expect(fetchHamakiVideos()).rejects.toThrow('JSON parse error');
    });
  });
});