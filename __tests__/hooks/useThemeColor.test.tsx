import React from 'react';
import { renderHook } from '@testing-library/react-native';
import { useThemeColor } from '../../hooks/useThemeColor';
import { useColorScheme } from '../../hooks/useColorScheme';
import { Colors } from '../../constants/Colors';

// Mock the useColorScheme hook
jest.mock('../../hooks/useColorScheme', () => ({
  useColorScheme: jest.fn(),
}));

const mockUseColorScheme = useColorScheme as jest.MockedFunction<typeof useColorScheme>;

describe('useThemeColor', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return color from props when theme matches', () => {
    mockUseColorScheme.mockReturnValue('light');

    const { result } = renderHook(() =>
      useThemeColor({ light: '#FF0000', dark: '#00FF00' }, 'text')
    );

    expect(result.current).toBe('#FF0000');
  });

  it('should return color from props for dark theme', () => {
    mockUseColorScheme.mockReturnValue('dark');

    const { result } = renderHook(() =>
      useThemeColor({ light: '#FF0000', dark: '#00FF00' }, 'text')
    );

    expect(result.current).toBe('#00FF00');
  });

  it('should return color from Colors constant when no prop provided', () => {
    mockUseColorScheme.mockReturnValue('light');

    const { result } = renderHook(() =>
      useThemeColor({}, 'text')
    );

    expect(result.current).toBe(Colors.light.text);
  });

  it('should return dark theme color from Colors constant', () => {
    mockUseColorScheme.mockReturnValue('dark');

    const { result } = renderHook(() =>
      useThemeColor({}, 'text')
    );

    expect(result.current).toBe(Colors.dark.text);
  });

  it('should default to light theme when useColorScheme returns null', () => {
    mockUseColorScheme.mockReturnValue(null);

    const { result } = renderHook(() =>
      useThemeColor({}, 'text')
    );

    expect(result.current).toBe(Colors.light.text);
  });

  it('should prioritize props over Colors constant', () => {
    mockUseColorScheme.mockReturnValue('light');

    const { result } = renderHook(() =>
      useThemeColor({ light: '#CUSTOM' }, 'text')
    );

    expect(result.current).toBe('#CUSTOM');
  });

  it('should handle different color names', () => {
    mockUseColorScheme.mockReturnValue('dark');

    const colorNames: Array<keyof typeof Colors.light & keyof typeof Colors.dark> = [
      'text',
      'background',
      'tint',
      'icon',
      'tabIconDefault',
      'tabIconSelected',
    ];

    colorNames.forEach(colorName => {
      const { result } = renderHook(() =>
        useThemeColor({}, colorName)
      );

      expect(result.current).toBe(Colors.dark[colorName]);
    });
  });

  it('should handle partial props (only light)', () => {
    mockUseColorScheme.mockReturnValue('dark');

    const { result } = renderHook(() =>
      useThemeColor({ light: '#LIGHT_ONLY' }, 'text')
    );

    // Should fall back to Colors constant for dark theme
    expect(result.current).toBe(Colors.dark.text);
  });

  it('should handle partial props (only dark)', () => {
    mockUseColorScheme.mockReturnValue('light');

    const { result } = renderHook(() =>
      useThemeColor({ dark: '#DARK_ONLY' }, 'text')
    );

    // Should fall back to Colors constant for light theme
    expect(result.current).toBe(Colors.light.text);
  });

  it('should react to theme changes', () => {
    mockUseColorScheme.mockReturnValue('light');

    const { result, rerender } = renderHook(() =>
      useThemeColor({ light: '#LIGHT', dark: '#DARK' }, 'text')
    );

    expect(result.current).toBe('#LIGHT');

    // Change theme to dark
    mockUseColorScheme.mockReturnValue('dark');
    // Pass a dummy props object to satisfy the render-hook type signature
    rerender({} as any);

    expect(result.current).toBe('#DARK');
  });
});