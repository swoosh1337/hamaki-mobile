import React, { useEffect, useRef } from 'react';
import { Animated, DimensionValue, StyleSheet, View, ViewStyle } from 'react-native';

interface SkeletonLoaderProps {
  width?: DimensionValue;
  height?: number;
  borderRadius?: number;
  style?: ViewStyle;
}

export const SkeletonLoader: React.FC<SkeletonLoaderProps> = ({
  width = '100%',
  height = 16,
  borderRadius = 4,
  style,
}) => {
  const animatedValue = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(animatedValue, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: false,
        }),
        Animated.timing(animatedValue, {
          toValue: 0,
          duration: 1000,
          useNativeDriver: false,
        }),
      ])
    );

    animation.start();

    return () => animation.stop();
  }, [animatedValue]);

  const backgroundColor = animatedValue.interpolate({
    inputRange: [0, 1],
    outputRange: ['rgba(245, 245, 245, 0.1)', 'rgba(245, 245, 245, 0.2)'],
  });

  return (
    <Animated.View
      style={[
        styles.skeleton,
        {
          width,
          height,
          borderRadius,
          backgroundColor,
        },
        style,
      ]}
    />
  );
};

// Video Skeleton for horizontal scrolling list
export const VideoSkeleton: React.FC = () => {
  return (
    <View style={styles.videoSkeleton}>
      <SkeletonLoader width="100%" height={120} borderRadius={8} />
      <View style={styles.videoSkeletonInfo}>
        <SkeletonLoader width="90%" height={14} borderRadius={4} style={{ marginBottom: 6 }} />
        <SkeletonLoader width="60%" height={12} borderRadius={4} />
      </View>
    </View>
  );
};

// Post Skeleton for horizontal post lists with thumbnail
export const PostSkeleton: React.FC = () => {
  return (
    <View style={styles.postSkeleton}>
      <SkeletonLoader width={60} height={60} borderRadius={8} style={{ marginRight: 12 }} />
      <View style={styles.postSkeletonContent}>
        <SkeletonLoader width="80%" height={18} borderRadius={4} style={{ marginBottom: 8 }} />
        <SkeletonLoader width="100%" height={14} borderRadius={4} style={{ marginBottom: 4 }} />
        <SkeletonLoader width="70%" height={14} borderRadius={4} style={{ marginBottom: 12 }} />
        <SkeletonLoader width={80} height={12} borderRadius={4} />
      </View>
    </View>
  );
};

// Profile Posts Skeleton
export const ProfilePostSkeleton: React.FC = () => {
  return (
    <View style={styles.profilePostSkeleton}>
      <SkeletonLoader width="85%" height={16} borderRadius={4} style={{ marginBottom: 8 }} />
      <View style={styles.profilePostSkeletonMeta}>
        <SkeletonLoader width={50} height={12} borderRadius={4} />
      </View>
    </View>
  );
};

// XP Stats Skeleton
export const XPStatsSkeleton: React.FC = () => {
  return (
    <View style={styles.xpStatsSkeleton}>
      <View style={styles.statItemSkeleton}>
        <SkeletonLoader width={80} height={16} borderRadius={4} />
        <SkeletonLoader width={60} height={16} borderRadius={4} />
      </View>
      <View style={styles.statItemSkeleton}>
        <SkeletonLoader width={60} height={16} borderRadius={4} />
        <SkeletonLoader width={80} height={16} borderRadius={4} />
      </View>
    </View>
  );
};

// Carousel Skeleton for mixed content carousel
export const CarouselSkeleton: React.FC = () => {
  return (
    <View style={styles.carouselSkeleton}>
      <SkeletonLoader width="100%" height={100} borderRadius={8} />
    </View>
  );
};

const styles = StyleSheet.create({
  skeleton: {
    backgroundColor: 'rgba(245, 245, 245, 0.1)',
  },

  // Video Skeleton Styles
  videoSkeleton: {
    width: 220,
    marginHorizontal: 4,
    backgroundColor: 'rgba(245, 245, 245, 0.05)',
    borderRadius: 12,
    overflow: 'hidden',
  },
  videoSkeletonInfo: {
    padding: 10,
  },

  // Post Skeleton Styles
  postSkeleton: {
    flexDirection: 'row',
    backgroundColor: 'rgba(245, 245, 245, 0.05)',
    borderRadius: 12,
    padding: 14,
    marginVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(196, 255, 0, 0.2)',
  },
  postSkeletonContent: {
    flex: 1,
  },
  postSkeletonMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },

  // Profile Post Skeleton Styles
  profilePostSkeleton: {
    backgroundColor: 'rgba(245, 245, 245, 0.05)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(196, 255, 0, 0.2)',
  },
  profilePostSkeletonMeta: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },

  // XP Stats Skeleton Styles
  xpStatsSkeleton: {
    marginBottom: 40,
  },
  statItemSkeleton: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(196, 255, 0, 0.2)',
  },

  // Carousel Skeleton Styles
  carouselSkeleton: {
    width: 180,
    marginHorizontal: 4,
    backgroundColor: 'rgba(245, 245, 245, 0.05)',
    borderRadius: 12,
    overflow: 'hidden',
    padding: 8,
  },
});