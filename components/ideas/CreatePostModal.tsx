import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import {
    Alert,
    ActivityIndicator,
    Keyboard,
    KeyboardAvoidingView,
    Modal,
    Platform,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';

import { Colors } from '@/constants/Colors';

interface CreatePostModalProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (title: string, content: string) => Promise<void>;
  isSubmitting: boolean;
}

export function CreatePostModal({ visible, onClose, onSubmit, isSubmitting }: CreatePostModalProps) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [titleError, setTitleError] = useState('');
  const [contentError, setContentError] = useState('');

  const validateTitle = (value: string): boolean => {
    if (!value.trim()) {
      setTitleError('სათაური აუცილებელია');
      return false;
    }
    if (value.length < 5) {
      setTitleError('სათაური უნდა შეიცავდეს მინიმუმ 5 სიმბოლოს');
      return false;
    }
    if (value.length > 100) {
      setTitleError('სათაური უნდა შეიცავდეს მაქსიმუმ 100 სიმბოლოს');
      return false;
    }
    setTitleError('');
    return true;
  };

  const validateContent = (value: string): boolean => {
    if (!value.trim()) {
      setContentError('აღწერა აუცილებელია');
      return false;
    }
    if (value.length < 10) {
      setContentError('აღწერა უნდა შეიცავდეს მინიმუმ 10 სიმბოლოს');
      return false;
    }
    if (value.length > 1000) {
      setContentError('აღწერა უნდა შეიცავდეს მაქსიმუმ 1000 სიმბოლოს');
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

  const resetForm = () => {
    setTitle('');
    setContent('');
    setTitleError('');
    setContentError('');
  };

  const handleSubmit = async () => {
    const isTitleValid = validateTitle(title);
    const isContentValid = validateContent(content);

    if (!isTitleValid || !isContentValid) {
      return;
    }

    try {
      await onSubmit(title, content);
      resetForm();
      onClose();
    } catch (error) {
      Alert.alert('შეცდომა', error instanceof Error ? error.message : 'იდეის გაგზავნა ვერ მოხერხდა. გთხოვთ სცადოთ თავიდან.');
    }
  };

  const handleClose = () => {
    if (!isSubmitting) {
      if (title.trim() || content.trim()) {
        Alert.alert(
          'ცვლილებების გაუქმება',
          'ნამდვილად გსურთ ცვლილებების გაუქმება?',
          [
            { text: 'არა', style: 'cancel' },
            {
              text: 'დიახ', style: 'destructive', onPress: () => {
                resetForm();
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

  if (!visible) {
    return null;
  }

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
          <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
            <Ionicons name="close" size={24} color={Colors.dark.text} style={{ opacity: 0.6 }} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>ახალი იდეა</Text>
          <View style={styles.headerPlaceholder} />
        </View>

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardAvoid}
        >
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
          >
            {/* Title Input */}
            <View style={styles.inputSection}>
              <View style={styles.labelGroup}>
                <View style={styles.statusDot} />
                <Text style={styles.label}>სათაური</Text>
              </View>
              <TextInput
                style={[styles.titleInput, titleError ? styles.inputError : null]}
                placeholder="რა არის შენი ვიდეოს იდეა?"
                placeholderTextColor="rgba(150, 150, 150, 0.4)"
                value={title}
                onChangeText={handleTitleChange}
                maxLength={100}
                editable={!isSubmitting}
                autoFocus
              />
              <View style={styles.inputFooter}>
                {titleError ? <Text style={styles.errorText}>{titleError}</Text> : <View />}
                <Text style={styles.charCount}>{title.length}/100</Text>
              </View>
            </View>

              {/* Content Input */}
              <View style={styles.inputSection}>
                <View style={styles.labelGroup}>
                  <View style={styles.statusDot} />
                  <Text style={styles.label}>აღწერა</Text>
                </View>
                <TextInput
                  style={[styles.contentInput, contentError ? styles.inputError : null]}
                  placeholder="აღწერე შენი იდეა დეტალურად. რას უნდა მოიცავდეს ვიდეო? რატომ იქნება საინტერესო?"
                  placeholderTextColor="rgba(150, 150, 150, 0.4)"
                  value={content}
                  onChangeText={handleContentChange}
                  maxLength={1000}
                  multiline
                  numberOfLines={8}
                  textAlignVertical="top"
                  editable={!isSubmitting}
                />
                <View style={styles.inputFooter}>
                  {contentError ? <Text style={styles.errorText}>{contentError}</Text> : <View />}
                  <Text style={styles.charCount}>{content.length}/1000</Text>
                </View>
              </View>

              {/* Info Box */}
              <View style={styles.infoBox}>
                <Ionicons name="information-circle" size={20} color={Colors.dark.tint} />
                <Text style={styles.infoText}>
                  შენი იდეა განიხილება და დადასტურების შემთხვევაში გამოჩნდება იდეების სიაში!
                </Text>
              </View>

              {/* Action Buttons */}
              <View style={styles.buttonContainer}>
                <TouchableOpacity
                  style={styles.cancelButton}
                  onPress={handleClose}
                  disabled={isSubmitting}
                >
                  <Text style={styles.cancelButtonText}>გაუქმება</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.submitButtonNew,
                    (isSubmitting || !title.trim() || !content.trim()) && styles.submitButtonDisabled
                  ]}
                  onPress={handleSubmit}
                  disabled={isSubmitting || !title.trim() || !content.trim()}
                >
                  {isSubmitting ? (
                    <View style={styles.submitButtonContent}>
                      <ActivityIndicator size="small" color={Colors.dark.background} />
                      <Text style={styles.submitButtonText}>იგზავნება...</Text>
                    </View>
                  ) : (
                    <Text style={styles.submitButtonText}>დადასტურება</Text>
                  )}
                </TouchableOpacity>
              </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

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
    borderBottomColor: 'rgba(196, 255, 0, 0.1)',
  },
  closeButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerPlaceholder: {
    width: 32,
  },
  headerTitle: {
    fontSize: 20,
    fontFamily: 'SpaceMono',
    color: Colors.dark.tint,
    fontWeight: 'bold',
  },
  keyboardAvoid: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: 24,
    paddingBottom: 40,
  },
  inputSection: {
    marginBottom: 24,
    paddingHorizontal: 20,
  },
  labelGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    gap: 10,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.dark.tint,
  },
  label: {
    color: Colors.dark.text,
    fontSize: 18,
    fontFamily: 'SpaceMono',
    fontWeight: 'bold',
  },
  titleInput: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 16,
    fontSize: 15,
    fontFamily: 'SpaceMono',
    color: Colors.dark.text,
    borderWidth: 1,
    borderColor: 'rgba(196, 255, 0, 0.1)',
  },
  contentInput: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 16,
    fontSize: 15,
    fontFamily: 'SpaceMono',
    color: Colors.dark.text,
    borderWidth: 1,
    borderColor: 'rgba(196, 255, 0, 0.1)',
    minHeight: 180,
  },
  inputFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    paddingHorizontal: 4,
  },
  inputError: {
    borderColor: 'rgba(255, 59, 48, 0.4)',
    backgroundColor: 'rgba(255, 59, 48, 0.02)',
  },
  errorText: {
    color: '#FF3B30',
    fontSize: 12,
    fontFamily: 'SpaceMono',
  },
  charCount: {
    color: Colors.dark.text,
    opacity: 0.4,
    fontSize: 11,
    fontFamily: 'SpaceMono',
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(196, 255, 0, 0.05)',
    padding: 16,
    borderRadius: 16,
    marginHorizontal: 20,
    marginBottom: 32,
    gap: 12,
    borderWidth: 1,
    borderColor: 'rgba(196, 255, 0, 0.1)',
  },
  infoText: {
    flex: 1,
    color: Colors.dark.text,
    fontSize: 13,
    fontFamily: 'SpaceMono',
    lineHeight: 18,
    opacity: 0.8,
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 20,
    marginTop: 'auto',
  },
  cancelButton: {
    flex: 1,
    backgroundColor: 'transparent',
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 59, 48, 0.3)',
  },
  cancelButtonText: {
    color: '#FF3B30',
    fontSize: 16,
    fontFamily: 'SpaceMono',
    fontWeight: 'bold',
  },
  submitButtonNew: {
    flex: 1,
    backgroundColor: Colors.dark.tint,
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
    shadowColor: Colors.dark.tint,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  submitButtonDisabled: {
    opacity: 0.4,
  },
  submitButtonText: {
    color: Colors.dark.background,
    fontSize: 16,
    fontFamily: 'SpaceMono',
    fontWeight: 'bold',
  },
  submitButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
});
