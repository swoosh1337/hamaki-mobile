# Testing Guide for Hamaki Mobile

This guide provides best practices and patterns for writing tests in the Hamaki Mobile project, based on lessons learned from our test suite.

## Table of Contents

1. [General Principles](#general-principles)
2. [Project Test Setup](#project-test-setup)
3. [Component Testing](#component-testing)
4. [Service Testing](#service-testing)
5. [Context/Hook Testing](#contexthook-testing)
6. [Mocking Patterns](#mocking-patterns)
7. [Async Testing](#async-testing)
8. [Common Pitfalls](#common-pitfalls)

---

## General Principles

### ✅ DO:
- Write tests that verify behavior, not implementation details
- Use descriptive test names that explain what is being tested
- Keep tests isolated and independent
- Mock external dependencies (APIs, services, native modules)
- Test edge cases and error scenarios
- Use TypeScript for type safety in tests

### ❌ DON'T:
- Mock `react-native` in individual test files (use global mock)
- Use `undefined` values - always provide proper defaults
- Test implementation details (internal state, private methods)
- Create tests that depend on execution order
- Skip cleanup in `beforeEach`/`afterEach`

---

## Project Test Setup

### Global Configuration

Our project uses a global `jest.setup.js` that provides:

```javascript
// jest.setup.js
jest.mock('react-native', () => ({
  Platform: { OS: 'ios', Version: '15.0', ... },
  StyleSheet: { create: (styles) => styles, ... },
  Alert: { alert: jest.fn() },
  Keyboard: { dismiss: jest.fn() },
  // ... all commonly used RN components
}));
```

**Key Point:** Don't override `react-native` in individual test files. The global mock provides everything you need.

### Test File Structure

```typescript
/**
 * Component/Service Name Tests
 * 
 * Brief description of what is being tested
 */

import { render, fireEvent } from '@testing-library/react-native';
import React from 'react';
import { ComponentName } from '@/path/to/component';

// Mock external dependencies
jest.mock('@/services/someService', () => ({
  someService: {
    method: jest.fn(),
  },
}));

describe('ComponentName', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Feature Group', () => {
    it('should do something specific', () => {
      // Arrange
      const mockProp = jest.fn();
      
      // Act
      const { getByText } = render(<ComponentName onPress={mockProp} />);
      fireEvent.press(getByText('Button'));
      
      // Assert
      expect(mockProp).toHaveBeenCalledTimes(1);
    });
  });
});
```

---

## Component Testing

### Basic Component Test

**Example:** `GoogleSignInButton.test.tsx`

```typescript
import { fireEvent, render } from '@testing-library/react-native';
import React from 'react';
import { GoogleSignInButton } from '@/components/ui/GoogleSignInButton';

describe('GoogleSignInButton', () => {
  const mockOnPress = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render with Georgian text', () => {
    const { getByText } = render(
      <GoogleSignInButton onPress={mockOnPress} />
    );

    expect(getByText('Google')).toBeTruthy();
    expect(getByText('-ით გაგრძელება')).toBeTruthy();
  });

  it('should call onPress when button is pressed', () => {
    const { getByTestId } = render(
      <GoogleSignInButton onPress={mockOnPress} />
    );

    fireEvent.press(getByTestId('google-sign-in-button'));

    expect(mockOnPress).toHaveBeenCalledTimes(1);
  });
});
```

**Key Patterns:**
- Import components directly from `react-native` (no local mocking)
- Use `getByText`, `getByTestId` for queries
- Use `fireEvent` for interactions
- Clear mocks in `beforeEach`

### Testing Components with Alert/Keyboard

**Example:** `CreatePostModal.test.tsx`

```typescript
import { fireEvent, render } from '@testing-library/react-native';
import React from 'react';
import { Alert } from 'react-native';
import { CreatePostModal } from '@/components/ideas/CreatePostModal';

// Mock Ionicons
jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}));

// Spy on Alert
const alertSpy = jest.spyOn(Alert, 'alert');

describe('CreatePostModal', () => {
  const mockOnClose = jest.fn();
  const mockOnSubmit = jest.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should show confirmation dialog when canceling with filled form', () => {
    const { getByPlaceholderText, getByText } = render(
      <CreatePostModal 
        visible={true}
        onClose={mockOnClose}
        onSubmit={mockOnSubmit}
        isSubmitting={false}
      />
    );

    const titleInput = getByPlaceholderText('რა არის შენი ვიდეოს იდეა?');
    fireEvent.changeText(titleInput, 'Some title');
    fireEvent.press(getByText('გაუქმება'));

    expect(Alert.alert).toHaveBeenCalledWith(
      'ცვლილებების გაუქმება',
      'ნამდვილად გსურთ ცვლილებების გაუქმება?',
      expect.any(Array)
    );
  });
});
```

**Key Patterns:**
- Import `Alert` from `react-native` (global mock provides it)
- Use `jest.spyOn(Alert, 'alert')` to spy on calls
- Don't mock `Keyboard` - global mock handles it
- Mock icon libraries like `@expo/vector-icons`

---

## Service Testing

### Service with Supabase

**Example:** `userService.test.ts`

```typescript
import { userService } from '@/services/supabase/userService';

// Mock Supabase client
jest.mock('@/services/supabase/client', () => ({
  supabase: {
    from: jest.fn(),
  },
}));

const { supabase } = require('@/services/supabase/client');

describe('userService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getUserProfile', () => {
    it('should fetch user profile by google_id', async () => {
      const mockUser = {
        id: 'user_123',
        google_id: 'google_123',
        email: 'test@example.com',
      };

      supabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: mockUser,
              error: null,
            }),
          }),
        }),
      });

      const result = await userService.getUserProfile('google_123');

      expect(result).toEqual(mockUser);
      expect(supabase.from).toHaveBeenCalledWith('users');
    });

    it('should return null on error', async () => {
      supabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: null,
              error: { message: 'Not found' },
            }),
          }),
        }),
      });

      const result = await userService.getUserProfile('invalid_id');

      expect(result).toBeNull();
    });
  });
});
```

**Key Patterns:**
- Mock Supabase client at module level
- Chain mock return values to match Supabase query builder
- Test both success and error cases
- Use `mockResolvedValue` for async operations

---

## Context/Hook Testing

### Testing Contexts with Hooks

**Example:** `AuthContext.test.tsx`

```typescript
import { renderHook, act, waitFor } from '@testing-library/react-native';
import React from 'react';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';

// Mock services with getter pattern to avoid hoisting issues
const mockAuthService = {
  authenticate: jest.fn(),
  loadSavedSession: jest.fn(),
};

jest.mock('@/services/auth', () => ({
  get authService() {
    return mockAuthService;
  },
  get tokenManager() {
    return mockTokenManager;
  },
}));

// Mock react-native modules
jest.mock('react-native', () => {
  const actualRN = jest.requireActual('react-native');
  return {
    ...actualRN,
    AppState: {
      addEventListener: jest.fn().mockReturnValue({ remove: jest.fn() }),
    },
    Linking: {
      getInitialURL: jest.fn().mockResolvedValue(null),
      addEventListener: jest.fn().mockReturnValue({ remove: jest.fn() }),
    },
  };
});

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <AuthProvider>{children}</AuthProvider>
);

describe('AuthContext', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthService.loadSavedSession.mockResolvedValue({ success: false });
  });

  it('should sign in user successfully', async () => {
    mockAuthService.authenticate.mockResolvedValue({
      success: true,
      userData: { id: 'user_123', email: 'test@example.com' },
      authMethod: 'google',
    });

    const { result } = renderHook(() => useAuth(), { wrapper });

    await act(async () => {
      await result.current.signIn();
    });

    await waitFor(() => {
      expect(result.current.showRememberMeModal).toBe(true);
    });
  });
});
```

**Key Patterns:**
- Use `renderHook` from `@testing-library/react-native`
- Wrap hook in provider using `wrapper` prop
- Use `act` for state updates
- Use `waitFor` for async assertions
- Use getter pattern in mocks to avoid Jest hoisting issues

---

## Mocking Patterns

### 1. Service Mocking with Getter Pattern

**❌ WRONG (hoisting issue):**
```typescript
const mockUserService = {
  getUserProfile: jest.fn(),
};

jest.mock('@/services/supabase/userService', () => ({
  userService: mockUserService, // undefined at factory execution time
}));
```

**✅ CORRECT:**
```typescript
const mockUserService = {
  getUserProfile: jest.fn(),
};

jest.mock('@/services/supabase/userService', () => ({
  get userService() {
    return mockUserService; // resolved when accessed
  },
}));
```

### 2. React Native Component Mocking

**❌ WRONG (creates partial mock that breaks other tests):**
```typescript
// In individual test file
jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  // Missing Alert, Keyboard, etc - breaks other tests!
}));
```

**✅ CORRECT:**
```typescript
// Don't mock react-native in individual test files
// Use the global mock from jest.setup.js
import { Alert, Platform } from 'react-native';
```

### 3. Expo Module Mocking

```typescript
// Mock expo modules at the top of test file
jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
  AntDesign: 'AntDesign',
}));

jest.mock('expo-notifications', () => ({
  requestPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  scheduleNotificationAsync: jest.fn().mockResolvedValue('notification-id'),
}));
```

### 4. Dynamic Imports

**❌ WRONG (doesn't work with Jest):**
```typescript
// In application code
const { someFunction } = await import('@/utils/someUtil');
```

**✅ CORRECT:**
```typescript
// Use static imports for better testability
import { someFunction } from '@/utils/someUtil';
```

---

## Async Testing

### Using waitFor

```typescript
it('should update state after async operation', async () => {
  const { result } = renderHook(() => useAuth(), { wrapper });

  await act(async () => {
    await result.current.signIn();
  });

  // Wait for async state updates
  await waitFor(
    () => {
      expect(result.current.isAuthenticated).toBe(true);
    },
    { timeout: 3000 }
  );
});
```

### Testing Background Operations

```typescript
it('should perform background checks without blocking', async () => {
  const mockUser = { id: 'user_123', google_id: 'google_123' };
  
  mockUserService.getUserProfile.mockResolvedValue(mockUser);
  mockAuthService.authenticate.mockResolvedValue({
    success: true,
    userData: { id: 'google_123', email: 'test@example.com' },
    authMethod: 'google',
  });

  const { result } = renderHook(() => useAuth(), { wrapper });

  await act(async () => {
    await result.current.signIn();
  });

  await act(async () => {
    await result.current.finalizeSession(true);
  });

  // User should be authenticated immediately
  expect(result.current.isAuthenticated).toBe(true);

  // Background checks happen asynchronously
  await waitFor(
    () => {
      expect(mockBackgroundCheck).toHaveBeenCalled();
    },
    { timeout: 3000 }
  );
});
```

### Mock Async Functions

```typescript
// Mock resolved value
mockService.fetchData.mockResolvedValue({ data: 'success' });

// Mock rejected value
mockService.fetchData.mockRejectedValue(new Error('API Error'));

// Mock multiple calls with different results
mockService.fetchData
  .mockResolvedValueOnce({ data: 'first' })
  .mockResolvedValueOnce({ data: 'second' });
```

---

## Common Pitfalls

### 1. Alert/Keyboard Undefined

**Problem:**
```typescript
TypeError: Cannot read properties of undefined (reading 'alert')
```

**Solution:**
Don't mock `react-native` in your test file. The global mock in `jest.setup.js` provides `Alert` and `Keyboard`.

```typescript
// ✅ CORRECT
import { Alert } from 'react-native';
jest.spyOn(Alert, 'alert');
```

### 2. Jest Hoisting Issues

**Problem:**
```typescript
TypeError: Cannot read properties of undefined (reading 'getUserProfile')
```

**Solution:**
Use getter pattern in mocks:

```typescript
// ✅ CORRECT
jest.mock('@/services/supabase/userService', () => ({
  get userService() {
    return mockUserService;
  },
}));
```

### 3. Forgetting to Clear Mocks

**Problem:**
Tests pass individually but fail when run together.

**Solution:**
Always clear mocks in `beforeEach`:

```typescript
beforeEach(() => {
  jest.clearAllMocks();
  
  // Re-establish default mock return values
  mockService.method.mockResolvedValue(defaultValue);
});
```

### 4. Not Waiting for Async Updates

**Problem:**
```typescript
expect(result.current.data).toBe(expectedData); // Fails - data not loaded yet
```

**Solution:**
Use `waitFor` for async assertions:

```typescript
await waitFor(() => {
  expect(result.current.data).toBe(expectedData);
});
```

### 5. Testing Implementation Details

**Problem:**
```typescript
// ❌ Testing internal state
expect(component.state.internalCounter).toBe(5);
```

**Solution:**
Test observable behavior:

```typescript
// ✅ Testing behavior
const { getByText } = render(<Counter />);
expect(getByText('Count: 5')).toBeTruthy();
```

---

## Quick Reference

### Common Test Utilities

```typescript
// Rendering
import { render, renderHook } from '@testing-library/react-native';

// Interactions
import { fireEvent, act, waitFor } from '@testing-library/react-native';

// Queries
const { getByText, getByTestId, queryByText, getAllByText } = render(<Component />);

// React Native
import { Alert, Platform, Keyboard } from 'react-native';
```

### Mock Patterns

```typescript
// Service mock
jest.mock('@/services/myService', () => ({
  get myService() {
    return mockMyService;
  },
}));

// Expo module mock
jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}));

// Async mock
mockService.method.mockResolvedValue(data);
mockService.method.mockRejectedValue(error);
```

### Async Testing

```typescript
// Act wrapper for state updates
await act(async () => {
  await doSomethingAsync();
});

// Wait for condition
await waitFor(
  () => {
    expect(condition).toBe(true);
  },
  { timeout: 3000 }
);
```

---

## Examples from Our Codebase

### Component Tests
- `__tests__/components/GoogleSignInButton.test.tsx` - Basic component
- `__tests__/components/ideas/CreatePostModal.test.tsx` - Modal with Alert
- `__tests__/components/community/CreatePostFAB.test.tsx` - FAB with styles

### Service Tests
- `__tests__/services/supabase/userService.test.ts` - Supabase service
- `__tests__/services/auth/authService.test.ts` - Auth service
- `__tests__/services/youtube/subscriptionService.test.ts` - YouTube API

### Context/Hook Tests
- `__tests__/contexts/AuthContext.test.tsx` - Context with hooks
- `__tests__/contexts/AuthContext.backgroundChecks.test.tsx` - Background operations
- `__tests__/hooks/useLeaderboard.test.ts` - Custom hook

---

## Additional Resources

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [React Native Testing Library](https://callstack.github.io/react-native-testing-library/)
- [Testing Best Practices](https://kentcdodds.com/blog/common-mistakes-with-react-testing-library)

---

**Last Updated:** December 23, 2025
