import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import {
  Alert,
  Modal,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { Colors } from '@/constants/Colors';
import { createLogger } from '@/utils/logger';

const log = createLogger('CreatePostModalBackup');

interface CreatePostModalProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (title: string, content: string, category?: string) => Promise<void>;
  isSubmitting: boolean;
}

const CATEGORIES = [
  { value: 'tutorial', label: 'Tutorial', icon: 'school-outline', color: '#4ECDC4' },
  { value: 'feature', label: 'Feature', icon: 'bulb-outline', color: '#45B7D1' },
  { value: 'content', label: 'Content', icon: 'videocam-outline', color: '#96CEB4' },
  { value: 'bug', label: 'Bug Report', icon: 'bug-outline', color: '#FF6B6B' },
];

export const CreatePostModal: React.FC<CreatePostModalProps> = ({
  visible,
  onClose,
  onSubmit,
  isSubmitting,
}) => {
  log.debug('Render', { visible, isSubmitting });

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [titleError, setTitleError] = useState('');
  const [contentError, setContentError] = useState('');

  const validateTitle = (value: string) => {
    if (!value.trim()) {
      setTitleError('Title is required');
      return false;
    }
    if (value.length < 5) {
      setTitleError('Title must be at least 5 characters');
      return false;
    }
    if (value.length > 100) {
      setTitleError('Title must be less than 100 characters');
      return false;
    }
    setTitleError('');
    return true;
  };

  const validateContent = (value: string) => {
    if (!value.trim()) {
      setContentError('Description is required');
      return false;
    }
    if (value.length < 10) {
      setContentError('Description must be at least 10 characters');
      return false;
    }
    if (value.length > 1000) {
      setContentError('Description must be less than 1000 characters');
      return false;
    }
    setContentError('');
    return true;
  };

  const handleTitleChange = (value: string) => {
    setTitle(value);
    if (titleError) {
      validateTitle(value);
    }
  };

  const handleContentChange = (value: string) => {
    setContent(value);
    if (contentError) {
      validateContent(value);
    }
  };

  const handleSubmit = async () => {
    log.info('handleSubmit called');
    const isTitleValid = validateTitle(title);
    const isContentValid = validateContent(content);

    if (!isTitleValid || !isContentValid) {
      log.warn('Validation failed', { isTitleValid, isContentValid });
      return;
    }

    log.debug('Validation passed, calling onSubmit...');

    try {
      await onSubmit(title, content, selectedCategory || undefined);
      log.info('onSubmit completed, resetting and closing modal');
      handleReset();
      onClose();
      log.debug('Modal closed');
    } catch (error) {
      log.error('Modal caught error', error);
      Alert.alert('Error', error instanceof Error ? error.message : 'Failed to submit your idea. Please try again.');
    }
  };

  const handleReset = () => {
    setTitle('');
    setContent('');
    setSelectedCategory('');
    setTitleError('');
    setContentError('');
  };

  const handleClose = () => {
    if (!isSubmitting) {
      if (title.trim() || content.trim()) {
        Alert.alert(
          'Discard Changes',
          'Are you sure you want to discard your changes?',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Discard', style: 'destructive', onPress: () => {
                handleReset();
                onClose();
              }
            },
          ]
        );
      } else {
        onClose();
      }
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <SafeAreaView style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.headerButton}
            onPress={handleClose}
            disabled={isSubmitting}
          >
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>

          <Text style={styles.headerTitle}>New Idea</Text>

          <TouchableOpacity
            style={[styles.headerButton, styles.submitButton]}
            onPress={handleSubmit}
            disabled={isSubmitting || !title.trim() || !content.trim()}
          >
            {isSubmitting ? (
              <Text style={[styles.submitText, { opacity: 0.5 }]}>Submitting...</Text>
            ) : (
              <Text style={styles.submitText}>Submit</Text>
            )}
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
          {/* Title Input */}
          <View style={styles.inputSection}>
            <Text style={styles.label}>Title *</Text>
            <TextInput
              style={[styles.titleInput, titleError ? styles.inputError : null]}
              placeholder="What's your video idea?"
              placeholderTextColor={Colors.dark.tabIconDefault}
              value={title}
              onChangeText={handleTitleChange}
              maxLength={100}
              editable={!isSubmitting}
              autoFocus
            />
            {titleError ? <Text style={styles.errorText}>{titleError}</Text> : null}
            <Text style={styles.charCount}>{title.length}/100</Text>
          </View>

          {/* Category Selection */}
          <View style={styles.inputSection}>
            <Text style={styles.label}>Category</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScroll}>
              {CATEGORIES.map((category) => (
                <TouchableOpacity
                  key={category.value}
                  style={[
                    styles.categoryChip,
                    selectedCategory === category.value && {
                      backgroundColor: category.color + '30',
                      borderColor: category.color,
                    },
                  ]}
                  onPress={() => setSelectedCategory(
                    selectedCategory === category.value ? '' : category.value
                  )}
                  disabled={isSubmitting}
                >
                  <Ionicons
                    name={category.icon as any}
                    size={16}
                    color={selectedCategory === category.value ? category.color : Colors.dark.tabIconDefault}
                  />
                  <Text style={[
                    styles.categoryText,
                    selectedCategory === category.value && { color: category.color },
                  ]}>
                    {category.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {/* Content Input */}
          <View style={styles.inputSection}>
            <Text style={styles.label}>Description *</Text>
            <TextInput
              style={[styles.contentInput, contentError ? styles.inputError : null]}
              placeholder="Describe your idea in detail. What should the video cover? Why would it be helpful?"
              placeholderTextColor={Colors.dark.tabIconDefault}
              value={content}
              onChangeText={handleContentChange}
              maxLength={1000}
              multiline
              numberOfLines={8}
              textAlignVertical="top"
              editable={!isSubmitting}
            />
            {contentError ? <Text style={styles.errorText}>{contentError}</Text> : null}
            <Text style={styles.charCount}>{content.length}/1000</Text>
          </View>

          {/* Info Box */}
          <View style={styles.infoBox}>
            <Ionicons name="information-circle-outline" size={20} color={Colors.dark.tint} />
            <Text style={styles.infoText}>
              Your idea will be reviewed before appearing in the Ideas feed. You&apos;ll be notified once it&apos;s approved!
            </Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(196, 255, 0, 0.2)',
  },
  headerButton: {
    minWidth: 80,
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: 'HamakiEng',
    color: Colors.dark.tint,
    fontWeight: 'bold',
  },
  cancelText: {
    color: Colors.dark.text,
    fontSize: 16,
  },
  submitButton: {
    alignItems: 'flex-end',
  },
  submitText: {
    color: Colors.dark.tint,
    fontSize: 16,
    fontWeight: '600',
  },
  scrollView: {
    flex: 1,
  },
  inputSection: {
    marginBottom: 24,
    paddingHorizontal: 20,
  },
  label: {
    color: Colors.dark.text,
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  titleInput: {
    backgroundColor: 'rgba(245, 245, 245, 0.1)',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: Colors.dark.text,
    borderWidth: 1,
    borderColor: 'rgba(196, 255, 0, 0.3)',
  },
  contentInput: {
    backgroundColor: 'rgba(245, 245, 245, 0.1)',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: Colors.dark.text,
    borderWidth: 1,
    borderColor: 'rgba(196, 255, 0, 0.3)',
    minHeight: 120,
  },
  inputError: {
    borderColor: '#FF6B6B',
  },
  errorText: {
    color: '#FF6B6B',
    fontSize: 14,
    marginTop: 4,
  },
  charCount: {
    color: Colors.dark.tabIconDefault,
    fontSize: 12,
    textAlign: 'right',
    marginTop: 4,
  },
  categoryScroll: {
    marginBottom: 8,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(245, 245, 245, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(196, 255, 0, 0.3)',
    marginRight: 8,
    gap: 6,
  },
  categoryText: {
    color: Colors.dark.text,
    fontSize: 14,
    fontWeight: '500',
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(196, 255, 0, 0.1)',
    padding: 16,
    borderRadius: 8,
    margin: 20,
    gap: 12,
  },
  infoText: {
    flex: 1,
    color: Colors.dark.text,
    fontSize: 14,
    lineHeight: 20,
    opacity: 0.9,
  },
});