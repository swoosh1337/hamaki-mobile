import { render } from '@testing-library/react-native';
import React from 'react';
import { XPDisplay } from '../../components/profile/XPDisplay';

describe('XPDisplay', () => {
  const defaultProps = {
    totalXP: 1500,
    weeklyXP: 250,
    isLoading: false,
  };

  it('should display total XP correctly', () => {
    const { getByTestId, getByText } = render(<XPDisplay {...defaultProps} />);

    expect(getByTestId('total-xp-display')).toBeTruthy();
    expect(getByText('1,500')).toBeTruthy();
    expect(getByText('Total XP')).toBeTruthy();
  });

  it('should display weekly XP correctly', () => {
    const { getByTestId, getByText } = render(<XPDisplay {...defaultProps} />);

    expect(getByTestId('weekly-xp-display')).toBeTruthy();
    expect(getByText('250')).toBeTruthy();
    expect(getByText('This Week')).toBeTruthy();
  });

  it('should format large numbers with commas', () => {
    const { getByText } = render(<XPDisplay {...defaultProps} totalXP={15000} weeklyXP={2500} />);

    expect(getByText('15,000')).toBeTruthy();
    expect(getByText('2,500')).toBeTruthy();
  });

  it('should handle zero values correctly', () => {
    const { getAllByText } = render(<XPDisplay {...defaultProps} totalXP={0} weeklyXP={0} />);

    // Should have two instances of "0" - one for total XP and one for weekly XP
    const zeroTexts = getAllByText('0');
    expect(zeroTexts).toHaveLength(2);
  });

  it('should show loading state when isLoading is true', () => {
    const { getByTestId } = render(<XPDisplay {...defaultProps} isLoading={true} />);

    expect(getByTestId('xp-display-loading')).toBeTruthy();
  });

  it('should not show XP values when loading', () => {
    const { queryByTestId } = render(<XPDisplay {...defaultProps} isLoading={true} />);

    expect(queryByTestId('total-xp-display')).toBeNull();
    expect(queryByTestId('weekly-xp-display')).toBeNull();
  });

  it('should apply dark theme styles', () => {
    const { getByTestId } = render(<XPDisplay {...defaultProps} />);

    const container = getByTestId('xp-display-container');
    expect(container.props.style).toEqual(expect.objectContaining({
      backgroundColor: '#0B0C1A', // Dark background
    }));
  });

  it('should highlight weekly XP with accent color', () => {
    const { getByTestId } = render(<XPDisplay {...defaultProps} />);

    const weeklyXPValue = getByTestId('weekly-xp-value');
    expect(weeklyXPValue.props.style).toEqual(expect.objectContaining({
      color: '#C4FF00', // Hamaki accent color
    }));
  });

  it('should show XP icons correctly', () => {
    const { getByTestId } = render(<XPDisplay {...defaultProps} />);

    expect(getByTestId('total-xp-icon')).toBeTruthy();
    expect(getByTestId('weekly-xp-icon')).toBeTruthy();
  });

  it('should handle very large XP numbers', () => {
    const { getByText } = render(
      <XPDisplay {...defaultProps} totalXP={1234567} weeklyXP={12345} />
    );

    expect(getByText('1,234,567')).toBeTruthy();
    expect(getByText('12,345')).toBeTruthy();
  });

  it('should display correct labels', () => {
    const { getByText } = render(<XPDisplay {...defaultProps} />);

    expect(getByText('Experience Points')).toBeTruthy();
    expect(getByText('Total XP')).toBeTruthy();
    expect(getByText('This Week')).toBeTruthy();
  });

  it('should have proper accessibility labels', () => {
    const { getByTestId } = render(<XPDisplay {...defaultProps} />);

    const totalXP = getByTestId('total-xp-display');
    expect(totalXP.props.accessibilityLabel).toBe('Total XP: 1500 points');

    const weeklyXP = getByTestId('weekly-xp-display');
    expect(weeklyXP.props.accessibilityLabel).toBe('Weekly XP: 250 points');
  });

  it('should show progress indicator for weekly XP', () => {
    const { getByTestId } = render(<XPDisplay {...defaultProps} />);

    expect(getByTestId('weekly-progress-indicator')).toBeTruthy();
  });

  it('should calculate weekly progress percentage correctly', () => {
    const { getByTestId } = render(<XPDisplay {...defaultProps} weeklyXP={250} />);
    const indicator = getByTestId('weekly-progress-indicator');
    expect(indicator.props.accessibilityValue.now).toBe(50);
    expect(indicator.props.accessibilityValue.text).toBe('50%');
  });

  it('should handle weekly XP exceeding goal', () => {
    const { getByTestId } = render(<XPDisplay {...defaultProps} weeklyXP={750} />);
    const indicator = getByTestId('weekly-progress-indicator');
    expect(indicator.props.accessibilityValue.now).toBe(100);
    expect(indicator.props.accessibilityValue.text).toBe('100%');
  });

  it('should show loading message when loading', () => {
    const { getByText } = render(<XPDisplay {...defaultProps} isLoading={true} />);

    expect(getByText('Loading XP stats...')).toBeTruthy();
  });
});