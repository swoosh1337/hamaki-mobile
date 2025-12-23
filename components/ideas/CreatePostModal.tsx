import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import {
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
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
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <SafeAreaView style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity
              style={styles.headerButton}
              onPress={handleClose}
              disabled={isSubmitting}
            >
              <Text style={styles.cancelText}>გაუქმება</Text>
            </TouchableOpacity>

            <Text style={styles.headerTitle}>ახალი იდეა</Text>

            <TouchableOpacity
              style={[styles.headerButton, styles.submitButton]}
              onPress={handleSubmit}
              disabled={isSubmitting || !title.trim() || !content.trim()}
            >
              {isSubmitting ? (
                <Text style={[styles.submitText, { opacity: 0.5 }]}>დასტურის დამუშავება...</Text>
              ) : (
                <Text style={[styles.submitText, (!title.trim() || !content.trim()) && { opacity: 0.4 }]}>დადასტურება</Text>
              )}
            </TouchableOpacity>
          </View>

          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.scrollView}
          >
            {/* Title Input */}
            <View style={styles.inputSection}>
              <Text style={styles.label}>სათაური *</Text>
              <TextInput
                style={[styles.titleInput, titleError ? styles.inputError : null]}
                placeholder="რა არის შენი ვიდეოს იდეა?"
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

            {/* Content Input */}
            <View style={styles.inputSection}>
              <Text style={styles.label}>აღწერა *</Text>
              <TextInput
                style={[styles.contentInput, contentError ? styles.inputError : null]}
                placeholder="აღწერე შენი იდეა დეტალურად. რას უნდა მოიცავდეს ვიდეო? რატომ იქნება საინტერესო?"
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
                შენი იდეა განიხილება და დადასტურების შემთხვევაში გამოჩნდება იდეების სიაში!
              </Text>
            </View>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </TouchableWithoutFeedback>
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
    borderBottomColor: 'rgba(196, 255, 0, 0.2)',
  },
  headerButton: {
    minWidth: 80,
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: 'SpaceMono',
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
    color: Colors.dark.text,
    fontSize: 16,
    fontWeight: '600',
  },
  scrollView: {
    flex: 1,
    paddingTop: 20,
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