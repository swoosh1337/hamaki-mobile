# Contributing to Hamaki Mobile

Welcome to the Hamaki Mobile project! This guide will help you understand our codebase architecture, conventions, and how to contribute effectively.

## 📚 Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Folder Structure](#folder-structure)
3. [Adding New Features](#adding-new-features)
4. [Coding Patterns & Best Practices](#coding-patterns--best-practices)
5. [Testing Guidelines](#testing-guidelines)
6. [Error Handling](#error-handling)
7. [Logging](#logging)
8. [Type Safety](#type-safety)
9. [Common Utilities](#common-utilities)

---

## Architecture Overview

Hamaki Mobile follows **Clean Architecture** principles with clear separation of concerns:

```
┌─────────────────────────────────────────────────────────────────┐
│  SCREENS (app/)                                                 │
│  - Compose components                                           │
│  - Wire up hooks                                                │
│  - Handle navigation                                            │
│  - Should be thin (<200 lines ideally)                          │
├─────────────────────────────────────────────────────────────────┤
│  COMPONENTS (components/)                                       │
│  - Pure UI rendering                                            │
│  - Accept props, emit events                                    │
│  - No direct API calls                                          │
│  - No global state access (except via hooks)                    │
├─────────────────────────────────────────────────────────────────┤
│  HOOKS (hooks/)                                                 │
│  - State management                                             │
│  - Side effects (API calls via services)                        │
│  - Business logic orchestration                                 │
│  - Reusable across screens                                      │
├─────────────────────────────────────────────────────────────────┤
│  SERVICES (services/)                                           │
│  - Data access (Supabase, YouTube API)                          │
│  - API transformations                                          │
│  - Caching strategies                                           │
│  - No React dependencies                                        │
├─────────────────────────────────────────────────────────────────┤
│  TYPES (types/)                                                 │
│  - TypeScript interfaces & types                                │
│  - Shared across all layers                                     │
│  - Single source of truth for data shapes                       │
└─────────────────────────────────────────────────────────────────┘
```

### Core Principles

- **KISS (Keep It Simple, Stupid)** - Prefer clarity over cleverness
- **DRY (Don't Repeat Yourself)** - Extract when you see repetition 3+ times
- **Single Responsibility** - One file, one purpose
- **Flat Structure** - Avoid deep nesting (max 3 levels)

---

## Folder Structure

```
hamaki-mobile/
├── app/                          # Expo Router screens
│   └── (tabs)/                   # Tab navigation screens
│       ├── community.tsx         # Community posts screen
│       ├── games.tsx             # Games selection screen
│       ├── leaderboard.tsx       # XP rankings screen
│       └── profile.tsx           # User profile screen
│
├── components/                   # React components
│   ├── community/                # Community-specific components
│   │   ├── PostList.tsx         # Posts display with states
│   │   ├── SortFilter.tsx       # Sort toggle buttons
│   │   └── CreatePostFAB.tsx    # Floating action button
│   ├── profile/                  # Profile-specific components
│   │   ├── StatsCard.tsx        # XP statistics display
│   │   ├── AvatarPicker.tsx     # Avatar selection
│   │   └── XPDisplay.tsx        # XP progress display
│   ├── games/                    # Game-specific components
│   └── ui/                       # Shared UI components
│       ├── NetworkError.tsx     # Error state display
│       └── SkeletonLoader.tsx   # Loading state display
│
├── hooks/                        # Custom React hooks
│   ├── usePosts.ts              # Community posts management
│   ├── useLeaderboard.ts        # Leaderboard data & state
│   ├── useUserProfile.ts        # User profile & XP stats
│   ├── useGameCooldown.ts       # Game cooldown management
│   └── useRetry.ts              # Retry logic with backoff
│
├── services/                     # API & data services
│   ├── auth/                     # Authentication services
│   │   ├── authService.ts       # Google OAuth, sign in/out
│   │   └── tokenManager.ts      # Token storage & refresh
│   └── supabase/                 # Supabase API services
│       ├── client.ts            # Supabase client setup
│       ├── postService.ts       # Posts CRUD operations
│       ├── userService.ts       # User profile operations
│       └── leaderboardService.ts # XP rankings queries
│
├── contexts/                     # React Context providers
│   ├── AuthContext.tsx          # Auth state & user profile
│   ├── ContentContext.tsx       # Posts real-time sync
│   └── VideoContext.tsx         # YouTube videos state
│
├── features/                     # Feature modules
│   └── games/                    # Game-specific features
│       ├── core/                # Shared game abstractions
│       │   ├── BaseGameEngine.ts # Abstract game engine
│       │   └── types.ts         # Shared game types
│       ├── noPogod/             # Nu Pogodi game
│       │   ├── engine/          # Game engine modules
│       │   └── utils/           # Game utilities
│       └── hammockJump/         # Hammock Jump game
│           └── engine/          # Game engine modules
│
├── types/                        # TypeScript type definitions
│   ├── index.ts                 # Re-exports all types
│   ├── post.ts                  # Post-related types
│   ├── user.ts                  # User & XP types
│   └── game.ts                  # Game-related types
│
├── utils/                        # Utility functions
│   ├── logger.ts                # Centralized logging
│   ├── errorHandling.ts         # Error utilities
│   ├── gameCooldowns.ts         # Cooldown management
│   ├── xpStatsCache.ts          # XP caching
│   ├── notifications.ts         # Push notifications
│   └── youtube.ts               # YouTube API helpers
│
├── constants/                    # App constants
│   └── Colors.ts                # Theme colors
│
└── __tests__/                    # Test files
    ├── services/                # Service tests
    ├── hooks/                   # Hook tests
    ├── components/              # Component tests
    └── utils/                   # Utility tests
```

---

## Adding New Features

### Step 1: Define Types

**Always start with types!** This ensures type safety across your feature.

```typescript
// types/myFeature.ts
export interface MyFeatureData {
  id: string;
  name: string;
  value: number;
  createdAt: string;
}

export interface MyFeatureState {
  data: MyFeatureData[];
  isLoading: boolean;
  error: Error | null;
}

// types/index.ts
export * from './myFeature';
```

### Step 2: Create Service Layer

**Services handle all API interactions.** No React, just pure data operations.

```typescript
// services/supabase/myFeatureService.ts
import { createLogger } from '@/utils/logger';
import { supabase } from './client';
import type { MyFeatureData } from '@/types';

const log = createLogger('MyFeatureService');

class MyFeatureService {
  /**
   * Fetch all data for my feature
   */
  async fetchAll(): Promise<MyFeatureData[]> {
    try {
      const { data, error } = await supabase
        .from('my_feature_table')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        log.error('Failed to fetch data', error);
        throw new Error('Failed to load data');
      }

      return data || [];
    } catch (error) {
      log.error('Unexpected error in fetchAll', error);
      throw error;
    }
  }

  /**
   * Create new feature entry
   */
  async create(data: Omit<MyFeatureData, 'id' | 'createdAt'>): Promise<MyFeatureData> {
    try {
      const { data: newData, error } = await supabase
        .from('my_feature_table')
        .insert([data])
        .select()
        .single();

      if (error) {
        log.error('Failed to create entry', error);
        throw new Error('Failed to create entry');
      }

      log.info('Entry created successfully', { id: newData.id });
      return newData;
    } catch (error) {
      log.error('Unexpected error in create', error);
      throw error;
    }
  }
}

export const myFeatureService = new MyFeatureService();
```

### Step 3: Create Custom Hook

**Hooks manage state and orchestrate service calls.** They're the bridge between services and UI.

```typescript
// hooks/useMyFeature.ts
import { useState, useEffect, useCallback } from 'react';
import { createLogger } from '@/utils/logger';
import { myFeatureService } from '@/services/supabase/myFeatureService';
import type { MyFeatureData, MyFeatureState } from '@/types';

const log = createLogger('UseMyFeature');

interface UseMyFeatureOptions {
  autoFetch?: boolean;
}

export function useMyFeature(options: UseMyFeatureOptions = {}) {
  const { autoFetch = true } = options;

  const [state, setState] = useState<MyFeatureState>({
    data: [],
    isLoading: false,
    error: null,
  });

  /**
   * Fetch data from service
   */
  const fetchData = useCallback(async () => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      const data = await myFeatureService.fetchAll();
      setState({ data, isLoading: false, error: null });
      log.debug('Data fetched successfully', { count: data.length });
    } catch (error) {
      const err = error instanceof Error ? error : new Error('Unknown error');
      setState(prev => ({ ...prev, isLoading: false, error: err }));
      log.error('Failed to fetch data', error);
    }
  }, []);

  /**
   * Create new entry
   */
  const create = useCallback(async (data: Omit<MyFeatureData, 'id' | 'createdAt'>) => {
    try {
      const newEntry = await myFeatureService.create(data);
      
      // Optimistically update state
      setState(prev => ({
        ...prev,
        data: [newEntry, ...prev.data],
      }));

      return true;
    } catch (error) {
      log.error('Failed to create entry', error);
      return false;
    }
  }, []);

  // Auto-fetch on mount if enabled
  useEffect(() => {
    if (autoFetch) {
      fetchData();
    }
  }, [autoFetch, fetchData]);

  return {
    data: state.data,
    isLoading: state.isLoading,
    error: state.error,
    refetch: fetchData,
    create,
  };
}
```

### Step 4: Create Components

**Components are pure UI - they receive props and emit events.**

```typescript
// components/myFeature/MyFeatureCard.tsx
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Colors } from '@/constants/Colors';
import type { MyFeatureData } from '@/types';

interface MyFeatureCardProps {
  data: MyFeatureData;
  onPress: (id: string) => void;
}

/**
 * MyFeatureCard Component
 * 
 * Displays a single feature card with name and value.
 */
export const MyFeatureCard: React.FC<MyFeatureCardProps> = ({ data, onPress }) => {
  return (
    <TouchableOpacity
      style={styles.container}
      onPress={() => onPress(data.id)}
    >
      <Text style={styles.name}>{data.name}</Text>
      <Text style={styles.value}>{data.value}</Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(245, 245, 245, 0.05)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(196, 255, 0, 0.2)',
  },
  name: {
    fontSize: 18,
    fontFamily: 'HamakiEng',
    color: Colors.dark.tint,
    marginBottom: 8,
  },
  value: {
    fontSize: 16,
    fontFamily: 'SpaceMono',
    color: Colors.dark.text,
  },
});
```

### Step 5: Use in Screen

**Screens compose components and wire up hooks.**

```typescript
// app/(tabs)/myFeature.tsx
import React, { useCallback } from 'react';
import { ScrollView, StyleSheet, Text, View, RefreshControl } from 'react-native';
import { MyFeatureCard } from '@/components/myFeature/MyFeatureCard';
import { NetworkError } from '@/components/ui/NetworkError';
import { Colors } from '@/constants/Colors';
import { useMyFeature } from '@/hooks/useMyFeature';
import { createLogger } from '@/utils/logger';

const log = createLogger('MyFeatureScreen');

export default function MyFeatureScreen() {
  const { data, isLoading, error, refetch } = useMyFeature();
  const [isRefreshing, setIsRefreshing] = React.useState(false);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await refetch();
    setIsRefreshing(false);
  }, [refetch]);

  const handleCardPress = useCallback((id: string) => {
    log.debug('Card pressed', { id });
    // Handle card press
  }, []);

  if (error && data.length === 0) {
    return (
      <View style={styles.container}>
        <NetworkError message={error.message} onRetry={refetch} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>My Feature</Text>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            colors={[Colors.dark.tint]}
            tintColor={Colors.dark.tint}
          />
        }
      >
        {data.map(item => (
          <MyFeatureCard
            key={item.id}
            data={item}
            onPress={handleCardPress}
          />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.background,
  },
  title: {
    fontSize: 32,
    fontFamily: 'HamakiEng',
    color: Colors.dark.tint,
    textAlign: 'center',
    paddingTop: 60,
    marginBottom: 20,
  },
  scrollContent: {
    padding: 20,
  },
});
```

### Step 6: Write Tests

**Always write tests!** Follow the test patterns established in the project.

```typescript
// __tests__/services/myFeatureService.test.ts
import { myFeatureService } from '@/services/supabase/myFeatureService';
import { supabase } from '@/services/supabase/client';

jest.mock('@/services/supabase/client');

describe('MyFeatureService', () => {
  const mockSupabase = supabase as jest.Mocked<typeof supabase>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('fetchAll', () => {
    it('should fetch all data successfully', async () => {
      const mockData = [
        { id: '1', name: 'Test', value: 100, createdAt: '2024-01-01' },
      ];

      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        order: jest.fn().mockResolvedValue({
          data: mockData,
          error: null,
        }),
      } as any);

      const result = await myFeatureService.fetchAll();

      expect(result).toEqual(mockData);
      expect(mockSupabase.from).toHaveBeenCalledWith('my_feature_table');
    });

    it('should throw error when fetch fails', async () => {
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        order: jest.fn().mockResolvedValue({
          data: null,
          error: { message: 'Database error' },
        }),
      } as any);

      await expect(myFeatureService.fetchAll()).rejects.toThrow('Failed to load data');
    });
  });
});
```

```typescript
// __tests__/components/myFeature/MyFeatureCard.test.tsx
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { MyFeatureCard } from '@/components/myFeature/MyFeatureCard';

describe('MyFeatureCard', () => {
  const mockData = {
    id: '1',
    name: 'Test Feature',
    value: 100,
    createdAt: '2024-01-01',
  };

  const mockOnPress = jest.fn();

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should render feature name and value', () => {
    const { getByText } = render(
      <MyFeatureCard data={mockData} onPress={mockOnPress} />
    );

    expect(getByText('Test Feature')).toBeTruthy();
    expect(getByText('100')).toBeTruthy();
  });

  it('should call onPress with id when pressed', () => {
    const { getByText } = render(
      <MyFeatureCard data={mockData} onPress={mockOnPress} />
    );

    fireEvent.press(getByText('Test Feature'));

    expect(mockOnPress).toHaveBeenCalledTimes(1);
    expect(mockOnPress).toHaveBeenCalledWith('1');
  });
});
```

---

## Coding Patterns & Best Practices

### Logger Usage

**ALWAYS use the logger instead of `console.log`!**

```typescript
import { createLogger } from '@/utils/logger';

const log = createLogger('MyComponent'); // Use component/file name

// Debug - Development info
log.debug('User action', { action: 'buttonPress', buttonId: '123' });

// Info - Important events
log.info('Data loaded successfully', { count: items.length });

// Warn - Recoverable issues
log.warn('Cache miss, fetching from server', { key: cacheKey });

// Error - Unrecoverable errors
log.error('Failed to save data', error, { userId: user.id });
```

**Logger benefits:**
- Environment-aware (verbose in dev, quiet in production)
- Structured logging (message + data object)
- Easy to integrate with error tracking services
- Consistent format across codebase

### Error Handling

**Use try-catch for async operations and provide user-friendly errors.**

```typescript
import { getUserFriendlyErrorMessage, isNetworkError } from '@/utils/errorHandling';
import { createLogger } from '@/utils/logger';

const log = createLogger('MyService');

async function fetchData() {
  try {
    const response = await api.getData();
    return response;
  } catch (error) {
    // Log the full error for debugging
    log.error('Failed to fetch data', error);

    // Check if it's a network error
    if (isNetworkError(error)) {
      throw new Error('No internet connection. Please check your network.');
    }

    // Get user-friendly message
    const message = getUserFriendlyErrorMessage(error);
    throw new Error(message);
  }
}
```

**Available error utilities:**
- `isNetworkError(error)` - Check if error is network-related
- `getUserFriendlyErrorMessage(error)` - Convert technical error to user message
- `retryWithBackoff(fn, options)` - Retry failed operations with exponential backoff

### State Management

**Use hooks for state, not Context (unless global state is truly needed).**

```typescript
// ✅ GOOD - Hook manages local state
function MyScreen() {
  const { data, isLoading } = useMyFeature();
  // ...
}

// ❌ BAD - Don't create Context for every feature
const MyFeatureContext = createContext();
```

**When to use Context:**
- Authentication state (AuthContext)
- Theme preferences
- Truly global app state

**When to use Hooks:**
- Feature-specific state
- Data fetching
- Local UI state

### Async Operations

**Always handle loading and error states properly.**

```typescript
function MyComponent() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const handleAction = async () => {
    setIsLoading(true);
    setError(null);

    try {
      await performAction();
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Unknown error'));
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) return <LoadingSpinner />;
  if (error) return <ErrorMessage error={error} />;
  
  return <Content />;
}
```

### Component Composition

**Break large components into smaller, reusable pieces.**

```typescript
// ✅ GOOD - Small, focused components
function ProfileScreen() {
  return (
    <View>
      <ProfileHeader />
      <StatsCard />
      <PostsList />
    </View>
  );
}

// ❌ BAD - Everything in one component
function ProfileScreen() {
  return (
    <View>
      {/* 500 lines of JSX */}
    </View>
  );
}
```

---

## Testing Guidelines

### Test Structure

Follow the **AAA pattern**: Arrange, Act, Assert

```typescript
describe('MyComponent', () => {
  describe('Feature Group', () => {
    it('should do something specific', () => {
      // Arrange - Set up test data
      const mockData = { id: '1', name: 'Test' };
      const mockCallback = jest.fn();

      // Act - Perform the action
      const { getByText } = render(
        <MyComponent data={mockData} onPress={mockCallback} />
      );
      fireEvent.press(getByText('Button'));

      // Assert - Verify the result
      expect(mockCallback).toHaveBeenCalledWith('1');
    });
  });
});
```

### Mocking

**Mock external dependencies, not internal logic.**

```typescript
// Mock services
jest.mock('@/services/supabase/myService');

// Mock components for integration tests
jest.mock('@/components/ui/LoadingSpinner', () => ({
  LoadingSpinner: () => {
    const { View, Text } = require('react-native');
    return <View testID="loading-spinner"><Text>Loading...</Text></View>;
  },
}));
```

### Test Coverage Goals

- **Services**: 100% - All CRUD operations and error cases
- **Hooks**: 90% - All state transitions and edge cases
- **Components**: 80% - Rendering, interactions, states
- **Utils**: 100% - Pure functions are easy to test

---

## Error Handling

### Service Layer Errors

```typescript
class MyService {
  async getData() {
    try {
      const { data, error } = await supabase
        .from('table')
        .select('*');

      if (error) {
        log.error('Database error', error);
        throw new Error('Failed to load data');
      }

      return data;
    } catch (error) {
      // Re-throw with context
      log.error('Unexpected error in getData', error);
      throw error;
    }
  }
}
```

### Hook Layer Errors

```typescript
function useMyData() {
  const [error, setError] = useState<Error | null>(null);

  const fetchData = async () => {
    try {
      const data = await myService.getData();
      setError(null);
      return data;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Unknown error');
      setError(error);
      log.error('Failed to fetch data', error);
      return null;
    }
  };

  return { fetchData, error };
}
```

### UI Layer Errors

```typescript
function MyScreen() {
  const { error, refetch } = useMyData();

  if (error) {
    return (
      <NetworkError
        message={error.message}
        onRetry={refetch}
      />
    );
  }

  // ... render content
}
```

---

## Logging

### Logger Levels

Use appropriate log levels:

```typescript
// DEBUG - Detailed diagnostic info (dev only)
log.debug('Function called', { params: { id, name } });
log.debug('State updated', { oldState, newState });

// INFO - Important business events
log.info('User logged in', { userId: user.id });
log.info('Data synced successfully', { count: items.length });

// WARN - Potential issues, but recoverable
log.warn('Cache expired, fetching fresh data', { key });
log.warn('API rate limit approaching', { remaining: 10 });

// ERROR - Errors that need attention
log.error('Payment failed', error, { userId, amount });
log.error('Database connection lost', error);
```

### Logger Best Practices

```typescript
// ✅ GOOD - Descriptive message + structured data
log.info('Post created successfully', {
  postId: newPost.id,
  userId: user.id,
  categoryId: category,
});

// ❌ BAD - String concatenation, no context
log.info(`Post ${newPost.id} created by user ${user.id}`);

// ✅ GOOD - Pass error object as second parameter
log.error('Failed to update profile', error, { userId });

// ❌ BAD - Error lost in string
log.error(`Failed to update profile: ${error.message}`);
```

---

## Type Safety

### Always Export Types

```typescript
// ✅ GOOD - Types in dedicated file
// types/myFeature.ts
export interface MyData {
  id: string;
  name: string;
}

// types/index.ts
export * from './myFeature';

// ❌ BAD - Types inline with implementation
// services/myService.ts
interface MyData { // Not exported!
  id: string;
}
```

### Use Type Guards

```typescript
function isMyData(obj: unknown): obj is MyData {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'id' in obj &&
    'name' in obj
  );
}

// Usage
if (isMyData(data)) {
  // TypeScript knows data is MyData here
  console.log(data.name);
}
```

### Avoid `any`

```typescript
// ✅ GOOD - Proper typing
function processData(data: MyData[]): ProcessedData {
  return data.map(item => ({ ...item, processed: true }));
}

// ❌ BAD - Using any
function processData(data: any): any {
  return data.map((item: any) => ({ ...item, processed: true }));
}
```

---

## Common Utilities

### Available Utilities

#### `utils/logger.ts`
```typescript
import { createLogger } from '@/utils/logger';
const log = createLogger('ModuleName');
```

#### `utils/errorHandling.ts`
```typescript
import { 
  isNetworkError,
  getUserFriendlyErrorMessage,
  retryWithBackoff,
} from '@/utils/errorHandling';

// Check network errors
if (isNetworkError(error)) { /* handle */ }

// Get user-friendly message
const message = getUserFriendlyErrorMessage(error);

// Retry with backoff
await retryWithBackoff(() => apiCall(), { maxRetries: 3 });
```

#### `utils/gameCooldowns.ts`
```typescript
import {
  getGameCooldown,
  setGameCooldown,
  checkGameCooldown,
} from '@/utils/gameCooldowns';

// Check if game is on cooldown
const { isOnCooldown, timeRemaining } = await checkGameCooldown('no_pogod', userId);

// Set cooldown after game ends
await setGameCooldown('no_pogod', userId);
```

#### `utils/xpStatsCache.ts`
```typescript
import {
  getXPStatsFromCache,
  saveXPStatsToCache,
  invalidateXPStatsCache,
} from '@/utils/xpStatsCache';

// Try cache first
const cachedStats = await getXPStatsFromCache(userId);

// Save to cache
await saveXPStatsToCache(userId, stats);

// Clear cache
await invalidateXPStatsCache(userId);
```

---

## Summary Checklist

When adding a new feature, follow this checklist:

- [ ] **Types** - Define in `types/` folder
- [ ] **Service** - Create service class in `services/`
- [ ] **Hook** - Create custom hook in `hooks/`
- [ ] **Component** - Create UI component in `components/`
- [ ] **Screen** - Use hook and component in screen
- [ ] **Tests** - Write tests for service, hook, and component
- [ ] **Logger** - Use `createLogger` for all logging
- [ ] **Error Handling** - Try-catch with user-friendly messages
- [ ] **Types** - No `any`, proper interfaces
- [ ] **Documentation** - JSDoc comments for public APIs

---

## Questions?

If you have questions about the architecture or how to implement something:

1. Check existing similar features for patterns
2. Look at the test files for usage examples
3. Review the refactoring guide in `documentation/refactoring-guide.md`
4. Ask the team for guidance

Happy coding! 🚀
