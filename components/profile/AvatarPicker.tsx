import { Colors } from '@/constants/Colors';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
  ActivityIndicator,
  Image,
  ScrollView,
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
  source: any; // Local require() source
}

const avatarOptions: AvatarOption[] = [
  { id: 'avatar-1', title: 'Avatar 1', source: require('@/assets/avatars/1.jpg') },
  { id: 'avatar-2', title: 'Avatar 2', source: require('@/assets/avatars/2.jpg') },
  { id: 'avatar-3', title: 'Avatar 3', source: require('@/assets/avatars/3.jpg') },
  { id: 'avatar-4', title: 'Avatar 4', source: require('@/assets/avatars/4.jpg') },
  { id: 'avatar-5', title: 'Avatar 5', source: require('@/assets/avatars/5.jpg') },
  { id: 'avatar-6', title: 'Avatar 6', source: require('@/assets/avatars/6.jpg') },
  { id: 'avatar-7', title: 'Avatar 7', source: require('@/assets/avatars/7.jpg') },
  { id: 'avatar-8', title: 'Avatar 8', source: require('@/assets/avatars/8.jpg') },
  { id: 'avatar-9', title: 'Avatar 9', source: require('@/assets/avatars/9.jpg') },
  { id: 'avatar-10', title: 'Avatar 10', source: require('@/assets/avatars/Layer_2.jpg') },
  { id: 'avatar-11', title: 'Avatar 11', source: require('@/assets/avatars/Layer_3.jpg') },
  { id: 'avatar-12', title: 'Avatar 12', source: require('@/assets/avatars/Layer_4.jpg') },
  { id: 'avatar-13', title: 'Avatar 13', source: require('@/assets/avatars/Layer_5.jpg') },
  { id: 'avatar-14', title: 'Avatar 14', source: require('@/assets/avatars/Layer_6.jpg') },
  { id: 'avatar-15', title: 'Avatar 15', source: require('@/assets/avatars/Layer_7.jpg') },
  { id: 'avatar-16', title: 'Avatar 16', source: require('@/assets/avatars/Layer_8.jpg') },
  { id: 'avatar-17', title: 'Avatar 17', source: require('@/assets/avatars/Layer_9.jpg') },
  { id: 'avatar-18', title: 'Avatar 18', source: require('@/assets/avatars/Layer_10.jpg') },
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
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.avatarGrid}>
          {avatarOptions.map((avatar) => {
            const isSelected = avatar.id === selectedAvatar;
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
                accessibilityLabel={`ავატარის არჩევა ${avatar.title}`}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected, disabled: isDisabled }}
              >
                <View style={styles.avatarIconContainer}>
                  <Image source={avatar.source} style={styles.avatarImage} />
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
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.dark.background,
    borderRadius: 16,
    padding: 20,
    marginVertical: 16,
    maxHeight: 500,
  },
  scrollView: {
    maxHeight: 400,
  },
  scrollContent: {
    paddingBottom: 10,
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
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
    gap: 12,
  },
  avatarOption: {
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'transparent',
    backgroundColor: 'rgba(245, 245, 245, 0.05)',
    width: '30%',
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
    marginBottom: 6,
  },
  avatarImage: {
    width: 56,
    height: 56,
    borderRadius: 28,
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
    fontSize: 11,
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