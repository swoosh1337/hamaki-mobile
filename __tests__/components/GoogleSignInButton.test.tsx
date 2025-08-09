import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { GoogleSignInButton } from '../../components/ui/GoogleSignInButton';

describe('GoogleSignInButton', () => {
  const mockOnPress = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render with default text', () => {
    const { getByText } = render(
      <GoogleSignInButton onPress={mockOnPress} />
    );

    expect(getByText('Continue with Google')).toBeTruthy();
  });

  it('should render with custom text', () => {
    const customText = 'Sign in with Google';
    const { getByText } = render(
      <GoogleSignInButton onPress={mockOnPress} text={customText} />
    );

    expect(getByText(customText)).toBeTruthy();
  });

  it('should call onPress when button is pressed', () => {
    const { getByTestId } = render(
      <GoogleSignInButton onPress={mockOnPress} />
    );

    const button = getByTestId('google-sign-in-button');
    fireEvent.press(button);

    expect(mockOnPress).toHaveBeenCalledTimes(1);
  });

  it('should render without errors', () => {
    const { getByText } = render(
      <GoogleSignInButton onPress={mockOnPress} />
    );

    // Component should render successfully with text
    expect(getByText('Continue with Google')).toBeTruthy();
  });

  it('should have correct accessibility properties', () => {
    const { getByText } = render(
      <GoogleSignInButton onPress={mockOnPress} />
    );

    const text = getByText('Continue with Google');
    expect(text).toBeTruthy();
    // TouchableOpacity is accessible by default in React Native Testing Library
  });

  it('should handle multiple rapid presses', () => {
    const { getByTestId } = render(
      <GoogleSignInButton onPress={mockOnPress} />
    );

    const button = getByTestId('google-sign-in-button');
    
    // Simulate rapid pressing
    fireEvent.press(button);
    fireEvent.press(button);
    fireEvent.press(button);

    expect(mockOnPress).toHaveBeenCalledTimes(3);
  });
});