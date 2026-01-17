/**
 * Content-related type definitions
 *
 * These types are for content posts (videos, blogs, hiring, announcements)
 * displayed on the home screen. Not to be confused with community posts (types/post.ts).
 */

/**
 * Content post type enum
 */
export type ContentPostType = 'video' | 'blog' | 'hiring' | 'announcement';

/**
 * Content post metadata
 */
export interface ContentPostMetadata {
  videoId?: string;
  channelKey?: string;
  channelName?: string;
  duration?: string;
  viewCount?: string;
  position?: string;
  company?: string;
  applicationUrl?: string;
  badge?: string;
  priority?: 'low' | 'medium' | 'high';
  tags?: string[];
  readTimeMinutes?: number;
}

/**
 * Content post from the database (videos, blogs, hiring, announcements)
 */
export interface ContentPost {
  id: string;
  type: ContentPostType;
  title: string;
  excerpt: string;
  content: string;
  thumbnail: string;
  isPublished: boolean;
  publishedAt: string;
  isFeatured: boolean;
  featuredOrder: number;
  metadata: ContentPostMetadata;
  createdAt: string;
  updatedAt: string;
}
