import { fireEvent, render } from '@testing-library/react-native';
import React from 'react';
import { SortFilter } from '../../../components/community/SortFilter';

describe('SortFilter', () => {
    const mockOnSortChange = jest.fn();

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('Rendering', () => {
        it('should render both sort buttons', () => {
            const { getByText } = render(
                <SortFilter sortBy="upvotes" onSortChange={mockOnSortChange} />
            );

            expect(getByText('Popular')).toBeTruthy();
            expect(getByText('Latest')).toBeTruthy();
        });

        it('should highlight Popular button when sortBy is upvotes', () => {
            const { getByText } = render(
                <SortFilter sortBy="upvotes" onSortChange={mockOnSortChange} />
            );

            const popularButton = getByText('Popular').parent;
            const latestButton = getByText('Latest').parent;

            // Popular button should have active styles
            expect(popularButton?.props.style).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({ backgroundColor: '#C4FF00' })
                ])
            );

            // Latest button should not have active styles
            expect(latestButton?.props.style).not.toEqual(
                expect.arrayContaining([
                    expect.objectContaining({ backgroundColor: '#C4FF00' })
                ])
            );
        });

        it('should highlight Latest button when sortBy is latest', () => {
            const { getByText } = render(
                <SortFilter sortBy="latest" onSortChange={mockOnSortChange} />
            );

            const popularButton = getByText('Popular').parent;
            const latestButton = getByText('Latest').parent;

            // Latest button should have active styles
            expect(latestButton?.props.style).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({ backgroundColor: '#C4FF00' })
                ])
            );

            // Popular button should not have active styles
            expect(popularButton?.props.style).not.toEqual(
                expect.arrayContaining([
                    expect.objectContaining({ backgroundColor: '#C4FF00' })
                ])
            );
        });
    });

    describe('Interactions', () => {
        it('should call onSortChange with "upvotes" when Popular is pressed', () => {
            const { getByText } = render(
                <SortFilter sortBy="latest" onSortChange={mockOnSortChange} />
            );

            fireEvent.press(getByText('Popular'));

            expect(mockOnSortChange).toHaveBeenCalledTimes(1);
            expect(mockOnSortChange).toHaveBeenCalledWith('upvotes');
        });

        it('should call onSortChange with "latest" when Latest is pressed', () => {
            const { getByText } = render(
                <SortFilter sortBy="upvotes" onSortChange={mockOnSortChange} />
            );

            fireEvent.press(getByText('Latest'));

            expect(mockOnSortChange).toHaveBeenCalledTimes(1);
            expect(mockOnSortChange).toHaveBeenCalledWith('latest');
        });

        it('should allow pressing the same button multiple times', () => {
            const { getByText } = render(
                <SortFilter sortBy="upvotes" onSortChange={mockOnSortChange} />
            );

            fireEvent.press(getByText('Popular'));
            fireEvent.press(getByText('Popular'));

            expect(mockOnSortChange).toHaveBeenCalledTimes(2);
            expect(mockOnSortChange).toHaveBeenCalledWith('upvotes');
        });

        it('should handle rapid button presses', () => {
            const { getByText } = render(
                <SortFilter sortBy="upvotes" onSortChange={mockOnSortChange} />
            );

            fireEvent.press(getByText('Popular'));
            fireEvent.press(getByText('Latest'));
            fireEvent.press(getByText('Popular'));

            expect(mockOnSortChange).toHaveBeenCalledTimes(3);
            expect(mockOnSortChange).toHaveBeenNthCalledWith(1, 'upvotes');
            expect(mockOnSortChange).toHaveBeenNthCalledWith(2, 'latest');
            expect(mockOnSortChange).toHaveBeenNthCalledWith(3, 'upvotes');
        });
    });

    describe('Styling', () => {
        it('should apply correct text color for active button', () => {
            const { getByText } = render(
                <SortFilter sortBy="upvotes" onSortChange={mockOnSortChange} />
            );

            const popularText = getByText('Popular');

            expect(popularText.props.style).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({ color: '#0B0C1A' }) // Dark background color for active text
                ])
            );
        });

        it('should apply correct text color for inactive button', () => {
            const { getByText } = render(
                <SortFilter sortBy="upvotes" onSortChange={mockOnSortChange} />
            );

            const latestText = getByText('Latest');

            expect(latestText.props.style).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({ color: '#FFFFFF' }) // White color for inactive text
                ])
            );
        });

        it('should have proper border styling', () => {
            const { getByText } = render(
                <SortFilter sortBy="upvotes" onSortChange={mockOnSortChange} />
            );

            const popularButton = getByText('Popular').parent;

            expect(popularButton?.props.style).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({
                        borderWidth: 1,
                        borderRadius: 20,
                    })
                ])
            );
        });
    });
});
