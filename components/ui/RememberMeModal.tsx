import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Switch,
  Pressable,
} from 'react-native';
import { Colors } from '@/constants/Colors';
import { Ionicons } from '@expo/vector-icons';

interface RememberMeModalProps {
  visible: boolean;
  onContinue: (rememberMe: boolean) => void;
  userName?: string;
}

export const RememberMeModal: React.FC<RememberMeModalProps> = ({
  visible,
  onContinue,
  userName,
}) => {
  const [rememberMe, setRememberMe] = useState(true);

  const handleContinue = () => {
    onContinue(rememberMe);
  };

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      statusBarTranslucent
    >
      <Pressable style={styles.overlay} onPress={() => {}} activeOpacity={1}>
        <View style={styles.modalContainer}>
          <View style={styles.modal}>
            {/* Icon */}
            <View style={styles.iconContainer}>
              <Ionicons 
                name="shield-checkmark" 
                size={48} 
                color={Colors.dark.tint} 
              />
            </View>

            {/* Title */}
            <Text style={styles.title}>Stay Signed In?</Text>
            
            {/* Subtitle */}
            <Text style={styles.subtitle}>
              {userName ? `Welcome, ${userName}!` : 'Welcome to HamaKi!'}
            </Text>
            
            {/* Description */}
            <Text style={styles.description}>
              Would you like to stay signed in for future visits? You can change this anytime in settings.
            </Text>

            {/* Remember Me Toggle */}
            <View style={styles.toggleContainer}>
              <View style={styles.toggleRow}>
                <View style={styles.toggleTextContainer}>
                  <Text style={styles.toggleTitle}>Keep me signed in</Text>
                  <Text style={styles.toggleDescription}>
                    {rememberMe 
                      ? 'You\'ll stay signed in for 30 days' 
                      : 'Sign in each time you open the app'
                    }
                  </Text>
                </View>
                <Switch
                  value={rememberMe}
                  onValueChange={setRememberMe}
                  trackColor={{ 
                    false: '#333', 
                    true: Colors.dark.tint + '40' // 40% opacity
                  }}
                  thumbColor={rememberMe ? Colors.dark.tint : '#666'}
                  ios_backgroundColor="#333"
                />
              </View>
            </View>

            {/* Continue Button */}
            <TouchableOpacity
              style={styles.continueButton}
              onPress={handleContinue}
              activeOpacity={0.8}
            >
              <Text style={styles.continueButtonText}>Continue</Text>
              <Ionicons 
                name="arrow-forward" 
                size={20} 
                color="#0B0C1A" 
                style={styles.arrowIcon}
              />
            </TouchableOpacity>
          </View>
        </View>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContainer: {
    width: '100%',
    maxWidth: 400,
  },
  modal: {
    backgroundColor: '#1A1B2E', // Slightly lighter than main background
    borderRadius: 24,
    padding: 32,
    alignItems: 'center',
    shadowColor: Colors.dark.tint,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 16,
    borderWidth: 1,
    borderColor: Colors.dark.tint + '20', // 20% opacity border
  },
  iconContainer: {
    marginBottom: 20,
    padding: 12,
    backgroundColor: Colors.dark.tint + '20',
    borderRadius: 50,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: Colors.dark.text,
    textAlign: 'center',
    marginBottom: 8,
    fontFamily: 'SpaceMono', // Using the app's font
  },
  subtitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.dark.tint,
    textAlign: 'center',
    marginBottom: 12,
  },
  description: {
    fontSize: 15,
    color: Colors.dark.text + 'CC', // 80% opacity
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 28,
  },
  toggleContainer: {
    width: '100%',
    marginBottom: 32,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#252640', // Even darker for contrast
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#333',
  },
  toggleTextContainer: {
    flex: 1,
    marginRight: 16,
  },
  toggleTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.dark.text,
    marginBottom: 4,
  },
  toggleDescription: {
    fontSize: 13,
    color: Colors.dark.text + 'AA', // 67% opacity
    lineHeight: 18,
  },
  continueButton: {
    backgroundColor: Colors.dark.tint,
    borderRadius: 50,
    paddingVertical: 18,
    paddingHorizontal: 32,
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.dark.tint,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
  continueButtonText: {
    color: '#0B0C1A',
    fontSize: 18,
    fontWeight: '700',
    marginRight: 8,
  },
  arrowIcon: {
    marginLeft: 4,
  },
});