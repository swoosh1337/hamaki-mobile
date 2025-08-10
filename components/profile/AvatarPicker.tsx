import { Colors } from '@/constants/Colors';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
  ActivityIndicator,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

interface AvatarPickerProps {
  selectedAvatar: string;
  onSelect: (avatarId: string) => void;
  isLoading?: boolean;
}

interface AvatarOption {
  id: string;
  title: string;
  url: string;
}

const avatarOptions: AvatarOption[] = [
  {
    id: 'avatar-1',
    title: 'Avatar 1',
    url: 'https://hspaxdszcnrznqehblky.supabase.co/storage/v1/object/sign/avatars/avatar-1.png?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV8zMWE0YzgyOC1kNmZmLTRlZTAtYWQ2MC1hZjg1YTY1YzU2ZDEiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJhdmF0YXJzL2F2YXRhci0xLnBuZyIsImlhdCI6MTc1NDc4NDY4OSwiZXhwIjoxNzg2MzIwNjg5fQ.SKfVTG5KuGqpDnU3vCvzSUoBShVeCzpKhteFy_Zeh9I',
  },
  {
    id: 'avatar-2',
    title: 'Avatar 2',
    url: 'https://hspaxdszcnrznqehblky.supabase.co/storage/v1/object/sign/avatars/avatar-2.png?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV8zMWE0YzgyOC1kNmZmLTRlZTAtYWQ2MC1hZjg1YTY1YzU2ZDEiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJhdmF0YXJzL2F2YXRhci0yLnBuZyIsImlhdCI6MTc1NDc4NDY5NywiZXhwIjoxNzg2MzIwNjk3fQ.hwjcOi7o3-9XRZ0uYYYTYFlcK8IWt2r-CJyo-38j2C8',
  },
  {
    id: 'avatar-3',
    title: 'Avatar 3',
    url: 'https://hspaxdszcnrznqehblky.supabase.co/storage/v1/object/sign/avatars/avatar-3.png?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV8zMWE0YzgyOC1kNmZmLTRlZTAtYWQ2MC1hZjg1YTY1YzU2ZDEiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJhdmF0YXJzL2F2YXRhci0zLnBuZyIsImlhdCI6MTc1NDc4NDcwOCwiZXhwIjoxNzg2MzIwNzA4fQ.QRFOWSPKG-lxwYKJKPd4wi-fPcUIKCUDLYGjasuIjdU',
  },
];

export const AvatarPicker: React.FC<AvatarPickerProps> = ({
  selectedAvatar,
  onSelect,
  isLoading = false,
}) => {
    if (isLoading) {
    return (
      <View style={styles.container} testID="avatar-picker-container">
        <Text style={styles.title}>Choose Your Avatar</Text>
        <View style={styles.loadingContainer} testID="avatar-picker-loading">
          <ActivityIndicator size="large" color={Colors.dark.tint} />
          <Text style={styles.loadingText}>Updating avatar...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container} testID="avatar-picker-container">
      <Text style={styles.title}>Choose Your Avatar</Text>
      <View style={styles.avatarGrid}>
        {avatarOptions.map((avatar) => {
          const isSelected = avatar.url === selectedAvatar || avatar.id === selectedAvatar;
          const isDisabled = isSelected || isLoading;

          return (
            <TouchableOpacity
              key={avatar.id}
              style={[
                styles.avatarOption,
                isSelected && styles.selectedAvatarOption,
                isDisabled && styles.disabledAvatarOption,
              ]}
              onPress={() => onSelect(avatar.id)}
              activeOpacity={isDisabled ? 1 : 0.8}
              disabled={isDisabled}
              testID={`avatar-option-${avatar.id}`}
              accessibilityLabel={`Select ${avatar.title}`}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected, disabled: isDisabled }}
            >
              <View style={styles.avatarIconContainer}>
                <Image source={{ uri: avatar.url }} style={styles.avatarImage} />
                {isSelected && (
                  <View 
                    style={styles.selectedIndicator}
                    testID={`selected-indicator-${avatar.id}`}
                  >
                    <Ionicons
                      name="checkmark-circle"
                      size={20}
                      color={Colors.dark.tint}
                    />
                  </View>
                )}
              </View>
              <Text style={[
                styles.avatarTitle,
                isSelected && styles.selectedAvatarTitle,
              ]}>
                {avatar.title}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.dark.background,
    borderRadius: 16,
    padding: 20,
    marginVertical: 16,
  },
  title: {
    color: Colors.dark.text,
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 20,
  },
  avatarGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  avatarOption: {
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'transparent',
    backgroundColor: 'rgba(245, 245, 245, 0.05)',
    minWidth: 90,
  },
  selectedAvatarOption: {
    borderColor: Colors.dark.tint,
    backgroundColor: 'rgba(196, 255, 0, 0.1)',
    shadowColor: Colors.dark.tint,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  disabledAvatarOption: {
    opacity: 0.6,
  },
  avatarIconContainer: {
    position: 'relative',
    marginBottom: 8,
  },
  avatarImage: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(245,245,245,0.05)'
  },
  selectedIndicator: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: Colors.dark.background,
    borderRadius: 10,
  },
  avatarTitle: {
    color: Colors.dark.text,
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
  },
  selectedAvatarTitle: {
    color: Colors.dark.tint,
    fontWeight: '600',
  },
  loadingContainer: {
    alignItems: 'center',
    padding: 40,
  },
  loadingText: {
    color: Colors.dark.text,
    fontSize: 16,
    marginTop: 16,
    textAlign: 'center',
  },
});