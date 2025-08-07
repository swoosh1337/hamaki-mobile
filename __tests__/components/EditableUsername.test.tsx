import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { EditableUsername } from '../../components/profile/EditableUsername';

describe('EditableUsername', () => {
  const mockOnSave = jest.fn();
  const defaultProps = {
    currentUsername: 'Test User',
    onSave: mockOnSave,
    isLoading: false,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should display current username in read mode by default', () => {
    const { getByTestId, getByText } = render(<EditableUsername {...defaultProps} />);
    
    expect(getByTestId('username-display')).toBeTruthy();
    expect(getByText('Test User')).toBeTruthy();
    expect(getByTestId('edit-username-button')).toBeTruthy();
  });

  it('should enter edit mode when edit button is pressed', () => {
    const { getByTestId, queryByTestId } = render(<EditableUsername {...defaultProps} />);
    
    const editButton = getByTestId('edit-username-button');
    fireEvent.press(editButton);
    
    expect(getByTestId('username-input')).toBeTruthy();
    expect(getByTestId('save-username-button')).toBeTruthy();
    expect(getByTestId('cancel-username-button')).toBeTruthy();
    expect(queryByTestId('username-display')).toBeNull();
  });

  it('should pre-fill input with current username when entering edit mode', () => {
    const { getByTestId } = render(<EditableUsername {...defaultProps} />);
    
    const editButton = getByTestId('edit-username-button');
    fireEvent.press(editButton);
    
    const input = getByTestId('username-input');
    expect(input.props.value).toBe('Test User');
  });

  it('should update input value when text is changed', () => {
    const { getByTestId } = render(<EditableUsername {...defaultProps} />);
    
    const editButton = getByTestId('edit-username-button');
    fireEvent.press(editButton);
    
    const input = getByTestId('username-input');
    fireEvent.changeText(input, 'New Username');
    
    expect(input.props.value).toBe('New Username');
  });

  it('should call onSave when save button is pressed with valid input', async () => {
    const { getByTestId } = render(<EditableUsername {...defaultProps} />);
    
    const editButton = getByTestId('edit-username-button');
    fireEvent.press(editButton);
    
    const input = getByTestId('username-input');
    fireEvent.changeText(input, 'New Username');
    
    const saveButton = getByTestId('save-username-button');
    fireEvent.press(saveButton);
    
    expect(mockOnSave).toHaveBeenCalledWith('New Username');
  });

  it('should exit edit mode and return to read mode when cancel button is pressed', () => {
    const { getByTestId, queryByTestId } = render(<EditableUsername {...defaultProps} />);
    
    const editButton = getByTestId('edit-username-button');
    fireEvent.press(editButton);
    
    const input = getByTestId('username-input');
    fireEvent.changeText(input, 'Changed Text');
    
    const cancelButton = getByTestId('cancel-username-button');
    fireEvent.press(cancelButton);
    
    expect(queryByTestId('username-input')).toBeNull();
    expect(getByTestId('username-display')).toBeTruthy();
    expect(mockOnSave).not.toHaveBeenCalled();
  });

  it('should not call onSave if username is too short', () => {
    const { getByTestId, getByText } = render(<EditableUsername {...defaultProps} />);
    
    const editButton = getByTestId('edit-username-button');
    fireEvent.press(editButton);
    
    const input = getByTestId('username-input');
    fireEvent.changeText(input, 'A'); // Too short
    
    const saveButton = getByTestId('save-username-button');
    fireEvent.press(saveButton);
    
    expect(getByText('Username must be between 2 and 30 characters')).toBeTruthy();
    expect(mockOnSave).not.toHaveBeenCalled();
  });

  it('should not call onSave if username is too long', () => {
    const { getByTestId, getByText } = render(<EditableUsername {...defaultProps} />);
    
    const editButton = getByTestId('edit-username-button');
    fireEvent.press(editButton);
    
    const input = getByTestId('username-input');
    fireEvent.changeText(input, 'A'.repeat(31)); // Too long
    
    const saveButton = getByTestId('save-username-button');
    fireEvent.press(saveButton);
    
    expect(getByText('Username must be between 2 and 30 characters')).toBeTruthy();
    expect(mockOnSave).not.toHaveBeenCalled();
  });

  it('should not call onSave if username contains invalid characters', () => {
    const { getByTestId, getByText } = render(<EditableUsername {...defaultProps} />);
    
    const editButton = getByTestId('edit-username-button');
    fireEvent.press(editButton);
    
    const input = getByTestId('username-input');
    fireEvent.changeText(input, 'Invalid@User!'); // Invalid characters
    
    const saveButton = getByTestId('save-username-button');
    fireEvent.press(saveButton);
    
    expect(getByText('Username can only contain letters, numbers, and spaces')).toBeTruthy();
    expect(mockOnSave).not.toHaveBeenCalled();
  });

  it('should not call onSave if username is unchanged', () => {
    const { getByTestId, getByText } = render(<EditableUsername {...defaultProps} />);
    
    const editButton = getByTestId('edit-username-button');
    fireEvent.press(editButton);
    
    // Don't change the input, keep original value
    const saveButton = getByTestId('save-username-button');
    fireEvent.press(saveButton);
    
    expect(getByText('Please enter a different username')).toBeTruthy();
    expect(mockOnSave).not.toHaveBeenCalled();
  });

  it('should clear error message when input is modified', () => {
    const { getByTestId, getByText, queryByText } = render(<EditableUsername {...defaultProps} />);
    
    const editButton = getByTestId('edit-username-button');
    fireEvent.press(editButton);
    
    const input = getByTestId('username-input');
    
    // Trigger validation error
    fireEvent.changeText(input, 'A'); // Too short
    const saveButton = getByTestId('save-username-button');
    fireEvent.press(saveButton);
    
    expect(getByText('Username must be between 2 and 30 characters')).toBeTruthy();
    
    // Change input to clear error
    fireEvent.changeText(input, 'Valid Username');
    
    expect(queryByText('Username must be between 2 and 30 characters')).toBeNull();
  });

  it('should disable edit button when loading', () => {
    const { getByTestId } = render(<EditableUsername {...defaultProps} isLoading={true} />);
    
    const editButton = getByTestId('edit-username-button');
    expect(editButton.props.accessibilityState.disabled).toBe(true);
  });

  it('should show loading state correctly', () => {
    // Test that when not loading, component works normally
    const { getByTestId } = render(<EditableUsername {...defaultProps} isLoading={false} />);
    
    const editButton = getByTestId('edit-username-button');
    expect(editButton.props.accessibilityState.disabled).toBe(false);
  });

  it('should have proper accessibility labels', () => {
    const { getByTestId } = render(<EditableUsername {...defaultProps} />);
    
    const editButton = getByTestId('edit-username-button');
    expect(editButton.props.accessibilityLabel).toBe('Edit username');
    expect(editButton.props.accessibilityRole).toBe('button');
  });

  it('should apply dark theme styles', () => {
    const { getByTestId } = render(<EditableUsername {...defaultProps} />);
    
    const container = getByTestId('username-container');
    expect(container.props.style).toEqual(expect.objectContaining({
      backgroundColor: '#0B0C1A', // Dark background
    }));
    
    const displayText = getByTestId('username-display');
    expect(displayText.props.style).toEqual(expect.objectContaining({
      color: '#F5F5F5', // Light text
    }));
  });

  it('should trim whitespace from username before validation and save', async () => {
    const { getByTestId } = render(<EditableUsername {...defaultProps} />);
    
    const editButton = getByTestId('edit-username-button');
    fireEvent.press(editButton);
    
    const input = getByTestId('username-input');
    fireEvent.changeText(input, '  Trimmed Username  '); // With whitespace
    
    const saveButton = getByTestId('save-username-button');
    fireEvent.press(saveButton);
    
    expect(mockOnSave).toHaveBeenCalledWith('Trimmed Username');
  });
});