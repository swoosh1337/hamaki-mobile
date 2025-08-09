import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { AvatarPicker } from '../../components/profile/AvatarPicker';

describe('AvatarPicker', () => {
  const mockOnSelect = jest.fn();
  const defaultProps = {
    selectedAvatar: 'avatar-1',
    onSelect: mockOnSelect,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render all three avatar options', () => {
    const { getByTestId } = render(<AvatarPicker {...defaultProps} />);
    
    expect(getByTestId('avatar-option-avatar-1')).toBeTruthy();
    expect(getByTestId('avatar-option-avatar-2')).toBeTruthy();
    expect(getByTestId('avatar-option-avatar-3')).toBeTruthy();
  });

  it('should highlight the selected avatar', () => {
    const { getByTestId } = render(<AvatarPicker {...defaultProps} selectedAvatar="avatar-2" />);
    
    const selectedAvatar = getByTestId('avatar-option-avatar-2');
    const unselectedAvatar = getByTestId('avatar-option-avatar-1');
    
    // Check that selected avatar has active styling (we'll check for a selected style indicator)
    expect(selectedAvatar.props.style).toEqual(expect.objectContaining({
      borderColor: '#C4FF00', // Hamaki brand color for selection
    }));
    
    // Check that unselected avatar doesn't have active styling
    expect(unselectedAvatar.props.style).not.toEqual(expect.objectContaining({
      borderColor: '#C4FF00',
    }));
  });

  it('should call onSelect when avatar is tapped', () => {
    const { getByTestId } = render(<AvatarPicker {...defaultProps} />);
    
    const avatar2Option = getByTestId('avatar-option-avatar-2');
    fireEvent.press(avatar2Option);
    
    expect(mockOnSelect).toHaveBeenCalledWith('avatar-2');
    expect(mockOnSelect).toHaveBeenCalledTimes(1);
  });

  it('should not call onSelect when currently selected avatar is tapped', () => {
    const { getByTestId } = render(<AvatarPicker {...defaultProps} selectedAvatar="avatar-1" />);
    
    const selectedAvatar = getByTestId('avatar-option-avatar-1');
    fireEvent.press(selectedAvatar);
    
    expect(mockOnSelect).not.toHaveBeenCalled();
  });

  it('should display avatar titles correctly', () => {
    const { getByText } = render(<AvatarPicker {...defaultProps} />);
    
    expect(getByText('Avatar 1')).toBeTruthy();
    expect(getByText('Avatar 2')).toBeTruthy();
    expect(getByText('Avatar 3')).toBeTruthy();
  });

  it('should have proper accessibility labels', () => {
    const { getByTestId } = render(<AvatarPicker {...defaultProps} />);
    
    const avatar1 = getByTestId('avatar-option-avatar-1');
    expect(avatar1.props.accessibilityLabel).toBe('Select Avatar 1');
    expect(avatar1.props.accessibilityRole).toBe('button');
  });

  it('should display loading state when isLoading is true', () => {
    const { getByTestId } = render(<AvatarPicker {...defaultProps} isLoading={true} />);
    
    expect(getByTestId('avatar-picker-loading')).toBeTruthy();
  });

  it('should disable avatar selection when isLoading is true', () => {
    const { queryByTestId } = render(<AvatarPicker {...defaultProps} isLoading={true} />);
    
    // Avatar options should not be rendered when loading
    const avatar2Option = queryByTestId('avatar-option-avatar-2');
    expect(avatar2Option).toBeNull();
    
    // onSelect should not be callable when loading (options don't exist)
    expect(mockOnSelect).not.toHaveBeenCalled();
  });

  it('should show current selection indicator', () => {
    const { getByTestId } = render(<AvatarPicker {...defaultProps} selectedAvatar="avatar-3" />);
    
    const selectedIndicator = getByTestId('selected-indicator-avatar-3');
    expect(selectedIndicator).toBeTruthy();
  });

  it('should apply dark theme styles', () => {
    const { getByTestId } = render(<AvatarPicker {...defaultProps} />);
    
    const container = getByTestId('avatar-picker-container');
    expect(container.props.style).toEqual(expect.objectContaining({
      backgroundColor: '#0B0C1A', // Dark background from theme
    }));
  });

  it('should handle edge case of invalid selectedAvatar', () => {
    const { getByTestId } = render(<AvatarPicker {...defaultProps} selectedAvatar="invalid-avatar" />);
    
    // Should still render all options without crashing
    expect(getByTestId('avatar-option-avatar-1')).toBeTruthy();
    expect(getByTestId('avatar-option-avatar-2')).toBeTruthy();
    expect(getByTestId('avatar-option-avatar-3')).toBeTruthy();
  });
});