# Content Management System

This document outlines the unified content management system implemented for the Hamaki mobile app, including database restructuring, admin panel integration, and real-time updates.

## Overview

The Hamaki app now uses a unified content model where all admin-managed content (videos, blog posts, hiring announcements, and general announcements) are stored in a single database table and managed through a web-based admin panel.

## Architecture Changes

### Before (Legacy System)
- **Separate tables**: `admin_posts`, `carousel_items`
- **Mock data**: Hard-coded content in mobile app
- **Manual updates**: Content changes required app updates
- **Disconnected systems**: Carousel and posts were separate entities

### After (Unified System)
- **Single table**: `content_posts` for all admin content
- **Real-time updates**: Instant content synchronization
- **Admin panel**: Web interface for content management
- **Unified model**: Featured posts appear in both carousel and posts list

## Database Schema

### New `content_posts` Table

```sql
CREATE TABLE content_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type VARCHAR(50) NOT NULL CHECK (type IN ('video', 'blog', 'hiring', 'announcement')),
  title VARCHAR(200) NOT NULL,
  excerpt TEXT NOT NULL,
  content TEXT NOT NULL,
  thumbnail TEXT NOT NULL,
  
  -- Publication status
  is_published BOOLEAN DEFAULT false,
  published_at TIMESTAMP WITH TIME ZONE,
  
  -- Featured/Carousel functionality  
  is_featured BOOLEAN DEFAULT false,
  featured_order INTEGER DEFAULT 0,
  
  -- Type-specific metadata as JSON
  metadata JSONB DEFAULT '{}',
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Performance indexes
CREATE INDEX idx_content_posts_type ON content_posts(type);
CREATE INDEX idx_content_posts_published ON content_posts(is_published);
CREATE INDEX idx_content_posts_featured ON content_posts(is_featured);
CREATE INDEX idx_content_posts_featured_order ON content_posts(featured_order);
CREATE INDEX idx_content_posts_created_at ON content_posts(created_at);
```

### Content Types

#### 1. Video Posts (`type: 'video'`)
- **Purpose**: YouTube video integration
- **Behavior**: Opens in YouTube app when tapped
- **Metadata**: `{"videoId": "abc123", "duration": "10:45", "viewCount": "1.2M"}`

#### 2. Blog Posts (`type: 'blog'`)
- **Purpose**: Text-based articles and news
- **Behavior**: Expandable content in mobile app
- **Metadata**: `{"tags": ["news"], "readTimeMinutes": 5}`

#### 3. Hiring Posts (`type: 'hiring'`)
- **Purpose**: Job announcements and recruitment
- **Behavior**: Expandable with application details
- **Metadata**: `{"position": "Video Editor", "company": "HamaKi Studio", "applicationUrl": "mailto:jobs@hamaki.studio"}`

#### 4. Announcements (`type: 'announcement'`)
- **Purpose**: App updates and important notices
- **Behavior**: Expandable with priority badges
- **Metadata**: `{"badge": "HOT", "priority": "high"}`

## Mobile App Integration

### ContentContext Implementation

The mobile app uses a new `ContentContext` that replaces the old `VideoContext`:

```typescript
// contexts/ContentContext.tsx
interface ContentContextType {
  posts: Post[];           // All published posts
  featuredPosts: Post[];   // Posts marked as featured (for carousel)
  isLoading: boolean;
  error: string | null;
  hasNewContent: boolean;  // Indicates new content available
  refreshContent: () => Promise<void>;
}
```

### Real-time Updates

#### Supabase Realtime Configuration
```sql
-- Enable realtime on the content table
ALTER publication supabase_realtime ADD TABLE content_posts;
```

#### Realtime Event Handling
- **INSERT**: New posts appear instantly if published
- **UPDATE**: Posts update immediately, handles publish/unpublish
- **DELETE**: Posts disappear immediately from app

### Home Screen Changes

#### Carousel Section
- **Data Source**: Posts where `is_featured = true`
- **Sorting**: By `featured_order` ASC
- **Interaction**: 
  - Videos → Open YouTube app
  - Other posts → Scroll to post in list and expand

#### Posts List Section  
- **Data Source**: All published posts
- **Sorting**: By `created_at` DESC
- **Features**: Expandable content, type-specific metadata display

## Admin Panel Integration

### API Endpoints

The admin panel communicates with the mobile app through these API endpoints:

```
GET    /api/v1/posts             # List all posts (with filters)
POST   /api/v1/posts             # Create new post
PUT    /api/v1/posts/{id}        # Update post
DELETE /api/v1/posts/{id}        # Delete post
PATCH  /api/v1/posts/{id}/feature # Toggle featured status
PUT    /api/v1/posts/reorder     # Update carousel order

POST   /api/v1/upload            # Upload images/thumbnails
```

### Content Management Features

1. **Unified Interface**: Manage all content types from one dashboard
2. **Feature Toggle**: Mark any post as featured for carousel
3. **Type-Specific Fields**: Dynamic form fields based on content type
4. **Rich Text Editor**: Full content editing for expandable posts
5. **Image Upload**: Thumbnail management with validation
6. **Publishing Control**: Draft/published status management
7. **Carousel Ordering**: Drag-and-drop reordering for featured posts

## Migration Process

### Data Migration Steps

1. **Create new table**: `content_posts` with unified schema
2. **Migrate existing data**:
   - `admin_posts` → `content_posts` (type: 'blog')
   - `carousel_items` → `content_posts` (type: varies, is_featured: true)
3. **Update mobile app**: Replace mock data with real-time API calls
4. **Enable realtime**: Configure Supabase subscription
5. **Drop legacy tables**: Remove `admin_posts` and `carousel_items`

### Legacy Table Cleanup

```sql
-- After successful migration and testing
DROP TABLE admin_posts;
DROP TABLE carousel_items;
```

## User Experience Improvements

### Immediate Content Updates
- **No app refresh needed**: Content updates automatically
- **Live carousel changes**: Featured posts update instantly
- **Visual indicators**: "NEW" badge when fresh content arrives

### Enhanced Interactions
- **Smart post tapping**: Different behavior per content type
- **Expandable content**: Read full articles without navigation
- **Seamless navigation**: Carousel taps scroll to posts list

### Loading States
- **Skeleton loaders**: During initial content fetch
- **Error handling**: Graceful fallbacks for network issues
- **Offline resilience**: Content cached until next update

## Development Benefits

### Simplified Architecture
- **Single source of truth**: One table for all content
- **Reduced complexity**: No sync between carousel and posts
- **Easier maintenance**: One API, one data model

### Flexible Content Types
- **Extensible metadata**: JSONB supports any type-specific data
- **Easy additions**: New content types via CHECK constraint
- **Type safety**: TypeScript interfaces for all content types

### Real-time Capabilities
- **Instant updates**: No polling or manual refresh
- **Efficient**: Only changed content triggers updates
- **Scalable**: Supabase handles connection management

## Testing & Validation

### Real-time Testing
1. **Add content** in admin panel → Verify instant appearance in app
2. **Update content** → Verify changes reflect immediately
3. **Delete content** → Verify removal from app
4. **Toggle featured status** → Verify carousel updates
5. **Reorder featured posts** → Verify new order in carousel

### Content Type Testing
- **Videos**: Confirm YouTube app integration
- **Blog posts**: Test expandable content
- **Hiring posts**: Verify metadata display
- **Announcements**: Check badge display

## Future Considerations

### Potential Enhancements
- **Content scheduling**: Publish posts at specific times
- **Content analytics**: Track post performance
- **User interactions**: Comments and reactions
- **Push notifications**: Alert users of new featured content
- **Content categories**: Additional organization beyond types
- **Multilingual support**: Georgian and English content variants

### Scalability
- **Pagination**: For large content volumes
- **Caching**: CDN integration for thumbnails
- **Performance**: Database query optimization
- **Monitoring**: Real-time connection health