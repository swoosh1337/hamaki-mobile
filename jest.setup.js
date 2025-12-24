import 'react-native-gesture-handler/jestSetup';

// Mock react-native modules - remove problematic mock
// jest.mock('react-native/Libraries/Animated/NativeAnimatedHelper');

// Mock AsyncStorage (keep for legacy compatibility in tests)
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

// Mock expo-secure-store
const mockSecureStore = (() => {
  const store = {};
  return {
    setItemAsync: jest.fn((key, value) => {
      store[key] = value;
      return Promise.resolve();
    }),
    getItemAsync: jest.fn((key) => Promise.resolve(store[key] || null)),
    deleteItemAsync: jest.fn((key) => {
      delete store[key];
      return Promise.resolve();
    }),
    clearStore: () => Object.keys(store).forEach(key => delete store[key]),
    store, // Expose store for tests
  };
})();

jest.mock('expo-secure-store', () => mockSecureStore);

// Export mockSecureStore globally for tests
global.mockSecureStore = mockSecureStore;

// Mock expo-constants for app.config.ts
jest.mock('expo-constants', () => ({
  expoConfig: {
    extra: {
      supabaseUrl: 'https://test.supabase.co',
      supabaseAnonKey: 'test-supabase-key',
      youtubeApiKey: 'test-youtube-api-key',
      hamakiChannelId: 'test-channel-id',
    },
  },
}));

// Mock expo-linking
jest.mock('expo-linking', () => ({
  createURL: jest.fn((path) => `test://auth/${path}`),
  getInitialURL: jest.fn(),
  addEventListener: jest.fn(),
  removeEventListener: jest.fn(),
  openURL: jest.fn(),
  canOpenURL: jest.fn(),
}));

// Mock Expo modules
jest.mock('expo-auth-session', () => ({
  makeRedirectUri: jest.fn(() => 'test://redirect'),
  AuthRequest: jest.fn().mockImplementation(() => ({
    promptAsync: jest.fn(),
    codeVerifier: 'test-code-verifier',
    redirectUri: 'test://redirect',
  })),
  ResponseType: {
    Code: 'code',
  },
}));

jest.mock('expo-web-browser', () => ({
  maybeCompleteAuthSession: jest.fn(),
}));

jest.mock('@expo/vector-icons', () => ({
  AntDesign: 'AntDesign',
  Ionicons: 'Ionicons',
}));

jest.mock('expo-linking', () => ({
  openURL: jest.fn(),
}));

jest.mock('expo-device', () => {
  const mockDevice = {
    isDevice: true,
  };
  return mockDevice;
});

jest.mock('expo-notifications', () => ({
  requestPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  getPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  getExpoPushTokenAsync: jest.fn().mockResolvedValue({ data: 'test-push-token' }),
  scheduleNotificationAsync: jest.fn().mockResolvedValue('notification-id'),
  cancelAllScheduledNotificationsAsync: jest.fn().mockResolvedValue(undefined),
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn().mockResolvedValue(undefined),
  addNotificationReceivedListener: jest.fn().mockReturnValue({ remove: jest.fn() }),
  addNotificationResponseReceivedListener: jest.fn().mockReturnValue({ remove: jest.fn() }),
  AndroidImportance: {
    MAX: 'max',
  },
}));

// Mock fetch globally
global.fetch = jest.fn();

// Mock console to reduce noise in tests
global.console = {
  ...console,
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

// Mock Platform - simple approach
jest.mock('react-native/Libraries/Utilities/Platform', () => ({
  OS: 'ios',
  Version: '15.0',
  isPad: false,
  isTesting: true,
  select: jest.fn((platforms) => platforms.ios || platforms.default),
}));

// Mock react-native for Platform access
jest.mock('react-native', () => ({
  Platform: {
    OS: 'ios',
    Version: '15.0',
    isPad: false,
    isTesting: true,
    select: jest.fn((platforms) => platforms.ios || platforms.default),
  },
  StyleSheet: {
    create: (styles) => styles,
    flatten: jest.fn((style) => style),
  },
  View: 'View',
  Text: 'Text',
  TouchableOpacity: 'TouchableOpacity',
  TouchableWithoutFeedback: 'TouchableWithoutFeedback',
  Image: 'Image',
  ActivityIndicator: 'ActivityIndicator',
  TextInput: 'TextInput',
  Modal: 'Modal',
  SafeAreaView: 'SafeAreaView',
  KeyboardAvoidingView: 'KeyboardAvoidingView',
  ScrollView: 'ScrollView',
  RefreshControl: 'RefreshControl',
  Dimensions: {
    get: jest.fn(() => ({ width: 375, height: 812 })),
  },
  Alert: {
    alert: jest.fn(),
  },
  Keyboard: {
    dismiss: jest.fn(),
  },
}));

// Set up environment variables for tests
process.env.EXPO_PUBLIC_YOUTUBE_API_KEY = 'test-youtube-api-key';
process.env.EXPO_PUBLIC_HAMAKI_CHANNEL_ID = 'test-channel-id';
process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'test-supabase-key';