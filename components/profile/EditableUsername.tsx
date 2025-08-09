import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';

interface EditableUsernameProps {
  currentUsername: string;
  onSave: (newUsername: string) => void;
  isLoading?: boolean;
}

export const EditableUsername: React.FC<EditableUsernameProps> = ({
  currentUsername,
  onSave,
  isLoading = false,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [inputValue, setInputValue] = useState(currentUsername);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isEditing) {
      setInputValue(currentUsername);
      setError(null);
    }
  }, [isEditing, currentUsername]);

  const validateUsername = (username: string): string | null => {
    const trimmed = username.trim();
    
    if (trimmed.length < 2 || trimmed.length > 30) {
      return 'Username must be between 2 and 30 characters';
    }
    
    if (!/^[a-zA-Z0-9\s]+$/.test(trimmed)) {
      return 'Username can only contain letters, numbers, and spaces';
    }
    
    if (trimmed === currentUsername.trim()) {
      return 'Please enter a different username';
    }
    
    return null;
  };

  const handleEdit = () => {
    if (!isLoading) {
      setIsEditing(true);
      setInputValue(currentUsername);
      setError(null);
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
    setInputValue(currentUsername);
    setError(null);
  };

  const handleSave = () => {
    const trimmedValue = inputValue.trim();
    const validationError = validateUsername(trimmedValue);
    
    if (validationError) {
      setError(validationError);
      return;
    }
    
    setError(null);
    onSave(trimmedValue);
  };

  const handleInputChange = (text: string) => {
    setInputValue(text);
    if (error) {
      setError(null);
    }
  };

  if (!isEditing) {
    return (
      <View style={styles.container} testID="username-container">
        <View style={styles.displayRow}>
          <Text style={styles.displayText} testID="username-display">
            {currentUsername}
          </Text>
          <TouchableOpacity
            style={styles.editButton}
            onPress={handleEdit}
            testID="edit-username-button"
            accessibilityLabel="Edit username"
            accessibilityRole="button"
            disabled={isLoading}
          >
            <Ionicons
              name="pencil"
              size={18}
              color={isLoading ? Colors.dark.tabIconDefault : Colors.dark.tint}
            />
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container} testID="username-container">
      <View style={styles.editContainer}>
        <TextInput
          style={[
            styles.input,
            error && styles.inputError,
            isLoading && styles.inputDisabled,
          ]}
          value={inputValue}
          onChangeText={handleInputChange}
          placeholder="Enter username"
          placeholderTextColor={Colors.dark.tabIconDefault}
          testID="username-input"
          editable={!isLoading}
          maxLength={30}
          autoFocus
        />
        
        <View style={styles.buttonRow}>
          <TouchableOpacity
            style={[styles.actionButton, styles.cancelButton]}
            onPress={handleCancel}
            testID="cancel-username-button"
            accessibilityLabel="Cancel editing"
            accessibilityRole="button"
            disabled={isLoading}
          >
            <Ionicons
              name="close"
              size={18}
              color={Colors.dark.text}
            />
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[
              styles.actionButton,
              styles.saveButton,
              isLoading && styles.buttonDisabled,
            ]}
            onPress={handleSave}
            testID="save-username-button"
            accessibilityLabel="Save username"
            accessibilityRole="button"
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator 
                size="small" 
                color={Colors.dark.background}
                testID="username-save-loading"
              />
            ) : (
              <Ionicons
                name="checkmark"
                size={18}
                color={Colors.dark.background}
              />
            )}
          </TouchableOpacity>
        </View>
      </View>
      
      {error && (
        <Text style={styles.errorText} testID="username-error">
          {error}
        </Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.dark.background,
    borderRadius: 12,
    padding: 16,
    marginVertical: 8,
  },
  displayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  displayText: {
    color: Colors.dark.text,
    fontSize: 18,
    fontWeight: '500',
    flex: 1,
  },
  editButton: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(196, 255, 0, 0.1)',
    marginLeft: 12,
  },
  editContainer: {
    gap: 12,
  },
  input: {
    backgroundColor: 'rgba(245, 245, 245, 0.1)',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: Colors.dark.text,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  inputError: {
    borderColor: '#FF6B6B',
  },
  inputDisabled: {
    opacity: 0.6,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },
  actionButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButton: {
    backgroundColor: 'rgba(245, 245, 245, 0.2)',
  },
  saveButton: {
    backgroundColor: Colors.dark.tint,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  errorText: {
    color: '#FF6B6B',
    fontSize: 14,
    marginTop: 8,
    fontWeight: '500',
  },
});