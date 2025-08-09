import React from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';

interface AvatarPickerProps {
  selectedAvatar: string;
  onSelect: (avatarId: string) => void;
  isLoading?: boolean;
}

interface AvatarOption {
  id: string;
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
}

const avatarOptions: AvatarOption[] = [
  { id: 'avatar-1', title: 'Avatar 1', icon: 'person-circle' },
  { id: 'avatar-2', title: 'Avatar 2', icon: 'happy' },
  { id: 'avatar-3', title: 'Avatar 3', icon: 'star' },
];

export const AvatarPicker: React.FC<AvatarPickerProps> = ({
  selectedAvatar,
  onSelect,
  isLoading = false,
}) => {
  const handleAvatarPress = (avatarId: string) => {
    if (isLoading || avatarId === selectedAvatar) {
      return;
    }
    onSelect(avatarId);
  };

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
          const isSelected = avatar.id === selectedAvatar;
          
          return (
            <TouchableOpacity
              key={avatar.id}
              style={[
                styles.avatarOption,
                isSelected && styles.selectedAvatarOption,
              ]}
              onPress={() => handleAvatarPress(avatar.id)}
              activeOpacity={0.8}
              testID={`avatar-option-${avatar.id}`}
              accessibilityLabel={`Select ${avatar.title}`}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
            >
              <View style={styles.avatarIconContainer}>
                <Ionicons
                  name={avatar.icon}
                  size={48}
                  color={isSelected ? Colors.dark.tint : Colors.dark.icon}
                />
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
  avatarIconContainer: {
    position: 'relative',
    marginBottom: 8,
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