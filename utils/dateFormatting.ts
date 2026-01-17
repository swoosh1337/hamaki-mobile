/**
 * Date formatting utilities
 *
 * Provides human-readable date formatting for posts and content.
 */

/**
 * Format a date string to a human-readable relative time
 *
 * @param dateString - ISO date string to format
 * @returns Formatted string like "Just now", "5 minutes ago", "2 days ago", or "Jan 15, 2024"
 */
export function formatRelativeDate(dateString: string): string {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);
  const diffDays = diffMs / (1000 * 60 * 60 * 24);

  if (diffHours < 1) {
    const minutes = Math.max(1, Math.floor(diffMs / (1000 * 60)));
    return minutes <= 1 ? 'Just now' : `${minutes} minutes ago`;
  }

  if (diffHours < 24) {
    const hours = Math.floor(diffHours);
    return hours === 1 ? '1 hour ago' : `${hours} hours ago`;
  }

  if (diffDays < 7) {
    const days = Math.floor(diffDays);
    return `${days} day${days === 1 ? '' : 's'} ago`;
  }

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}
