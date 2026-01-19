import React from 'react';
import { Image, ImageProps, ImageStyle, StyleProp } from 'react-native';

type Props = {
  size?: number;
  color?: string; // kept for API parity; not used when using PNG
  style?: StyleProp<ImageStyle>;
  resizeMode?: ImageProps['resizeMode'];
  accessibilityLabel?: string;
};

/**
 * Shared Games icon for tabs and lists. Centralize the PNG usage so future
 * changes (e.g., switching to a vector icon) only happen in one place.
 */
export const GamesIcon: React.FC<Props> = ({
  size = 24,
  style,
  resizeMode = 'contain',
  accessibilityLabel = 'Games',
}) => {
  return (
    <Image
      source={require('@/assets/images/mini_games.webp')}
      style={[{ width: size, height: size }, style]}
      resizeMode={resizeMode}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="image"
    />
  );
};

export default GamesIcon;

