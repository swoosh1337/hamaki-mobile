import { isNetworkError as checkNetworkError, getUserFriendlyErrorMessage } from '@/utils/errorHandling';
import { supabase } from '@/utils/supabase';
import React, { createContext, useContext, useEffect, useState } from 'react';

// Types from our unified model
interface Post {
  id: string;
  type: 'video' | 'blog' | 'hiring' | 'announcement';
  title: string;
  excerpt: string;
  content: string;
  thumbnail: string;
  isPublished: boolean;
  publishedAt: string;
  isFeatured: boolean;
  featuredOrder: number;
  metadata: {
    videoId?: string;
    duration?: string;
    viewCount?: string;
    position?: string;
    company?: string;
    applicationUrl?: string;
    badge?: string;
    priority?: 'low' | 'medium' | 'high';
    tags?: string[];
    readTimeMinutes?: number;
  };
  createdAt: string;
  updatedAt: string;
}

interface ContentContextType {
  posts: Post[];
  featuredPosts: Post[];
  isLoading: boolean;
  error: string | null;
  hasNewContent: boolean;
  refreshContent: () => Promise<void>;
  isNetworkError: boolean;
}

const ContentContext = createContext<ContentContextType | undefined>(undefined);

export const useContent = () => {
  const context = useContext(ContentContext);
  if (context === undefined) {
    throw new Error('useContent must be used within a ContentProvider');
  }
  return context;
};

export const ContentProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [posts, setPosts] = useState<Post[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasNewContent, setHasNewContent] = useState(false);
  const [isNetworkError, setIsNetworkError] = useState(false);

  // Transform database rows to our Post interface
  const transformDatabasePost = (dbPost: any): Post => ({
    id: dbPost.id,
    type: dbPost.type,
    title: dbPost.title,
    excerpt: dbPost.excerpt,
    content: dbPost.content,
    thumbnail: dbPost.thumbnail,
    isPublished: dbPost.is_published,
    publishedAt: dbPost.published_at,
    isFeatured: dbPost.is_featured,
    featuredOrder: dbPost.featured_order,
    metadata: dbPost.metadata || {},
    createdAt: dbPost.created_at,
    updatedAt: dbPost.updated_at
  });

  // Fetch content from database
  const fetchContent = async () => {
    try {
      setError(null);
      setIsNetworkError(false);
      
      const { data, error: fetchError } = await supabase
        .from('content_posts')
        .select('*')
        .eq('is_published', true)
        .order('created_at', { ascending: false });

      if (fetchError) {
        console.error('Error fetching content:', fetchError);
        const isNetwork = checkNetworkError(fetchError);
        setIsNetworkError(isNetwork);
        setError(getUserFriendlyErrorMessage(fetchError));
        return;
      }

      const transformedPosts = data?.map(transformDatabasePost) || [];
      setPosts(transformedPosts);
      
    } catch (err) {
      console.error('Error in fetchContent:', err);
      const isNetwork = checkNetworkError(err);
      setIsNetworkError(isNetwork);
      setError(getUserFriendlyErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  };

  // Refresh content manually
  const refreshContent = async () => {
    setIsLoading(true);
    await fetchContent();
    // hasNewContent is now calculated automatically based on post age
  };

  // Get featured posts (sorted by featured_order)
  const featuredPosts = posts
    .filter(post => post.isFeatured)
    .sort((a, b) => a.featuredOrder - b.featuredOrder);

  // Check if any featured post is newer than 24 hours
  useEffect(() => {
    const checkNewContent = () => {
      const now = new Date();
      const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      const hasRecentFeaturedPost = featuredPosts.some(post => {
        const publishedDate = new Date(post.publishedAt);
        return publishedDate > twentyFourHoursAgo;
      });

      setHasNewContent(hasRecentFeaturedPost);
    };

    checkNewContent();

    // Check every minute to update the NEW label
    const interval = setInterval(checkNewContent, 60 * 1000);

    return () => clearInterval(interval);
  }, [featuredPosts]);

  // Set up realtime subscription
  useEffect(() => {
    // Initial fetch
    fetchContent();

    // Set up realtime subscription
    console.log('Setting up realtime subscription for content_posts');
    
    const subscription = supabase
      .channel('content_posts_channel')
      .on(
        'postgres_changes',
        {
          event: '*', // Listen to all changes (INSERT, UPDATE, DELETE)
          schema: 'public',
          table: 'content_posts'
          // Removed filter to catch DELETE events
        },
        (payload) => {
          console.log('Realtime update received:', payload);
          
          const { eventType, new: newRecord, old: oldRecord } = payload;
          
          if (eventType === 'INSERT' && newRecord) {
            // New post added - only add if published
            if (newRecord.is_published) {
              const newPost = transformDatabasePost(newRecord);
              setPosts(current => [newPost, ...current]);
              // hasNewContent is calculated automatically based on post age
            }

          } else if (eventType === 'UPDATE' && newRecord) {
            // Post updated
            const updatedPost = transformDatabasePost(newRecord);

            if (updatedPost.isPublished) {
              // Post is published - add or update it
              setPosts(current => {
                const existingIndex = current.findIndex(post => post.id === updatedPost.id);
                if (existingIndex >= 0) {
                  // Update existing post
                  return current.map(post =>
                    post.id === updatedPost.id ? updatedPost : post
                  );
                } else {
                  // Add new published post
                  return [updatedPost, ...current];
                }
              });
            } else {
              // Post was unpublished - remove it from the list
              setPosts(current =>
                current.filter(post => post.id !== updatedPost.id)
              );
            }
            // hasNewContent is calculated automatically based on post age

          } else if (eventType === 'DELETE' && oldRecord) {
            // Post deleted - always remove it regardless of publish status
            console.log('Deleting post with ID:', oldRecord.id);
            setPosts(current => {
              const filtered = current.filter(post => post.id !== oldRecord.id);
              console.log('Posts after deletion:', filtered.length, 'remaining');
              return filtered;
            });
            // hasNewContent is calculated automatically based on post age
          }
        }
      )
      .subscribe((status) => {
        console.log('Realtime subscription status:', status);
      });

    // Cleanup subscription on unmount
    return () => {
      console.log('Cleaning up realtime subscription');
      subscription.unsubscribe();
    };
  }, []);

  // Check for new content periodically (fallback)
  useEffect(() => {
    const interval = setInterval(() => {
      if (!isLoading) {
        fetchContent();
      }
    }, 5 * 60 * 1000); // Check every 5 minutes as fallback

    return () => clearInterval(interval);
  }, [isLoading]);

  const contextValue: ContentContextType = {
    posts,
    featuredPosts,
    isLoading,
    error,
    hasNewContent,
    refreshContent,
    isNetworkError
  };

  return (
    <ContentContext.Provider value={contextValue}>
      {children}
    </ContentContext.Provider>
  );
};