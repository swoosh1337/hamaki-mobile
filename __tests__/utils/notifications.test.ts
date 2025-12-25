/**
 * Notifications Utility Tests
 */

import { sendSubscriptionVerificationNotification } from '@/utils/notifications';
import * as Notifications from 'expo-notifications';

// Mock expo-notifications
jest.mock('expo-notifications', () => ({
  scheduleNotificationAsync: jest.fn(),
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  getExpoPushTokenAsync: jest.fn(),
  setNotificationChannelAsync: jest.fn(),
}));

describe('Notifications', () => {
  const mockScheduleNotification = Notifications.scheduleNotificationAsync as jest.MockedFunction<
    typeof Notifications.scheduleNotificationAsync
  >;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('sendSubscriptionVerificationNotification', () => {
    it('should send notification for successful subscription verification', async () => {
      mockScheduleNotification.mockResolvedValue('test-notification-id');

      await sendSubscriptionVerificationNotification(true, 'HamaKi');

      expect(mockScheduleNotification).toHaveBeenCalledWith({
        content: {
          title: '✅ გამოწერა დადასტურდა',
          body: 'HamaKi გამოწერა წარმატებით დადასტურდა. დამატებითი XP მოგემატად!',
          data: {
            type: 'subscription_verification',
            isSubscribed: true,
            channelName: 'HamaKi',
          },
          sound: 'default',
        },
        trigger: null,
      });
    });

    it('should send notification for failed subscription verification', async () => {
      mockScheduleNotification.mockResolvedValue('test-notification-id');

      await sendSubscriptionVerificationNotification(false, 'HamaKi');

      expect(mockScheduleNotification).toHaveBeenCalledWith({
        content: {
          title: '❌ გამოწერა ვერ მოიძებნა',
          body: 'HamaKi გამოწერა ვერ მოიძებნა. შეგიძლიათ ხელით შეამოწმოთ პარამეტრებში.',
          data: {
            type: 'subscription_verification',
            isSubscribed: false,
            channelName: 'HamaKi',
          },
          sound: 'default',
        },
        trigger: null,
      });
    });

    it('should use default channel name when not provided', async () => {
      mockScheduleNotification.mockResolvedValue('test-notification-id');

      await sendSubscriptionVerificationNotification(true);

      expect(mockScheduleNotification).toHaveBeenCalledWith({
        content: {
          title: '✅ გამოწერა დადასტურდა',
          body: 'YouTube გამოწერა წარმატებით დადასტურდა. დამატებითი XP მოგემატად!',
          data: {
            type: 'subscription_verification',
            isSubscribed: true,
            channelName: 'YouTube',
          },
          sound: 'default',
        },
        trigger: null,
      });
    });

    it('should handle notification scheduling errors gracefully', async () => {
      mockScheduleNotification.mockRejectedValue(new Error('Notification failed'));

      // Should not throw an error
      await expect(
        sendSubscriptionVerificationNotification(true, 'Test Channel')
      ).resolves.toBeUndefined();
    });

    it('should include correct notification type in data', async () => {
      mockScheduleNotification.mockResolvedValue('test-notification-id');

      await sendSubscriptionVerificationNotification(false, 'Test');

      const callArgs = mockScheduleNotification.mock.calls[0][0];
      expect(callArgs.content.data?.type).toBe('subscription_verification');
    });

    it('should send notification immediately (trigger null)', async () => {
      mockScheduleNotification.mockResolvedValue('test-notification-id');

      await sendSubscriptionVerificationNotification(true);

      const callArgs = mockScheduleNotification.mock.calls[0][0];
      expect(callArgs.trigger).toBeNull();
    });

    it('should use default sound', async () => {
      mockScheduleNotification.mockResolvedValue('test-notification-id');

      await sendSubscriptionVerificationNotification(true);

      const callArgs = mockScheduleNotification.mock.calls[0][0];
      expect(callArgs.content.sound).toBe('default');
    });
  });
});
