export const createMockAsyncStorage = () => {
  const store: { [key: string]: string } = {};
  
  return {
    getItem: jest.fn((key: string) => Promise.resolve(store[key] || null)),
    setItem: jest.fn((key: string, value: string) => {
      store[key] = value;
      return Promise.resolve();
    }),
    removeItem: jest.fn((key: string) => {
      delete store[key];
      return Promise.resolve();
    }),
    multiSet: jest.fn((keyValuePairs: [string, string][]) => {
      keyValuePairs.forEach(([key, value]) => {
        store[key] = value;
      });
      return Promise.resolve();
    }),
    multiRemove: jest.fn((keys: string[]) => {
      keys.forEach(key => {
        delete store[key];
      });
      return Promise.resolve();
    }),
    clear: jest.fn(() => {
      Object.keys(store).forEach(key => delete store[key]);
      return Promise.resolve();
    }),
    store,
  };
};

// Store original fetch for restoration
const originalFetch = global.fetch;

export const createMockFetch = () => {
  const mockFetch = jest.fn() as jest.MockedFunction<typeof fetch>;
  global.fetch = mockFetch;
  return mockFetch;
};

export const restoreFetch = () => {
  global.fetch = originalFetch;
};

export const createMockGoogleAuthResponse = (success = true) => ({
  type: success ? 'success' : 'cancel',
  params: success ? { code: 'test-auth-code' } : {},
});

export const createMockYouTubeSearchResponse = (videos: any[] = []) => ({
  items: videos,
  pageInfo: {
    totalResults: videos.length,
    resultsPerPage: videos.length,
  },
});

export const createMockYouTubeVideo = (id: string, overrides: any = {}) => ({
  id: { videoId: id },
  snippet: {
    title: `Test Video ${id}`,
    description: `Test description for video ${id}`,
    publishedAt: new Date().toISOString(),
    thumbnails: {
      high: { url: `https://test.com/thumb-${id}.jpg` },
      medium: { url: `https://test.com/thumb-medium-${id}.jpg` },
    },
  },
  ...overrides,
});

// Processed video format (as returned by fetchHamakiVideos after YouTube API processing)
export const createMockProcessedVideo = (id: string, overrides: any = {}) => ({
  id,
  videoId: id,
  title: `Test Video ${id}`,
  description: `Test description for video ${id}`,
  publishedAt: new Date().toISOString(),
  thumbnail: `https://test.com/thumb-${id}.jpg`,
  ...overrides,
});

export const createMockYouTubeVideoStats = (videoId: string, viewCount = '1000') => ({
  id: videoId,
  statistics: {
    viewCount,
  },
  contentDetails: {
    duration: 'PT5M30S',
  },
});

export const createMockSupabaseResponse = (data: any, error: any = null) => ({
  data,
  error,
});

export const createMockUserProfile = (overrides: any = {}) => ({
  id: 'test-user-id',
  email: 'test@example.com',
  full_name: 'Test User',
  avatar_url: 'https://test.com/avatar.jpg',
  google_id: 'google-test-id',
  youtube_subscribed: true,
  xp_points: 100,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
  ...overrides,
});

export const createMockSubscriptionsResponse = (subscribed = true, channelId = 'UCSI5XbaxsX1USijrfFVuJqA') => ({
  items: subscribed ? [{
    snippet: {
      resourceId: {
        channelId,
      },
    },
  }] : [],
  nextPageToken: null,
});

export const createMockSupabaseClient = () => ({
  from: jest.fn(() => ({
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    single: jest.fn(),
  })),
});

export const waitForAsync = (ms = 0) => 
  new Promise(resolve => setTimeout(resolve, ms));

export const mockTimestamp = 1640995200000; // 2022-01-01 00:00:00 UTC

let originalDate: DateConstructor;

export const mockCurrentTime = () => {
  originalDate = global.Date;
  jest.spyOn(Date, 'now').mockReturnValue(mockTimestamp);
  
  // Mock the Date constructor more carefully
  global.Date = class extends originalDate {
    constructor(value?: string | number | Date) {
      if (value !== undefined) {
        super(value);
      } else {
        super(mockTimestamp);
      }
    }
    
    static now() {
      return mockTimestamp;
    }
  } as any;
};

export const restoreTime = () => {
  if (originalDate) {
    global.Date = originalDate;
  }
  jest.restoreAllMocks();
};

// Platform mock for React Native components
export const mockPlatform = (platform: 'ios' | 'android' | 'web' = 'ios') => {
  jest.doMock('react-native/Libraries/Utilities/Platform', () => ({
    OS: platform,
    select: (options: any) => options[platform] || options.default,
  }));
};