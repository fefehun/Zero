/**
 * Manual test script for encryption utilities
 * Run with: npx tsx src/lib/encryption-manual-test.ts
 */

import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto';

// Set test environment variable
process.env.AUTUMN_SECRET_KEY = 'test-secret-key-for-encryption-testing-12345';

/**
 * Encryption configuration
 * Using AES-256-GCM for authenticated encryption
 */
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

/**
 * Derive a 256-bit encryption key from the secret and userId
 */
function deriveKey(userId: string): Buffer {
  const secretKey = process.env.AUTUMN_SECRET_KEY;
  if (!secretKey) {
    throw new Error('AUTUMN_SECRET_KEY is not configured');
  }

  if (!userId || userId.trim() === '') {
    throw new Error('userId is required for encryption');
  }

  const keyMaterial = `${secretKey}:${userId}`;
  return createHash('sha256').update(keyMaterial).digest();
}

/**
 * Encrypt a password
 */
async function encryptPassword(
  plainPassword: string,
  userId: string,
): Promise<string> {
  if (!plainPassword) {
    throw new Error('plainPassword cannot be empty');
  }

  const key = deriveKey(userId);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plainPassword, 'utf8', 'base64');
  encrypted += cipher.final('base64');

  const authTag = cipher.getAuthTag();

  const result = [
    iv.toString('base64'),
    authTag.toString('base64'),
    encrypted,
  ].join(':');

  return result;
}

/**
 * Decrypt a password
 */
async function decryptPassword(
  encryptedPassword: string,
  userId: string,
): Promise<string> {
  if (!encryptedPassword || encryptedPassword.trim() === '') {
    throw new Error('encryptedPassword cannot be empty');
  }

  const parts = encryptedPassword.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted password format');
  }

  const [ivBase64, authTagBase64, ciphertext] = parts;

  const iv = Buffer.from(ivBase64, 'base64');
  const authTag = Buffer.from(authTagBase64, 'base64');

  if (iv.length !== IV_LENGTH) {
    throw new Error('Invalid IV length');
  }
  if (authTag.length !== AUTH_TAG_LENGTH) {
    throw new Error('Invalid auth tag length');
  }

  const key = deriveKey(userId);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(ciphertext, 'base64', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

// Test Suite
async function runTests() {
  console.log('🔐 Running Encryption Tests\n');
  let passed = 0;
  let failed = 0;

  const test = async (name: string, fn: () => Promise<void>) => {
    try {
      await fn();
      console.log(`✅ ${name}`);
      passed++;
    } catch (error) {
      console.log(`❌ ${name}`);
      console.log(`   Error: ${error instanceof Error ? error.message : String(error)}`);
      failed++;
    }
  };

  // Test 1: Basic encryption and decryption
  await test('Roundtrip: Encrypt and decrypt returns original', async () => {
    const password = 'mySecurePassword123!@#';
    const userId = 'user-123';

    const encrypted = await encryptPassword(password, userId);
    const decrypted = await decryptPassword(encrypted, userId);

    if (decrypted !== password) {
      throw new Error(`Expected "${password}", got "${decrypted}"`);
    }
  });

  // Test 2: Different users produce different ciphertext
  await test('User isolation: Same password, different users = different ciphertext', async () => {
    const password = 'sharedPassword';
    const user1 = 'user-1';
    const user2 = 'user-2';

    const encrypted1 = await encryptPassword(password, user1);
    const encrypted2 = await encryptPassword(password, user2);

    if (encrypted1 === encrypted2) {
      throw new Error('Expected different ciphertext for different users');
    }
  });

  // Test 3: Each encryption produces unique ciphertext (random IV)
  await test('Random IV: Same password, same user = different ciphertext', async () => {
    const password = 'testPassword';
    const userId = 'user-123';

    const encrypted1 = await encryptPassword(password, userId);
    const encrypted2 = await encryptPassword(password, userId);

    if (encrypted1 === encrypted2) {
      throw new Error('Expected different ciphertext due to random IV');
    }
  });

  // Test 4: User 1 cannot decrypt user 2's password
  await test('Security: User 1 cannot decrypt user 2\'s password', async () => {
    const password = 'secretPassword';
    const user1 = 'user-1';
    const user2 = 'user-2';

    const encrypted = await encryptPassword(password, user1);

    try {
      await decryptPassword(encrypted, user2);
      throw new Error('Should have failed to decrypt with wrong userId');
    } catch (error) {
      // Expected to fail
      if (error instanceof Error && error.message.includes('Should have failed')) {
        throw error;
      }
    }
  });

  // Test 5: Handle special characters
  await test('Special characters: Encrypt/decrypt special chars', async () => {
    const password = '!@#$%^&*()_+-=[]{}|;:,.<>?/~`';
    const userId = 'user-special';

    const encrypted = await encryptPassword(password, userId);
    const decrypted = await decryptPassword(encrypted, userId);

    if (decrypted !== password) {
      throw new Error(`Special chars failed: expected "${password}", got "${decrypted}"`);
    }
  });

  // Test 6: Handle unicode characters
  await test('Unicode: Encrypt/decrypt unicode characters', async () => {
    const password = 'пароль密码🔒🔑';
    const userId = 'user-unicode';

    const encrypted = await encryptPassword(password, userId);
    const decrypted = await decryptPassword(encrypted, userId);

    if (decrypted !== password) {
      throw new Error(`Unicode failed: expected "${password}", got "${decrypted}"`);
    }
  });

  // Test 7: Empty password should fail
  await test('Edge case: Empty password throws error', async () => {
    try {
      await encryptPassword('', 'user-123');
      throw new Error('Should have thrown error for empty password');
    } catch (error) {
      if (error instanceof Error && !error.message.includes('plainPassword cannot be empty')) {
        throw error;
      }
    }
  });

  // Test 8: Empty userId should fail
  await test('Edge case: Empty userId throws error', async () => {
    try {
      await encryptPassword('password', '');
      throw new Error('Should have thrown error for empty userId');
    } catch (error) {
      if (error instanceof Error && !error.message.includes('userId is required')) {
        throw error;
      }
    }
  });

  // Test 9: Invalid encrypted format should fail
  await test('Edge case: Invalid encrypted format throws error', async () => {
    try {
      await decryptPassword('invalid-format', 'user-123');
      throw new Error('Should have thrown error for invalid format');
    } catch (error) {
      if (error instanceof Error && !error.message.includes('Invalid encrypted password format')) {
        throw error;
      }
    }
  });

  // Test 10: Multiple users, same password
  await test('Multi-user: Each user can decrypt their own password', async () => {
    const password = 'sharedPassword';
    const users = ['user-1', 'user-2', 'user-3'];

    const encrypted = await Promise.all(
      users.map(userId => encryptPassword(password, userId))
    );

    const decrypted = await Promise.all(
      users.map((userId, index) => decryptPassword(encrypted[index], userId))
    );

    for (let i = 0; i < decrypted.length; i++) {
      if (decrypted[i] !== password) {
        throw new Error(`User ${users[i]} failed to decrypt correctly`);
      }
    }

    // Ensure all encrypted values are unique
    const uniqueEncrypted = new Set(encrypted);
    if (uniqueEncrypted.size !== users.length) {
      throw new Error('Expected unique encrypted values for each user');
    }
  });

  console.log('\n' + '='.repeat(50));
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`📊 Total:  ${passed + failed}`);
  console.log('='.repeat(50));

  if (failed > 0) {
    process.exit(1);
  }
}

// Run the tests
runTests().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
