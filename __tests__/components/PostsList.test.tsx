import { fireEvent, render, waitFor } from '@testing-library/react-native';
import React from 'react';
import { PostsList } from '../../components/profile/PostsList';
import { mockCurrentTime, restoreTime } from '../__helpers__/testHelpers';

describe('PostsList', () => {
  const mockPosts = [
    {
      id: 'post-1',
      user_id: 'user-1',
      title: 'First Post',
      content: 'This is the content of the first post',
      upvotes: 10,
      created_at: '2024-01-02T12:00:00Z',
      updated_at: '2024-01-02T12:00:00Z',
    },
    {
      id: 'post-2',
      user_id: 'user-1',
      title: 'Second Post',
      content: 'This is the content of the second post',
      upvotes: 5,
      created_at: '2024-01-01T12:00:00Z',
      updated_at: '2024-01-01T12:00:00Z',
    },
  ];

  const mockOnUpvote = jest.fn();
  const mockOnLoadMore = jest.fn();

  const defaultProps = {
    posts: mockPosts,
    onUpvote: mockOnUpvote,
    onLoadMore: mockOnLoadMore,
    isLoading: false,
    hasMore: true,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockCurrentTime();
  });

  afterEach(() => {
    restoreTime();
  });

  it('should render list of posts correctly', () => {
    const { getByText, getByTestId } = render(<PostsList {...defaultProps} />);
    
    expect(getByTestId('posts-list-container')).toBeTruthy();
    expect(getByText('First Post')).toBeTruthy();
    expect(getByText('Second Post')).toBeTruthy();
    expect(getByText('This is the content of the first post')).toBeTruthy();
    expect(getByText('This is the content of the second post')).toBeTruthy();
  });

  it('should display post upvote counts correctly', () => {
    const { getByTestId } = render(<PostsList {...defaultProps} />);
    
    const post1Upvotes = getByTestId('upvote-count-post-1');
    const post2Upvotes = getByTestId('upvote-count-post-2');
    
    expect(post1Upvotes.props.children).toBe(10);
    expect(post2Upvotes.props.children).toBe(5);
  });

  it('should call onUpvote when upvote button is pressed', () => {
    const { getByTestId } = render(<PostsList {...defaultProps} />);
    
    const upvoteButton = getByTestId('upvote-button-post-1');
    fireEvent.press(upvoteButton);
    
    expect(mockOnUpvote).toHaveBeenCalledWith('post-1');
  });

  it('should show empty state when no posts', () => {
    const { getByText, getByTestId } = render(<PostsList {...defaultProps} posts={[]} />);
    
    expect(getByTestId('posts-empty-state')).toBeTruthy();
    expect(getByText('No posts yet')).toBeTruthy();
    expect(getByText('Share your first post to get started!')).toBeTruthy();
  });

  it('should show loading indicator when loading', () => {
    const { getByTestId } = render(<PostsList {...defaultProps} isLoading={true} />);
    
    expect(getByTestId('posts-loading')).toBeTruthy();
  });

  it('should call onLoadMore when reaching end of list', async () => {
    const { getByTestId } = render(<PostsList {...defaultProps} />);
    
    const scrollView = getByTestId('posts-scroll-view');
    fireEvent.scroll(scrollView, {
      nativeEvent: {
        contentOffset: { y: 1000 },
        contentSize: { height: 1200 },
        layoutMeasurement: { height: 800 },
      },
    });
    
    await waitFor(() => {
      expect(mockOnLoadMore).toHaveBeenCalled();
    });
  });

  it('should not call onLoadMore when hasMore is false', async () => {
    const { getByTestId } = render(<PostsList {...defaultProps} hasMore={false} />);
    
    const scrollView = getByTestId('posts-scroll-view');
    fireEvent.scroll(scrollView, {
      nativeEvent: {
        contentOffset: { y: 1000 },
        contentSize: { height: 1200 },
        layoutMeasurement: { height: 800 },
      },
    });
    
    await waitFor(() => {
      expect(mockOnLoadMore).not.toHaveBeenCalled();
    });
  });

  it('should format post timestamps correctly', () => {
    // Remove the global time mock and freeze time locally to a fixed date after the posts
    restoreTime();
    const RealDate = Date as unknown as typeof Date;
    const fixed = new Date('2024-01-03T00:00:00Z').getTime();
    // Override Date constructor and now
     
    (global as any).Date = class extends RealDate {
      constructor(value?: string | number | Date) {
        super(value ?? fixed);
      }
      static now() {
        return fixed;
      }
    } as any;

    const { getByText } = render(<PostsList {...defaultProps} />);
    
    // Should show relative time formatting for dates within a week
    // Post 1 (2024-01-02T12:00:00Z vs fixed 2024-01-03T00:00:00Z) => ~12 hours
    // Post 2 (2024-01-01T12:00:00Z vs fixed 2024-01-03T00:00:00Z) => ~36 hours => 1 day ago
    expect(getByText(/12\s+hours\s+ago/)).toBeTruthy();
    expect(getByText(/1\s+day\s+ago/)).toBeTruthy();
  });

  it('should apply dark theme styles', () => {
    const { getByTestId } = render(<PostsList {...defaultProps} />);
    
    const container = getByTestId('posts-list-container');
    expect(container).toHaveStyle({
      backgroundColor: '#0B0C1A',
    });
  });

  it('should highlight upvoted posts differently', () => {
    const postsWithUpvoted = [
      { ...mockPosts[0], isUpvoted: true },
      { ...mockPosts[1], isUpvoted: false },
    ];

    const { getByTestId } = render(
      <PostsList {...defaultProps} posts={postsWithUpvoted} />
    );
    
    const upvotedButton = getByTestId('upvote-button-post-1');
    
    // Check if the button style contains the upvoted background color
    const styles = Array.isArray(upvotedButton.props.style) ? upvotedButton.props.style : [upvotedButton.props.style];
    const hasUpvotedBackground = styles.some((style: any) => 
      style && style.backgroundColor && style.backgroundColor.includes('rgba(196, 255, 0')
    );
    expect(hasUpvotedBackground).toBe(true);
  });

  it('should show post creation date in readable format', () => {
    const recentPost = {
      ...mockPosts[0],
      created_at: new Date().toISOString(),
    };
    
    const { getByText } = render(
      <PostsList {...defaultProps} posts={[recentPost]} />
    );
    
    // Should show "Today" or relative time for recent posts
    expect(getByText(/Today|Just now|minutes ago|hours ago/)).toBeTruthy();
  });

  it('should have proper accessibility labels', () => {
    const { getByTestId } = render(<PostsList {...defaultProps} />);
    
    const upvoteButton = getByTestId('upvote-button-post-1');
    expect(upvoteButton.props.accessibilityLabel).toBe('Upvote post First Post, current count 10');
    expect(upvoteButton.props.accessibilityRole).toBe('button');
  });

  it('should disable upvote buttons when loading', () => {
    const { getByTestId } = render(<PostsList {...defaultProps} isLoading={true} />);
    
    const upvoteButton = getByTestId('upvote-button-post-1');
    expect(upvoteButton.props.accessibilityState.disabled).toBe(true);
  });

  it('should show load more indicator when hasMore is true', () => {
    const { getByTestId } = render(<PostsList {...defaultProps} hasMore={true} />);
    
    expect(getByTestId('load-more-indicator')).toBeTruthy();
  });

  it('should show end of list message when hasMore is false', () => {
    const { getByText, getByTestId } = render(<PostsList {...defaultProps} hasMore={false} />);
    
    expect(getByTestId('end-of-list')).toBeTruthy();
    expect(getByText('You\'ve reached the end!')).toBeTruthy();
  });

  it('should handle empty upvotes correctly', () => {
    const postWithZeroUpvotes = {
      ...mockPosts[0],
      upvotes: 0,
    };
    
    const { getByTestId } = render(
      <PostsList {...defaultProps} posts={[postWithZeroUpvotes]} />
    );
    
    const upvoteCount = getByTestId('upvote-count-post-1');
    expect(upvoteCount.props.children).toBe(0);
  });

  it('should truncate long post content', () => {
    const longContentPost = {
      ...mockPosts[0],
      content: 'A'.repeat(300), // Very long content
    };
    
    const { getByTestId } = render(
      <PostsList {...defaultProps} posts={[longContentPost]} />
    );
    
    const postContent = getByTestId('post-content-post-1');
    const contentText = postContent.props.children;
    
    // Content should be truncated with ellipsis
    expect(contentText.length).toBeLessThan(250);
    expect(contentText.endsWith('...')).toBe(true);
  });

  it('should show post title with proper styling', () => {
    const { getByTestId } = render(<PostsList {...defaultProps} />);
    
    const postTitle = getByTestId('post-title-post-1');
    expect(postTitle.props.style).toEqual(expect.objectContaining({
      color: '#F5F5F5', // Light text color
      fontWeight: '600',
    }));
  });
});