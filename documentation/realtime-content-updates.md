# Real-time Content Updates

This document explains how the Hamaki mobile app receives instant updates when content is added, modified, or deleted through the admin panel.

## Overview

The mobile app uses Supabase's real-time subscriptions to automatically update content without requiring users to refresh or restart the app. When admins make changes in the web dashboard, all connected mobile apps receive the updates immediately.

## Implementation

### Database Configuration

```sql
-- Enable real-time subscriptions on content table
ALTER publication supabase_realtime ADD TABLE content_posts;
```

### Mobile App Integration

#### ContentContext Setup
```typescript
// contexts/ContentContext.tsx
const subscription = supabase
  .channel('content_posts_channel')
  .on('postgres_changes', {
    event: '*', // Listen to INSERT, UPDATE, DELETE
    schema: 'public',
    table: 'content_posts'
  }, handleRealtimeUpdate)
  .subscribe();
```

#### Event Handling
- **INSERT**: New posts appear instantly (if published)
- **UPDATE**: Posts update immediately, handles publish/unpublish
- **DELETE**: Posts disappear from app immediately
- **Featured toggle**: Carousel updates in real-time

### User Experience

#### Visual Indicators
- **"NEW" badge**: Appears when fresh content arrives
- **Instant updates**: No refresh button needed
- **Smooth animations**: Content appears/disappears gracefully

#### Fallback Mechanisms
- **Periodic refresh**: Every 5 minutes as backup
- **Error handling**: Graceful degradation if real-time fails
- **Connection monitoring**: Automatic reconnection

## How It Works

### Admin Panel → Mobile App Flow

1. **Admin creates content** → Content saved to database
2. **Supabase real-time** → Broadcasts change to all connected apps
3. **Mobile app receives event** → Updates local state immediately
4. **UI updates** → Content appears without user action

### Event Types

#### New Content Added
```typescript
// When admin publishes new post
{
  eventType: 'INSERT',
  new: {
    id: 'uuid',
    title: 'New Post',
    is_published: true,
    // ... other fields
  }
}
```

#### Content Updated
```typescript
// When admin modifies existing post
{
  eventType: 'UPDATE',
  new: { /* updated post data */ },
  old: { /* previous post data */ }
}
```

#### Content Deleted
```typescript
// When admin deletes post
{
  eventType: 'DELETE',
  old: {
    id: 'uuid-to-remove',
    // ... other fields
  }
}
```

## Benefits

### For Users
- ✅ **Always fresh content**: No stale information
- ✅ **No manual refresh**: Content updates automatically
- ✅ **Instant notifications**: "NEW" indicators for fresh content
- ✅ **Seamless experience**: Updates happen in background

### For Admins
- ✅ **Immediate feedback**: See changes live in mobile app
- ✅ **No deployment needed**: Content updates without app store
- ✅ **Real-time testing**: Instantly verify changes
- ✅ **User engagement**: Push content when users are active

### For Development
- ✅ **Simplified architecture**: No complex sync logic
- ✅ **Reduced API calls**: No polling needed
- ✅ **Better performance**: Event-driven updates
- ✅ **Error resilience**: Multiple fallback strategies

## Testing Real-time Updates

### Manual Testing
1. Open mobile app
2. Add content via admin panel
3. Verify content appears instantly in app
4. Update content properties
5. Confirm changes reflect immediately
6. Delete content
7. Validate removal from app

### What to Verify
- [ ] New posts appear in feed
- [ ] Featured posts update carousel
- [ ] Deleted posts disappear
- [ ] Published/unpublished status works
- [ ] "NEW" indicator appears
- [ ] No app restart required

## Connection Management

### Subscription Lifecycle
```typescript
useEffect(() => {
  // Setup subscription on component mount
  const subscription = setupRealtimeSubscription();
  
  // Cleanup on unmount
  return () => {
    subscription.unsubscribe();
  };
}, []);
```

### Error Handling
```typescript
.subscribe((status) => {
  if (status === 'SUBSCRIBED') {
    console.log('Real-time connected');
  } else if (status === 'CHANNEL_ERROR') {
    console.log('Real-time error, falling back to polling');
    startPolling();
  }
});
```

### Performance Considerations
- **Efficient filtering**: Only published content triggers UI updates
- **Minimal payload**: Only necessary data in events
- **Smart updates**: Only affected UI components re-render
- **Connection sharing**: Single subscription for entire app

## Future Enhancements

### Planned Improvements
- **Push notifications**: Alert users of featured content
- **Selective updates**: Subscribe only to relevant content
- **Offline sync**: Queue updates when offline
- **Analytics**: Track content engagement in real-time

This real-time system ensures users always see the latest content while providing admins with immediate feedback on their changes.