import { Colors } from '@/constants/Colors';
import React, { useState } from 'react';
import {
    KeyboardAvoidingView,
    Modal,
    Platform,
    SafeAreaView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';

interface SimplePostModalProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (title: string, content: string) => Promise<void>;
  isSubmitting: boolean;
}

export const SimplePostModal: React.FC<SimplePostModalProps> = ({
  visible,
  onClose,
  onSubmit,
  isSubmitting,
}) => {
  console.log('📝 SimplePostModal render', { visible, isSubmitting });
  
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');

  const handleSubmit = async () => {
    console.log('📝 Submit pressed', { title, content });
    
    if (!title.trim() || !content.trim()) {
      console.log('❌ Validation failed');
      return;
    }

    try {
      console.log('📝 Calling onSubmit...');
      await onSubmit(title, content);
      console.log('✅ onSubmit completed');
      
      // Reset and close
      setTitle('');
      setContent('');
      onClose();
    } catch (error) {
      console.error('❌ Error in handleSubmit:', error);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
            <TouchableOpacity onPress={onClose} disabled={isSubmitting}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            
            <Text style={styles.headerTitle}>New Idea</Text>
            
            <TouchableOpacity 
              onPress={handleSubmit}
              disabled={isSubmitting || !title.trim() || !content.trim()}
            >
              <Text style={[
                styles.submitText,
                (isSubmitting || !title.trim() || !content.trim()) && styles.submitTextDisabled
              ]}>
                {isSubmitting ? 'Submitting...' : 'Submit'}
              </Text>
            </TouchableOpacity>
        </View>

        {/* Content */}
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.content}
        >
            <Text style={styles.label}>Title *</Text>
            <TextInput
              style={styles.titleInput}
              placeholder="What's your video idea?"
              placeholderTextColor={Colors.dark.tabIconDefault}
              value={title}
              onChangeText={setTitle}
              maxLength={100}
              editable={!isSubmitting}
            />
            
            <Text style={styles.label}>Description *</Text>
            <TextInput
              style={styles.contentInput}
              placeholder="Describe your idea..."
              placeholderTextColor={Colors.dark.tabIconDefault}
              value={content}
              onChangeText={setContent}
              maxLength={1000}
              multiline
              numberOfLines={6}
              textAlignVertical="top"
              editable={!isSubmitting}
            />
          </View>
        </KeyboardAvoidingView>
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
  headerTitle: {
    fontSize: 18,
    fontFamily: 'SpaceMono',
    color: Colors.dark.tint,
    fontWeight: 'bold',
  },
  cancelText: {
    color: Colors.dark.text,
    fontSize: 16,
    minWidth: 60,
  },
  submitText: {
    color: Colors.dark.tint,
    fontSize: 16,
    fontWeight: '600',
    minWidth: 60,
    textAlign: 'right',
  },
  submitTextDisabled: {
    opacity: 0.5,
  },
  content: {
    flex: 1,
    padding: 20,
  },
  label: {
    color: Colors.dark.text,
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
    marginTop: 12,
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
});
