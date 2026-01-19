/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

const tintColorLight = '#C4FF00';
const tintColorDark = '#C4FF00';

export const Colors = {
  light: {
    text: '#0B0C1A',
    background: '#F5F5F5',
    tint: tintColorLight,
    icon: '#0B0C1A',
    tabIconDefault: '#0B0C1A',
    tabIconSelected: tintColorLight,
  },
  dark: {
    text: '#F5F5F5',
    background: '#0B0C1A',
    tint: tintColorDark,
    error: '#FF3B30',
    icon: '#F5F5F5',
    tabIconDefault: '#F5F5F5',
    tabIconSelected: tintColorDark,
  },
};
