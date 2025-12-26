import { fireEvent, render } from '@testing-library/react-native';
import React from 'react';
import { TouchableOpacity } from 'react-native';
import { CreatePostFAB } from '../../../components/community/CreatePostFAB';

describe('CreatePostFAB', () => {
    const mockOnPress = jest.fn();

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('Rendering', () => {
        it('should render the FAB button', () => {
            const { UNSAFE_getByType } = render(<CreatePostFAB onPress={mockOnPress} />);

            const button = UNSAFE_getByType(TouchableOpacity);
            expect(button).toBeTruthy();
        });

        it('should render the add icon', () => {
            const { UNSAFE_getByType } = render(<CreatePostFAB onPress={mockOnPress} />);

            // Check that Ionicons is rendered (we can't easily test the icon name in testing-library)
            const icons = UNSAFE_getByType(require('@expo/vector-icons').Ionicons);
            expect(icons).toBeTruthy();
        });

        it('should have proper positioning styles', () => {
            const { UNSAFE_getByType } = render(<CreatePostFAB onPress={mockOnPress} />);

            const button = UNSAFE_getByType(TouchableOpacity);

            expect(button.props.style).toEqual(
                expect.objectContaining({
                    position: 'absolute',
                    right: 20,
                    bottom: 30,
                })
            );
        });

        it('should have circular shape', () => {
            const { UNSAFE_getByType } = render(<CreatePostFAB onPress={mockOnPress} />);

            const button = UNSAFE_getByType(TouchableOpacity);

            expect(button.props.style).toEqual(
                expect.objectContaining({
                    width: 56,
                    height: 56,
                    borderRadius: 28, // Half of width/height for perfect circle
                })
            );
        });

        it('should have accent background color', () => {
            const { UNSAFE_getByType } = render(<CreatePostFAB onPress={mockOnPress} />);

            const button = UNSAFE_getByType(TouchableOpacity);

            expect(button.props.style).toEqual(
                expect.objectContaining({
                    backgroundColor: '#C4FF00', // Hamaki accent color
                })
            );
        });

        it('should have shadow styling for elevation', () => {
            const { UNSAFE_getByType } = render(<CreatePostFAB onPress={mockOnPress} />);

            const button = UNSAFE_getByType(TouchableOpacity);

            expect(button.props.style).toEqual(
                expect.objectContaining({
                    elevation: 8,
                    shadowColor: '#000',
                    shadowOpacity: 0.3,
                    shadowRadius: 8,
                })
            );
        });
    });

    describe('Interactions', () => {
        it('should call onPress when tapped', () => {
            const { UNSAFE_getByType } = render(<CreatePostFAB onPress={mockOnPress} />);

            fireEvent.press(UNSAFE_getByType(TouchableOpacity));

            expect(mockOnPress).toHaveBeenCalledTimes(1);
        });

        it('should handle multiple taps', () => {
            const { UNSAFE_getByType } = render(<CreatePostFAB onPress={mockOnPress} />);

            const button = UNSAFE_getByType(TouchableOpacity);
            fireEvent.press(button);
            fireEvent.press(button);
            fireEvent.press(button);

            expect(mockOnPress).toHaveBeenCalledTimes(3);
        });

        it('should not pass any arguments to onPress', () => {
            const { UNSAFE_getByType } = render(<CreatePostFAB onPress={mockOnPress} />);

            fireEvent.press(UNSAFE_getByType(TouchableOpacity));

            expect(mockOnPress).toHaveBeenCalledWith();
        });
    });

    describe('Accessibility', () => {
        it('should be tappable via TouchableOpacity', () => {
            const { UNSAFE_getByType } = render(<CreatePostFAB onPress={mockOnPress} />);

            const button = UNSAFE_getByType(TouchableOpacity);
            expect(button).toBeTruthy();
            expect(button.props.onPress).toBe(mockOnPress);
        });
    });
});
