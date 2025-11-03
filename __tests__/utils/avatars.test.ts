import { getAvatarSource, getAvailableAvatarIds, isValidAvatarId } from '../../utils/avatars';

describe('Avatar Utilities', () => {
  describe('getAvatarSource', () => {
    it('should return local source for valid avatar ID', () => {
      const source = getAvatarSource('avatar-1');
      expect(source).toBeDefined();
      expect(typeof source).toBe('object'); // require() returns an object in React Native
    });

    it('should return local source for all valid avatar IDs (1-18)', () => {
      for (let i = 1; i <= 18; i++) {
        const source = getAvatarSource(`avatar-${i}`);
        expect(source).toBeDefined();
      }
    });

    it('should return URI object for HTTP URL', () => {
      const url = 'https://example.com/avatar.png';
      const source = getAvatarSource(url);
      expect(source).toEqual({ uri: url });
    });

    it('should return URI object for HTTPS URL', () => {
      const url = 'https://example.com/avatar.jpg';
      const source = getAvatarSource(url);
      expect(source).toEqual({ uri: url });
    });

    it('should return default avatar for null', () => {
      const source = getAvatarSource(null);
      expect(source).toBeDefined();
      expect(typeof source).toBe('object');
    });

    it('should return default avatar for undefined', () => {
      const source = getAvatarSource(undefined);
      expect(source).toBeDefined();
      expect(typeof source).toBe('object');
    });

    it('should return default avatar for empty string', () => {
      const source = getAvatarSource('');
      expect(source).toBeDefined();
      expect(typeof source).toBe('object');
    });

    it('should return default avatar for invalid ID', () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
      const source = getAvatarSource('invalid-avatar-id');
      expect(source).toBeDefined();
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Unknown avatar ID')
      );
      consoleWarnSpy.mockRestore();
    });

    it('should handle avatar-19 (non-existent) gracefully', () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
      const source = getAvatarSource('avatar-19');
      expect(source).toBeDefined();
      expect(consoleWarnSpy).toHaveBeenCalled();
      consoleWarnSpy.mockRestore();
    });
  });

  describe('getAvailableAvatarIds', () => {
    it('should return an array of avatar IDs', () => {
      const ids = getAvailableAvatarIds();
      expect(Array.isArray(ids)).toBe(true);
      expect(ids.length).toBeGreaterThan(0);
    });

    it('should return exactly 18 avatar IDs', () => {
      const ids = getAvailableAvatarIds();
      expect(ids.length).toBe(18);
    });

    it('should include all avatar IDs from avatar-1 to avatar-18', () => {
      const ids = getAvailableAvatarIds();
      for (let i = 1; i <= 18; i++) {
        expect(ids).toContain(`avatar-${i}`);
      }
    });

    it('should not return duplicate IDs', () => {
      const ids = getAvailableAvatarIds();
      const uniqueIds = [...new Set(ids)];
      expect(ids.length).toBe(uniqueIds.length);
    });
  });

  describe('isValidAvatarId', () => {
    it('should return true for valid avatar IDs (1-18)', () => {
      for (let i = 1; i <= 18; i++) {
        expect(isValidAvatarId(`avatar-${i}`)).toBe(true);
      }
    });

    it('should return false for invalid avatar ID', () => {
      expect(isValidAvatarId('avatar-19')).toBe(false);
      expect(isValidAvatarId('invalid-id')).toBe(false);
      expect(isValidAvatarId('avatar-0')).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(isValidAvatarId('')).toBe(false);
    });

    it('should return false for URL', () => {
      expect(isValidAvatarId('https://example.com/avatar.png')).toBe(false);
    });

    it('should be case-sensitive', () => {
      expect(isValidAvatarId('Avatar-1')).toBe(false);
      expect(isValidAvatarId('AVATAR-1')).toBe(false);
    });
  });

  describe('Edge Cases', () => {
    it('should handle special characters in avatar ID', () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
      const source = getAvatarSource('avatar-1!@#');
      expect(source).toBeDefined();
      expect(consoleWarnSpy).toHaveBeenCalled();
      consoleWarnSpy.mockRestore();
    });

    it('should handle numeric input', () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
      // @ts-ignore - testing runtime behavior
      const source = getAvatarSource(1);
      expect(source).toBeDefined();
      consoleWarnSpy.mockRestore();
    });

    it('should handle very long strings', () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
      const longString = 'a'.repeat(1000);
      const source = getAvatarSource(longString);
      expect(source).toBeDefined();
      consoleWarnSpy.mockRestore();
    });

    it('should handle URL with query parameters', () => {
      const url = 'https://example.com/avatar.png?size=large&format=webp';
      const source = getAvatarSource(url);
      expect(source).toEqual({ uri: url });
    });

    it('should handle malformed URL', () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
      const malformedUrl = 'htp://example.com/avatar.png';
      const source = getAvatarSource(malformedUrl);
      expect(source).toBeDefined();
      expect(consoleWarnSpy).toHaveBeenCalled();
      consoleWarnSpy.mockRestore();
    });
  });

  describe('Integration Scenarios', () => {
    it('should handle user profile with no avatar (null)', () => {
      const userProfile = { avatar_url: null };
      const source = getAvatarSource(userProfile.avatar_url);
      expect(source).toBeDefined();
    });

    it('should handle user profile with avatar ID', () => {
      const userProfile = { avatar_url: 'avatar-5' };
      const source = getAvatarSource(userProfile.avatar_url);
      expect(source).toBeDefined();
      expect(typeof source).toBe('object');
    });

    it('should handle user profile with legacy URL', () => {
      const userProfile = { avatar_url: 'https://old-server.com/avatar.png' };
      const source = getAvatarSource(userProfile.avatar_url);
      expect(source).toEqual({ uri: userProfile.avatar_url });
    });

    it('should handle avatar selection flow', () => {
      // User selects avatar-10
      const selectedId = 'avatar-10';
      expect(isValidAvatarId(selectedId)).toBe(true);

      // Get source for rendering
      const source = getAvatarSource(selectedId);
      expect(source).toBeDefined();
    });

    it('should handle avatar switching from one to another', () => {
      // Initial avatar
      const initialSource = getAvatarSource('avatar-1');
      expect(initialSource).toBeDefined();

      // Switch to different avatar
      const newSource = getAvatarSource('avatar-18');
      expect(newSource).toBeDefined();

      // Sources should be different
      expect(initialSource).not.toEqual(newSource);
    });
  });

  describe('Performance', () => {
    it('should handle rapid avatar lookups without errors', () => {
      for (let i = 0; i < 100; i++) {
        const avatarId = `avatar-${(i % 18) + 1}`;
        const source = getAvatarSource(avatarId);
        expect(source).toBeDefined();
      }
    });

    it('should return consistent results for same input', () => {
      const source1 = getAvatarSource('avatar-5');
      const source2 = getAvatarSource('avatar-5');
      expect(source1).toEqual(source2);
    });
  });
});
