/**
 * GoogleSignInButton Component
 * 
 * Styled button for Google OAuth authentication.
 * Uses HamakiEng for English text and HamakiGeo for Georgian text.
 */

import { Colors } from '@/constants/Colors';
import { AntDesign } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface GoogleSignInButtonProps {
  onPress: () => void;
}

export const GoogleSignInButton: React.FC<GoogleSignInButtonProps> = ({
  onPress,
}) => {
  return (
    <TouchableOpacity
      style={styles.button}
      onPress={onPress}
      activeOpacity={0.8}
      testID="google-sign-in-button"
    >
      <View style={styles.contentContainer}>
        <AntDesign name="google" size={24} color="#0B0C1A" style={styles.googleIcon} />
        <Text style={styles.buttonText}>
          <Text style={styles.englishText}>Google</Text>
          <Text style={styles.georgianText}>-ით გაგრძელება</Text>
        </Text>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    backgroundColor: Colors.dark.tint, // Neon green
    borderRadius: 50,
    paddingVertical: 16,
    paddingHorizontal: 24,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.dark.tint,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 8,
  },
  contentContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  googleIcon: {
    marginRight: 12,
  },
  buttonText: {
    color: '#0B0C1A', // Dark navy
    fontSize: 18,
    fontWeight: '600',
  },
  englishText: {
    fontFamily: 'HamakiEng',
    color: '#0B0C1A',
    fontSize: 18,
    fontWeight: '600',
  },
  georgianText: {
    fontFamily: 'HamakiGeo',
    color: '#0B0C1A',
    fontSize: 18,
    fontWeight: '600',
  },
});
