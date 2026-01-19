import { Colors } from '@/constants/Colors';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
  ActivityIndicator,
  Image,
  type ImageSourcePropType,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

interface AvatarPickerProps {
  selectedAvatar: string;
  onSelect: (avatarId: string) => void;
  onClose: () => void;
  isLoading?: boolean;
}

interface AvatarOption {
  id: string;
  title: string;
  source: ImageSourcePropType;
}

const avatarOptions: AvatarOption[] = [
  { id: 'avatar-1', title: 'Avatar 1', source: require('@/assets/avatars/1.webp') },
  { id: 'avatar-2', title: 'Avatar 2', source: require('@/assets/avatars/2.webp') },
  { id: 'avatar-3', title: 'Avatar 3', source: require('@/assets/avatars/3.webp') },
  { id: 'avatar-4', title: 'Avatar 4', source: require('@/assets/avatars/4.webp') },
  { id: 'avatar-5', title: 'Avatar 5', source: require('@/assets/avatars/5.webp') },
  { id: 'avatar-6', title: 'Avatar 6', source: require('@/assets/avatars/6.webp') },
  { id: 'avatar-7', title: 'Avatar 7', source: require('@/assets/avatars/7.webp') },
  { id: 'avatar-8', title: 'Avatar 8', source: require('@/assets/avatars/8.webp') },
  { id: 'avatar-9', title: 'Avatar 9', source: require('@/assets/avatars/9.webp') },
  { id: 'avatar-10', title: 'Avatar 10', source: require('@/assets/avatars/Layer_2.webp') },
  { id: 'avatar-11', title: 'Avatar 11', source: require('@/assets/avatars/Layer_3.webp') },
  { id: 'avatar-12', title: 'Avatar 12', source: require('@/assets/avatars/Layer_4.webp') },
  { id: 'avatar-13', title: 'Avatar 13', source: require('@/assets/avatars/Layer_5.webp') },
  { id: 'avatar-14', title: 'Avatar 14', source: require('@/assets/avatars/Layer_6.webp') },
  { id: 'avatar-15', title: 'Avatar 15', source: require('@/assets/avatars/Layer_7.webp') },
  { id: 'avatar-16', title: 'Avatar 16', source: require('@/assets/avatars/Layer_8.webp') },
  { id: 'avatar-17', title: 'Avatar 17', source: require('@/assets/avatars/Layer_9.webp') },
  { id: 'avatar-18', title: 'Avatar 18', source: require('@/assets/avatars/Layer_10.webp') },
];

export const AvatarPicker: React.FC<AvatarPickerProps> = ({
  selectedAvatar,
  onSelect,
  onClose,
  isLoading = false,
}) => {
  return (
    <Modal
      transparent
      visible
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <Pressable style={styles.container} onPress={(e) => e.stopPropagation()}>
          <View style={styles.header}>
            <Text style={styles.title}>აირჩიე შენი ავატარი</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={24} color={Colors.dark.text} style={{ opacity: 0.6 }} />
            </TouchableOpacity>
          </View>

          {isLoading ? (
            <View style={styles.loadingContainer} testID="avatar-picker-loading">
              <ActivityIndicator size="large" color={Colors.dark.tint} />
              <Text style={styles.loadingText}>Updating avatar...</Text>
            </View>
          ) : (
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
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  container: {
    backgroundColor: Colors.dark.background,
    borderRadius: 24,
    padding: 20,
    width: '100%',
    maxHeight: '80%',
    borderWidth: 1,
    borderColor: 'rgba(196, 255, 0, 0.2)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 10,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    paddingHorizontal: 4,
  },
  scrollView: {
    width: '100%',
  },
  scrollContent: {
    paddingBottom: 10,
  },
  title: {
    color: Colors.dark.text,
    fontSize: 20,
    fontWeight: 'bold',
    fontFamily: 'SpaceMono',
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
    borderRadius: 16,
    borderWidth: 2,
    borderColor: 'transparent',
    backgroundColor: 'rgba(245, 245, 245, 0.03)',
    width: '30%',
  },
  selectedAvatarOption: {
    borderColor: Colors.dark.tint,
    backgroundColor: 'rgba(196, 255, 0, 0.08)',
  },
  disabledAvatarOption: {
    opacity: 0.6,
  },
  avatarIconContainer: {
    position: 'relative',
    marginBottom: 6,
  },
  avatarImage: {
    width: 60,
    height: 60,
    borderRadius: 30,
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
    fontFamily: 'SpaceMono',
    fontWeight: '500',
    textAlign: 'center',
    opacity: 0.7,
  },
  selectedAvatarTitle: {
    color: Colors.dark.tint,
    fontWeight: 'bold',
    opacity: 1,
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
    fontFamily: 'SpaceMono',
  },
});