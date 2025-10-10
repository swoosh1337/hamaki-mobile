import { Colors } from '@/constants/Colors';
import React from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface TestModalProps {
  visible: boolean;
  onClose: () => void;
}

export const TestModal: React.FC<TestModalProps> = ({ visible, onClose }) => {
  console.log('🧪 TestModal render', { visible });
  
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        <Text style={styles.title}>Test Modal</Text>
        <Text style={styles.text}>If you can see this and tap the button, the modal works!</Text>
        <TouchableOpacity style={styles.button} onPress={() => {
          console.log('🧪 Close button pressed');
          onClose();
        }}>
          <Text style={styles.buttonText}>Close</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.background,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  title: {
    fontSize: 24,
    color: Colors.dark.tint,
    marginBottom: 20,
    fontFamily: 'SpaceMono',
  },
  text: {
    fontSize: 16,
    color: Colors.dark.text,
    marginBottom: 40,
    textAlign: 'center',
  },
  button: {
    backgroundColor: Colors.dark.tint,
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 8,
  },
  buttonText: {
    color: Colors.dark.background,
    fontSize: 16,
    fontWeight: 'bold',
  },
});
