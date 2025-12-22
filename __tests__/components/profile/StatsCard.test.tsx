import type { XPStats } from '@/types/user';
import { render } from '@testing-library/react-native';
import React from 'react';
import { StatsCard } from '../../../components/profile/StatsCard';

// Mock the XPStatsSkeleton component
jest.mock('../../../components/ui/SkeletonLoader', () => ({
    XPStatsSkeleton: () => {
        const { View, Text } = require('react-native');
        return (
            <View testID="xp-stats-skeleton">
                <Text>Loading XP...</Text>
            </View>
        );
    },
}));

describe('StatsCard', () => {
    const mockXPStats: XPStats = {
        totalXP: 1250,
        weeklyXP: 350,
        weeklyStartDate: '2024-01-01T00:00:00Z',
        weeklyEndDate: '2024-01-08T00:00:00Z',
    };

    describe('Rendering', () => {
        it('should render weekly XP', () => {
            const { getByText } = render(
                <StatsCard xpStats={mockXPStats} isLoading={false} />
            );

            expect(getByText('This Week:')).toBeTruthy();
            expect(getByText('350 XP')).toBeTruthy();
        });

        it('should render total XP', () => {
            const { getByText } = render(
                <StatsCard xpStats={mockXPStats} isLoading={false} />
            );

            expect(getByText('Total:')).toBeTruthy();
            expect(getByText('1,250 XP')).toBeTruthy();
        });

        it('should format large numbers with commas', () => {
            const largeStats: XPStats = {
                totalXP: 123456,
                weeklyXP: 12345,
                weeklyStartDate: '2024-01-01T00:00:00Z',
                weeklyEndDate: '2024-01-08T00:00:00Z',
            };

            const { getByText } = render(
                <StatsCard xpStats={largeStats} isLoading={false} />
            );

            expect(getByText('123,456 XP')).toBeTruthy();
            expect(getByText('12,345 XP')).toBeTruthy();
        });

        it('should handle zero XP values', () => {
            const zeroStats: XPStats = {
                totalXP: 0,
                weeklyXP: 0,
                weeklyStartDate: '2024-01-01T00:00:00Z',
                weeklyEndDate: '2024-01-08T00:00:00Z',
            };

            const { getAllByText } = render(
                <StatsCard xpStats={zeroStats} isLoading={false} />
            );

            const zeroXPTexts = getAllByText('0 XP');
            expect(zeroXPTexts).toHaveLength(2); // One for weekly, one for total
        });

        it('should handle null xpStats gracefully', () => {
            const { getAllByText } = render(
                <StatsCard xpStats={null} isLoading={false} />
            );

            const zeroXPTexts = getAllByText('0 XP');
            expect(zeroXPTexts).toHaveLength(2); // One for weekly, one for total
        });

        it('should display both stat items', () => {
            const { getByText } = render(
                <StatsCard xpStats={mockXPStats} isLoading={false} />
            );

            // Both labels should be present
            expect(getByText('This Week:')).toBeTruthy();
            expect(getByText('Total:')).toBeTruthy();
        });
    });

    describe('Loading State', () => {
        it('should show skeleton loader when isLoading is true', () => {
            const { getByTestId } = render(
                <StatsCard xpStats={mockXPStats} isLoading={true} />
            );

            expect(getByTestId('xp-stats-skeleton')).toBeTruthy();
        });

        it('should not show XP stats when loading', () => {
            const { queryByText } = render(
                <StatsCard xpStats={mockXPStats} isLoading={true} />
            );

            expect(queryByText('This Week:')).toBeNull();
            expect(queryByText('Total:')).toBeNull();
        });

        it('should show stats when loading completes', () => {
            const { rerender, getByText, queryByTestId } = render(
                <StatsCard xpStats={mockXPStats} isLoading={true} />
            );

            // Initially loading
            expect(queryByTestId('xp-stats-skeleton')).toBeTruthy();

            // Rerender with loading false
            rerender(<StatsCard xpStats={mockXPStats} isLoading={false} />);

            // Stats should now be visible
            expect(getByText('350 XP')).toBeTruthy();
            expect(queryByTestId('xp-stats-skeleton')).toBeNull();
        });
    });

    describe('Styling', () => {
        it('should have proper row layout for stat items', () => {
            const { getByText } = render(
                <StatsCard xpStats={mockXPStats} isLoading={false} />
            );

            const weeklyStatItem = getByText('This Week:').parent;

            expect(weeklyStatItem?.props.style).toEqual(
                expect.objectContaining({
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                })
            );
        });

        it('should have border bottom for stat items', () => {
            const { getByText } = render(
                <StatsCard xpStats={mockXPStats} isLoading={false} />
            );

            const statItem = getByText('Total:').parent;

            expect(statItem?.props.style).toEqual(
                expect.objectContaining({
                    borderBottomWidth: 1,
                    borderBottomColor: 'rgba(196, 255, 0, 0.2)',
                })
            );
        });

        it('should use accent color for XP values', () => {
            const { getByText } = render(
                <StatsCard xpStats={mockXPStats} isLoading={false} />
            );

            const xpValue = getByText('350 XP');

            expect(xpValue.props.style).toEqual(
                expect.objectContaining({
                    color: '#C4FF00', // Hamaki accent color
                    fontWeight: 'bold',
                })
            );
        });

        it('should use SpaceMono font', () => {
            const { getByText } = render(
                <StatsCard xpStats={mockXPStats} isLoading={false} />
            );

            const label = getByText('This Week:');
            const value = getByText('350 XP');

            expect(label.props.style).toEqual(
                expect.objectContaining({
                    fontFamily: 'SpaceMono',
                })
            );

            expect(value.props.style).toEqual(
                expect.objectContaining({
                    fontFamily: 'SpaceMono',
                })
            );
        });
    });

    describe('Edge Cases', () => {
        it('should handle very large XP numbers', () => {
            const largeStats: XPStats = {
                totalXP: 9999999,
                weeklyXP: 999999,
                weeklyStartDate: '2024-01-01T00:00:00Z',
                weeklyEndDate: '2024-01-08T00:00:00Z',
            };

            const { getByText } = render(
                <StatsCard xpStats={largeStats} isLoading={false} />
            );

            expect(getByText('9,999,999 XP')).toBeTruthy();
            expect(getByText('999,999 XP')).toBeTruthy();
        });

        it('should handle negative XP values (edge case)', () => {
            const negativeStats: XPStats = {
                totalXP: -100,
                weeklyXP: -50,
                weeklyStartDate: '2024-01-01T00:00:00Z',
                weeklyEndDate: '2024-01-08T00:00:00Z',
            };

            const { getByText } = render(
                <StatsCard xpStats={negativeStats} isLoading={false} />
            );

            // toLocaleString should handle negative numbers
            expect(getByText('-100 XP')).toBeTruthy();
            expect(getByText('-50 XP')).toBeTruthy();
        });

        it('should handle decimal XP values', () => {
            const decimalStats: XPStats = {
                totalXP: 1234.56,
                weeklyXP: 123.45,
                weeklyStartDate: '2024-01-01T00:00:00Z',
                weeklyEndDate: '2024-01-08T00:00:00Z',
            };

            const { getByText } = render(
                <StatsCard xpStats={decimalStats} isLoading={false} />
            );

            // toLocaleString handles decimals
            expect(getByText(/1,234\.56 XP/)).toBeTruthy();
            expect(getByText(/123\.45 XP/)).toBeTruthy();
        });
    });
});
