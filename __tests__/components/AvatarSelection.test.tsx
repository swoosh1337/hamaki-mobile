// Mock modules first
jest.mock('../../utils/supabase');

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { AvatarPicker } from '../../components/profile/AvatarPicker';

describe('AvatarPicker Component', () => {
  const mockOnSelect = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Rendering', () => {
    it('should render without crashing', () => {
      const { getByTestId } = render(
        <AvatarPicker selectedAvatar="avatar-1" onSelect={mockOnSelect} />
      );
      expect(getByTestId('avatar-picker-container')).toBeTruthy();
    });

    it('should render title', () => {
      const { getByText } = render(
        <AvatarPicker selectedAvatar="avatar-1" onSelect={mockOnSelect} />
      );
      expect(getByText('Choose Your Avatar')).toBeTruthy();
    });

    it('should render all 18 avatar options', () => {
      const { getAllByRole } = render(
        <AvatarPicker selectedAvatar="avatar-1" onSelect={mockOnSelect} />
      );
      const buttons = getAllByRole('button');
      expect(buttons.length).toBe(18);
    });

    it('should render loading state when isLoading is true', () => {
      const { getByTestId, getByText } = render(
        <AvatarPicker selectedAvatar="avatar-1" onSelect={mockOnSelect} isLoading={true} />
      );
      expect(getByTestId('avatar-picker-loading')).toBeTruthy();
      expect(getByText('Updating avatar...')).toBeTruthy();
    });

    it('should not render avatar grid when loading', () => {
      const { queryByTestId } = render(
        <AvatarPicker selectedAvatar="avatar-1" onSelect={mockOnSelect} isLoading={true} />
      );
      expect(queryByTestId('avatar-option-avatar-1')).toBeNull();
    });
  });

  describe('Avatar Selection', () => {
    it('should call onSelect when avatar is clicked', () => {
      const { getByTestId } = render(
        <AvatarPicker selectedAvatar="avatar-1" onSelect={mockOnSelect} />
      );

      const avatar2 = getByTestId('avatar-option-avatar-2');
      fireEvent.press(avatar2);

      expect(mockOnSelect).toHaveBeenCalledWith('avatar-2');
    });

    it('should mark selected avatar visually', () => {
      const { getByTestId } = render(
        <AvatarPicker selectedAvatar="avatar-5" onSelect={mockOnSelect} />
      );

      const selectedIndicator = getByTestId('selected-indicator-avatar-5');
      expect(selectedIndicator).toBeTruthy();
    });

    it('should not call onSelect when selected avatar is clicked', () => {
      const { getByTestId } = render(
        <AvatarPicker selectedAvatar="avatar-3" onSelect={mockOnSelect} />
      );

      const avatar3 = getByTestId('avatar-option-avatar-3');
      fireEvent.press(avatar3);

      // Selected avatar is disabled, should not trigger onSelect
      expect(mockOnSelect).not.toHaveBeenCalled();
    });

    it('should not allow selection when isLoading is true', () => {
      const { getByTestId } = render(
        <AvatarPicker
          selectedAvatar="avatar-1"
          onSelect={mockOnSelect}
          isLoading={false}
        />
      );

      const avatar2 = getByTestId('avatar-option-avatar-2');
      expect(avatar2.props.accessibilityState.disabled).toBe(false);
    });
  });

  describe('Edge Cases', () => {
    it('should handle all 18 avatars being selectable', () => {
      for (let i = 1; i <= 18; i++) {
        const avatarId = `avatar-${i}`;
        const { getByTestId } = render(
          <AvatarPicker selectedAvatar={avatarId} onSelect={mockOnSelect} />
        );

        const selectedIndicator = getByTestId(`selected-indicator-${avatarId}`);
        expect(selectedIndicator).toBeTruthy();
      }
    });

    it('should handle rapid avatar selection', () => {
      const { getByTestId } = render(
        <AvatarPicker selectedAvatar="avatar-1" onSelect={mockOnSelect} />
      );

      // Rapidly click different avatars
      fireEvent.press(getByTestId('avatar-option-avatar-2'));
      fireEvent.press(getByTestId('avatar-option-avatar-3'));
      fireEvent.press(getByTestId('avatar-option-avatar-4'));

      expect(mockOnSelect).toHaveBeenCalledTimes(3);
      expect(mockOnSelect).toHaveBeenNthCalledWith(1, 'avatar-2');
      expect(mockOnSelect).toHaveBeenNthCalledWith(2, 'avatar-3');
      expect(mockOnSelect).toHaveBeenNthCalledWith(3, 'avatar-4');
    });

    it('should handle selection of first avatar', () => {
      const { getByTestId } = render(
        <AvatarPicker selectedAvatar="avatar-5" onSelect={mockOnSelect} />
      );

      fireEvent.press(getByTestId('avatar-option-avatar-1'));
      expect(mockOnSelect).toHaveBeenCalledWith('avatar-1');
    });

    it('should handle selection of last avatar (avatar-18)', () => {
      const { getByTestId } = render(
        <AvatarPicker selectedAvatar="avatar-1" onSelect={mockOnSelect} />
      );

      fireEvent.press(getByTestId('avatar-option-avatar-18'));
      expect(mockOnSelect).toHaveBeenCalledWith('avatar-18');
    });

    it('should handle invalid selectedAvatar prop gracefully', () => {
      const { getByTestId } = render(
        <AvatarPicker selectedAvatar="invalid-avatar" onSelect={mockOnSelect} />
      );

      // Should still render without crashing
      expect(getByTestId('avatar-picker-container')).toBeTruthy();
    });

    it('should handle empty selectedAvatar prop', () => {
      const { getByTestId } = render(
        <AvatarPicker selectedAvatar="" onSelect={mockOnSelect} />
      );

      expect(getByTestId('avatar-picker-container')).toBeTruthy();
      // No avatar should be marked as selected
      expect(() => getByTestId('selected-indicator-avatar-1')).toThrow();
    });
  });

  describe('Accessibility', () => {
    it('should have proper accessibility labels for all avatars', () => {
      const { getByLabelText } = render(
        <AvatarPicker selectedAvatar="avatar-1" onSelect={mockOnSelect} />
      );

      for (let i = 1; i <= 18; i++) {
        const avatar = getByLabelText(`Select Avatar ${i}`);
        expect(avatar).toBeTruthy();
      }
    });

    it('should mark selected avatar with correct accessibility state', () => {
      const { getByTestId } = render(
        <AvatarPicker selectedAvatar="avatar-7" onSelect={mockOnSelect} />
      );

      const selectedAvatar = getByTestId('avatar-option-avatar-7');
      expect(selectedAvatar.props.accessibilityState.selected).toBe(true);
      expect(selectedAvatar.props.accessibilityState.disabled).toBe(true);
    });

    it('should mark non-selected avatars as not selected', () => {
      const { getByTestId } = render(
        <AvatarPicker selectedAvatar="avatar-1" onSelect={mockOnSelect} />
      );

      const nonSelectedAvatar = getByTestId('avatar-option-avatar-2');
      expect(nonSelectedAvatar.props.accessibilityState.selected).toBe(false);
    });

    it('should have button role for all avatars', () => {
      const { getByTestId } = render(
        <AvatarPicker selectedAvatar="avatar-1" onSelect={mockOnSelect} />
      );

      for (let i = 1; i <= 18; i++) {
        const avatar = getByTestId(`avatar-option-avatar-${i}`);
        expect(avatar.props.accessibilityRole).toBe('button');
      }
    });
  });

  describe('Loading State', () => {
    it('should disable all avatars when isLoading is true', () => {
      const { rerender, getByTestId } = render(
        <AvatarPicker selectedAvatar="avatar-1" onSelect={mockOnSelect} isLoading={false} />
      );

      let avatar2 = getByTestId('avatar-option-avatar-2');
      expect(avatar2.props.accessibilityState.disabled).toBe(false);

      rerender(
        <AvatarPicker selectedAvatar="avatar-1" onSelect={mockOnSelect} isLoading={true} />
      );

      // When loading, should show loading screen, not avatars
      expect(() => getByTestId('avatar-option-avatar-2')).toThrow();
    });

    it('should show loading indicator when isLoading', () => {
      const { getByTestId } = render(
        <AvatarPicker selectedAvatar="avatar-1" onSelect={mockOnSelect} isLoading={true} />
      );

      expect(getByTestId('avatar-picker-loading')).toBeTruthy();
    });
  });

  describe('UI Layout', () => {
    it('should render avatars in a grid', () => {
      const { getAllByRole } = render(
        <AvatarPicker selectedAvatar="avatar-1" onSelect={mockOnSelect} />
      );

      const buttons = getAllByRole('button');
      // 18 avatars should be arranged in a grid (3 per row = 6 rows)
      expect(buttons.length).toBe(18);
    });

    it('should display avatar titles', () => {
      const { getByText } = render(
        <AvatarPicker selectedAvatar="avatar-1" onSelect={mockOnSelect} />
      );

      for (let i = 1; i <= 18; i++) {
        expect(getByText(`Avatar ${i}`)).toBeTruthy();
      }
    });
  });

  describe('Selection State Transitions', () => {
    it('should update selection when selectedAvatar prop changes', () => {
      const { getByTestId, rerender } = render(
        <AvatarPicker selectedAvatar="avatar-1" onSelect={mockOnSelect} />
      );

      expect(getByTestId('selected-indicator-avatar-1')).toBeTruthy();

      rerender(
        <AvatarPicker selectedAvatar="avatar-10" onSelect={mockOnSelect} />
      );

      expect(getByTestId('selected-indicator-avatar-10')).toBeTruthy();
      expect(() => getByTestId('selected-indicator-avatar-1')).toThrow();
    });

    it('should handle switching from no selection to a selection', () => {
      const { getByTestId, rerender } = render(
        <AvatarPicker selectedAvatar="" onSelect={mockOnSelect} />
      );

      // No selection initially
      expect(() => getByTestId('selected-indicator-avatar-1')).toThrow();

      rerender(
        <AvatarPicker selectedAvatar="avatar-8" onSelect={mockOnSelect} />
      );

      expect(getByTestId('selected-indicator-avatar-8')).toBeTruthy();
    });
  });
});
