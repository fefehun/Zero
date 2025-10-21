import { describe, it, expect, beforeAll } from 'vitest';
import { encryptPassword, decryptPassword } from './encryption';

// Mock environment variable for testing
beforeAll(() => {
  process.env.AUTUMN_SECRET_KEY = 'test-secret-key-for-encryption-testing-12345';
});

describe('Password Encryption', () => {
  const testUserId = 'user-123';
  const testPassword = 'mySecurePassword123!@#';

  describe('encryptPassword', () => {
    it('should encrypt a password successfully', async () => {
      const encrypted = await encryptPassword(testPassword, testUserId);

      expect(encrypted).toBeDefined();
      expect(typeof encrypted).toBe('string');
      expect(encrypted.length).toBeGreaterThan(0);

      // Should be in format: iv:authTag:ciphertext
      const parts = encrypted.split(':');
      expect(parts.length).toBe(3);
    });

    it('should produce different ciphertext for each encryption (random IV)', async () => {
      const encrypted1 = await encryptPassword(testPassword, testUserId);
      const encrypted2 = await encryptPassword(testPassword, testUserId);

      expect(encrypted1).not.toBe(encrypted2);
    });

    it('should produce different ciphertext for different users (same password)', async () => {
      const user1Id = 'user-1';
      const user2Id = 'user-2';

      const encrypted1 = await encryptPassword(testPassword, user1Id);
      const encrypted2 = await encryptPassword(testPassword, user2Id);

      expect(encrypted1).not.toBe(encrypted2);
    });

    it('should throw error for empty password', async () => {
      await expect(encryptPassword('', testUserId)).rejects.toThrow('plainPassword cannot be empty');
    });

    it('should throw error for empty userId', async () => {
      await expect(encryptPassword(testPassword, '')).rejects.toThrow('userId is required for encryption');
    });

    it('should throw error when AUTUMN_SECRET_KEY is not set', async () => {
      const originalKey = process.env.AUTUMN_SECRET_KEY;
      delete process.env.AUTUMN_SECRET_KEY;

      await expect(encryptPassword(testPassword, testUserId)).rejects.toThrow(
        'AUTUMN_SECRET_KEY is not configured'
      );

      process.env.AUTUMN_SECRET_KEY = originalKey;
    });
  });

  describe('decryptPassword', () => {
    it('should decrypt a password successfully', async () => {
      const encrypted = await encryptPassword(testPassword, testUserId);
      const decrypted = await decryptPassword(encrypted, testUserId);

      expect(decrypted).toBe(testPassword);
    });

    it('should handle different password lengths', async () => {
      const passwords = [
        'short',
        'medium-length-password-123',
        'very-long-password-with-special-chars-!@#$%^&*()_+-=[]{}|;:,.<>?',
      ];

      for (const password of passwords) {
        const encrypted = await encryptPassword(password, testUserId);
        const decrypted = await decryptPassword(encrypted, testUserId);
        expect(decrypted).toBe(password);
      }
    });

    it('should handle special characters', async () => {
      const specialPassword = '!@#$%^&*()_+-=[]{}|;:,.<>?/~`';
      const encrypted = await encryptPassword(specialPassword, testUserId);
      const decrypted = await decryptPassword(encrypted, testUserId);

      expect(decrypted).toBe(specialPassword);
    });

    it('should handle unicode characters', async () => {
      const unicodePassword = 'пароль密码🔒🔑';
      const encrypted = await encryptPassword(unicodePassword, testUserId);
      const decrypted = await decryptPassword(encrypted, testUserId);

      expect(decrypted).toBe(unicodePassword);
    });

    it('should fail with wrong userId', async () => {
      const encrypted = await encryptPassword(testPassword, 'user-1');

      await expect(decryptPassword(encrypted, 'user-2')).rejects.toThrow(
        'Decryption failed'
      );
    });

    it('should throw error for invalid encrypted format', async () => {
      await expect(decryptPassword('invalid-format', testUserId)).rejects.toThrow(
        'Invalid encrypted password format'
      );
    });

    it('should throw error for empty encrypted password', async () => {
      await expect(decryptPassword('', testUserId)).rejects.toThrow(
        'encryptedPassword cannot be empty'
      );
    });

    it('should throw error for tampered ciphertext', async () => {
      const encrypted = await encryptPassword(testPassword, testUserId);
      const parts = encrypted.split(':');

      // Tamper with the ciphertext
      parts[2] = parts[2].slice(0, -1) + 'X';
      const tampered = parts.join(':');

      await expect(decryptPassword(tampered, testUserId)).rejects.toThrow(
        'Decryption failed'
      );
    });

    it('should throw error for tampered IV', async () => {
      const encrypted = await encryptPassword(testPassword, testUserId);
      const parts = encrypted.split(':');

      // Tamper with the IV
      parts[0] = parts[0].slice(0, -1) + 'X';
      const tampered = parts.join(':');

      await expect(decryptPassword(tampered, testUserId)).rejects.toThrow(
        'Decryption failed'
      );
    });

    it('should throw error for tampered auth tag', async () => {
      const encrypted = await encryptPassword(testPassword, testUserId);
      const parts = encrypted.split(':');

      // Tamper with the auth tag
      parts[1] = parts[1].slice(0, -1) + 'X';
      const tampered = parts.join(':');

      await expect(decryptPassword(tampered, testUserId)).rejects.toThrow(
        'Decryption failed'
      );
    });
  });

  describe('Encryption Roundtrip', () => {
    it('should successfully encrypt and decrypt the same password', async () => {
      const password = 'test-password-roundtrip-123';
      const userId = 'roundtrip-user';

      const encrypted = await encryptPassword(password, userId);
      const decrypted = await decryptPassword(encrypted, userId);

      expect(decrypted).toBe(password);
    });

    it('should work for multiple users independently', async () => {
      const password = 'shared-password';
      const user1 = 'user-1';
      const user2 = 'user-2';

      const encrypted1 = await encryptPassword(password, user1);
      const encrypted2 = await encryptPassword(password, user2);

      const decrypted1 = await decryptPassword(encrypted1, user1);
      const decrypted2 = await decryptPassword(encrypted2, user2);

      expect(decrypted1).toBe(password);
      expect(decrypted2).toBe(password);
      expect(encrypted1).not.toBe(encrypted2);
    });
  });

  describe('User Isolation', () => {
    it('should ensure different users get different ciphertext for same password', async () => {
      const sharedPassword = 'samePasswordForAll';
      const users = ['user-1', 'user-2', 'user-3'];

      const encryptedPasswords = await Promise.all(
        users.map(userId => encryptPassword(sharedPassword, userId))
      );

      // All encrypted values should be unique
      const uniqueEncrypted = new Set(encryptedPasswords);
      expect(uniqueEncrypted.size).toBe(users.length);

      // Each user should be able to decrypt their own password
      const decryptedPasswords = await Promise.all(
        users.map((userId, index) =>
          decryptPassword(encryptedPasswords[index], userId)
        )
      );

      decryptedPasswords.forEach(decrypted => {
        expect(decrypted).toBe(sharedPassword);
      });
    });

    it('should prevent cross-user decryption', async () => {
      const password = 'user-specific-password';
      const user1 = 'user-1';
      const user2 = 'user-2';

      const encrypted = await encryptPassword(password, user1);

      // User 2 should not be able to decrypt user 1's password
      await expect(decryptPassword(encrypted, user2)).rejects.toThrow();
    });
  });
});
