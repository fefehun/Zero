import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto';
import { env } from '../env';

/**
 * Encryption configuration
 * Using AES-256-GCM for authenticated encryption
 */
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16; // 128 bits for GCM
const AUTH_TAG_LENGTH = 16; // 128 bits authentication tag
const SALT_LENGTH = 32; // 256 bits salt

/**
 * Derive a 256-bit encryption key from the secret and userId
 * Uses SHA-256 to create a deterministic key for each user
 */
function deriveKey(userId: string): Buffer {
  if (!env.AUTUMN_SECRET_KEY) {
    throw new Error('AUTUMN_SECRET_KEY is not configured');
  }

  if (!userId || userId.trim() === '') {
    throw new Error('userId is required for encryption');
  }

  // Combine secret key with userId to create user-specific encryption key
  const keyMaterial = `${env.AUTUMN_SECRET_KEY}:${userId}`;
  return createHash('sha256').update(keyMaterial).digest();
}

/**
 * Encrypt a password for secure storage
 *
 * @param plainPassword - Plain text password to encrypt
 * @param userId - User ID (used as salt for user-specific encryption)
 * @returns Encrypted password as base64 string containing IV, auth tag, and ciphertext
 *
 * @example
 * const encrypted = await encryptPassword('myPassword123', 'user-123');
 * // Returns: base64-encoded string like "iv:authTag:ciphertext"
 */
export async function encryptPassword(
  plainPassword: string,
  userId: string,
): Promise<string> {
  try {
    if (!plainPassword) {
      throw new Error('plainPassword cannot be empty');
    }

    // Derive user-specific encryption key
    const key = deriveKey(userId);

    // Generate random IV for this encryption operation
    const iv = randomBytes(IV_LENGTH);

    // Create cipher
    const cipher = createCipheriv(ALGORITHM, key, iv);

    // Encrypt the password
    let encrypted = cipher.update(plainPassword, 'utf8', 'base64');
    encrypted += cipher.final('base64');

    // Get authentication tag
    const authTag = cipher.getAuthTag();

    // Combine IV, auth tag, and encrypted data
    // Format: iv:authTag:ciphertext (all base64 encoded)
    const result = [
      iv.toString('base64'),
      authTag.toString('base64'),
      encrypted,
    ].join(':');

    return result;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Encryption failed: ${error.message}`);
    }
    throw new Error('Encryption failed: Unknown error');
  }
}

/**
 * Decrypt a stored password
 *
 * @param encryptedPassword - Encrypted password string (format: "iv:authTag:ciphertext")
 * @param userId - User ID (must match the userId used during encryption)
 * @returns Plain text password
 *
 * @example
 * const decrypted = await decryptPassword(encrypted, 'user-123');
 * // Returns: "myPassword123"
 */
export async function decryptPassword(
  encryptedPassword: string,
  userId: string,
): Promise<string> {
  try {
    if (!encryptedPassword || encryptedPassword.trim() === '') {
      throw new Error('encryptedPassword cannot be empty');
    }

    // Parse the encrypted data
    const parts = encryptedPassword.split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid encrypted password format');
    }

    const [ivBase64, authTagBase64, ciphertext] = parts;

    // Convert from base64
    const iv = Buffer.from(ivBase64, 'base64');
    const authTag = Buffer.from(authTagBase64, 'base64');

    // Validate lengths
    if (iv.length !== IV_LENGTH) {
      throw new Error('Invalid IV length');
    }
    if (authTag.length !== AUTH_TAG_LENGTH) {
      throw new Error('Invalid auth tag length');
    }

    // Derive the same user-specific encryption key
    const key = deriveKey(userId);

    // Create decipher
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    // Decrypt the password
    let decrypted = decipher.update(ciphertext, 'base64', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (error) {
    if (error instanceof Error) {
      // Check if this is an authentication failure
      if (error.message.includes('Unsupported state or unable to authenticate data')) {
        throw new Error('Decryption failed: Invalid password or userId mismatch');
      }
      throw new Error(`Decryption failed: ${error.message}`);
    }
    throw new Error('Decryption failed: Unknown error');
  }
}
