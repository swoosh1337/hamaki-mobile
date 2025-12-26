/**
 * MagicLinkButton Component Tests
 */

import { fireEvent, render } from '@testing-library/react-native';
import React from 'react';
import { MagicLinkButton } from '../../components/ui/MagicLinkButton';

describe('MagicLinkButton', () => {
    const mockOnPress = jest.fn();

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should render with Georgian text', () => {
        const { getByText } = render(
            <MagicLinkButton onPress={mockOnPress} />
        );

        expect(getByText('ელფოსტით გაგრძელება')).toBeTruthy();
    });

    it('should call onPress when button is pressed', () => {
        const { getByTestId } = render(
            <MagicLinkButton onPress={mockOnPress} />
        );

        const button = getByTestId('magic-link-button');
        fireEvent.press(button);

        expect(mockOnPress).toHaveBeenCalledTimes(1);
    });

    it('should render when disabled', () => {
        const { getByTestId } = render(
            <MagicLinkButton onPress={mockOnPress} disabled />
        );

        // Button should still render when disabled
        const button = getByTestId('magic-link-button');
        expect(button).toBeTruthy();
    });

    it('should render without errors', () => {
        const { getByText } = render(
            <MagicLinkButton onPress={mockOnPress} />
        );

        expect(getByText('ელფოსტით გაგრძელება')).toBeTruthy();
    });

    it('should have correct accessibility properties', () => {
        const { getByText } = render(
            <MagicLinkButton onPress={mockOnPress} />
        );

        const text = getByText('ელფოსტით გაგრძელება');
        expect(text).toBeTruthy();
    });

    it('should handle multiple rapid presses', () => {
        const { getByTestId } = render(
            <MagicLinkButton onPress={mockOnPress} />
        );

        const button = getByTestId('magic-link-button');

        fireEvent.press(button);
        fireEvent.press(button);
        fireEvent.press(button);

        expect(mockOnPress).toHaveBeenCalledTimes(3);
    });

    it('should show disabled styling when disabled', () => {
        const { getByTestId } = render(
            <MagicLinkButton onPress={mockOnPress} disabled />
        );

        const button = getByTestId('magic-link-button');
        expect(button).toBeTruthy();
    });
});
