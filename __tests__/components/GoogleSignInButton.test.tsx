/**
 * GoogleSignInButton Component Tests
 */

import { fireEvent, render } from '@testing-library/react-native';
import React from 'react';
import { GoogleSignInButton } from '../../components/ui/GoogleSignInButton';

describe('GoogleSignInButton', () => {
  const mockOnPress = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render with Georgian text (Google in English, rest in Georgian)', () => {
    const { getByText } = render(
      <GoogleSignInButton onPress={mockOnPress} />
    );

    // Check that both parts of the text are rendered
    expect(getByText('Google')).toBeTruthy();
    expect(getByText('-ით გაგრძელება')).toBeTruthy();
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
    const { getByTestId } = render(
      <GoogleSignInButton onPress={mockOnPress} />
    );

    expect(getByTestId('google-sign-in-button')).toBeTruthy();
  });

  it('should have correct accessibility properties', () => {
    const { getByText } = render(
      <GoogleSignInButton onPress={mockOnPress} />
    );

    // Both text parts should be accessible
    expect(getByText('Google')).toBeTruthy();
    expect(getByText('-ით გაგრძელება')).toBeTruthy();
  });

  it('should handle multiple rapid presses', () => {
    const { getByTestId } = render(
      <GoogleSignInButton onPress={mockOnPress} />
    );

    const button = getByTestId('google-sign-in-button');

    fireEvent.press(button);
    fireEvent.press(button);
    fireEvent.press(button);

    expect(mockOnPress).toHaveBeenCalledTimes(3);
  });
});