/**
 * CreatePostModal Component Tests
 * 
 * Tests for the modal that allows users to create new community posts,
 * including form validation, submission, and UI states.
 */

import { fireEvent, render, waitFor } from '@testing-library/react-native';
import React from 'react';
import { Alert } from 'react-native';
import { CreatePostModal } from '../../../components/ideas/CreatePostModal';

// Mock Ionicons
jest.mock('@expo/vector-icons', () => ({
    Ionicons: 'Ionicons',
}));

// Spy on Alert
const alertSpy = jest.spyOn(Alert, 'alert');

describe('CreatePostModal', () => {
    const mockOnClose = jest.fn();
    const mockOnSubmit = jest.fn().mockResolvedValue(undefined);

    const defaultProps = {
        visible: true,
        onClose: mockOnClose,
        onSubmit: mockOnSubmit,
        isSubmitting: false,
    };

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('Visibility', () => {
        it('should not render when visible is false', () => {
            const { queryByText } = render(
                <CreatePostModal {...defaultProps} visible={false} />
            );

            expect(queryByText('ახალი იდეა')).toBeNull();
        });
    });

    describe('Header Elements', () => {
        it('should render title in Georgian', () => {
            const { getByText } = render(<CreatePostModal {...defaultProps} />);

            expect(getByText('ახალი იდეა')).toBeTruthy();
        });

        it('should render cancel button in Georgian', () => {
            const { getByText } = render(<CreatePostModal {...defaultProps} />);

            expect(getByText('გაუქმება')).toBeTruthy();
        });

        it('should render submit button in Georgian', () => {
            const { getByText } = render(<CreatePostModal {...defaultProps} />);

            expect(getByText('დადასტურება')).toBeTruthy();
        });
    });

    describe('Form Inputs', () => {
        it('should render title input with Georgian label', () => {
            const { getByText, getByPlaceholderText } = render(
                <CreatePostModal {...defaultProps} />
            );

            expect(getByText('სათაური *')).toBeTruthy();
            expect(getByPlaceholderText('რა არის შენი ვიდეოს იდეა?')).toBeTruthy();
        });

        it('should render content input with Georgian label', () => {
            const { getByText, getByPlaceholderText } = render(
                <CreatePostModal {...defaultProps} />
            );

            expect(getByText('აღწერა *')).toBeTruthy();
            expect(getByPlaceholderText(/აღწერე შენი იდეა/)).toBeTruthy();
        });

        it('should show character count for title', () => {
            const { getByText } = render(<CreatePostModal {...defaultProps} />);

            expect(getByText('0/100')).toBeTruthy();
        });

        it('should show character count for content', () => {
            const { getByText } = render(<CreatePostModal {...defaultProps} />);

            expect(getByText('0/1000')).toBeTruthy();
        });

        it('should update character count when typing in title', () => {
            const { getByPlaceholderText, getByText } = render(
                <CreatePostModal {...defaultProps} />
            );

            const titleInput = getByPlaceholderText('რა არის შენი ვიდეოს იდეა?');
            fireEvent.changeText(titleInput, 'Hello');

            expect(getByText('5/100')).toBeTruthy();
        });
    });

    describe('Submit Button State', () => {
        it('should have submit button grayed out when fields are empty', () => {
            const { getByText } = render(<CreatePostModal {...defaultProps} />);

            const submitButton = getByText('დადასტურება');
            // Check that it has opacity style (grayed out)
            expect(submitButton.props.style).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({ opacity: 0.4 })
                ])
            );
        });

        it('should enable submit button when both fields are filled', () => {
            const { getByPlaceholderText, getByText } = render(
                <CreatePostModal {...defaultProps} />
            );

            const titleInput = getByPlaceholderText('რა არის შენი ვიდეოს იდეა?');
            const contentInput = getByPlaceholderText(/აღწერე შენი იდეა/);

            fireEvent.changeText(titleInput, 'Valid title here');
            fireEvent.changeText(contentInput, 'Valid content that is long enough for validation');

            const submitButton = getByText('დადასტურება');
            // Button should not have opacity: 0.4
            const hasLowOpacity = submitButton.props.style?.some?.(
                (s: any) => s?.opacity === 0.4
            );
            expect(hasLowOpacity).toBeFalsy();
        });
    });

    describe('Cancel Functionality', () => {
        it('should call onClose when cancel is pressed with empty form', () => {
            const { getByText } = render(<CreatePostModal {...defaultProps} />);

            fireEvent.press(getByText('გაუქმება'));

            expect(mockOnClose).toHaveBeenCalled();
        });

        it('should show confirmation dialog when canceling with filled form', () => {
            const { getByPlaceholderText, getByText } = render(
                <CreatePostModal {...defaultProps} />
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

    describe('Submission', () => {
        it('should call onSubmit with title and content when form is valid', async () => {
            const { getByPlaceholderText, getByText } = render(
                <CreatePostModal {...defaultProps} />
            );

            const titleInput = getByPlaceholderText('რა არის შენი ვიდეოს იდეა?');
            const contentInput = getByPlaceholderText(/აღწერე შენი იდეა/);

            fireEvent.changeText(titleInput, 'Valid Title Here');
            fireEvent.changeText(contentInput, 'This is a valid content that is long enough for the validation to pass');

            fireEvent.press(getByText('დადასტურება'));

            await waitFor(() => {
                expect(mockOnSubmit).toHaveBeenCalledWith(
                    'Valid Title Here',
                    'This is a valid content that is long enough for the validation to pass'
                );
            });
        });

        it('should show loading state while submitting', () => {
            const { getByText } = render(
                <CreatePostModal {...defaultProps} isSubmitting={true} />
            );

            expect(getByText('დასტურის დამუშავება...')).toBeTruthy();
        });

        it('should disable inputs while submitting', () => {
            const { getByPlaceholderText } = render(
                <CreatePostModal {...defaultProps} isSubmitting={true} />
            );

            const titleInput = getByPlaceholderText('რა არის შენი ვიდეოს იდეა?');
            expect(titleInput.props.editable).toBe(false);
        });
    });

    describe('Info Box', () => {
        it('should render info box with Georgian text', () => {
            const { getByText } = render(<CreatePostModal {...defaultProps} />);

            expect(getByText(/შენი იდეა განიხილება/)).toBeTruthy();
        });
    });

    describe('Edge Cases', () => {
        it('should handle whitespace-only input as empty', () => {
            const { getByPlaceholderText, getByText } = render(
                <CreatePostModal {...defaultProps} />
            );

            const titleInput = getByPlaceholderText('რა არის შენი ვიდეოს იდეა?');
            fireEvent.changeText(titleInput, '   ');

            const submitButton = getByText('დადასტურება');
            // Should still be grayed out
            expect(submitButton.props.style).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({ opacity: 0.4 })
                ])
            );
        });
    });
});
