import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import type { ManagerConfig } from './driver/types';
import type { Sender } from '../types';
import { decryptPassword } from './encryption';

/**
 * SMTP configuration for creating transporter
 */
export interface SmtpConfig {
  host: string;
  port: number;
  security: 'SSL' | 'STARTTLS' | 'NONE';
  username: string;
  password: string;
}

/**
 * Email data structure compatible with MailManager.create() signature
 */
export interface EmailData {
  to: Sender[];
  cc?: Sender[];
  bcc?: Sender[];
  subject: string;
  body: string;
  attachments?: EmailAttachment[];
  replyTo?: string;
  inReplyTo?: string;
  references?: string;
}

/**
 * Email attachment structure compatible with nodemailer
 */
export interface EmailAttachment {
  filename: string;
  content?: string | Buffer; // Base64 string or Buffer
  path?: string; // File path
  contentType?: string;
  encoding?: string;
}

/**
 * Result of email sending operation
 */
export interface SendEmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Test SMTP connection result
 */
export interface TestConnectionResult {
  success: boolean;
  error?: string;
}

/**
 * Creates nodemailer transporter based on SMTP configuration and security mode
 *
 * @param config - SMTP configuration including host, port, security mode, and credentials
 * @returns Configured nodemailer transporter
 *
 * @example
 * const transporter = createSmtpTransport({
 *   host: 'smtp.gmail.com',
 *   port: 587,
 *   security: 'STARTTLS',
 *   username: 'user@example.com',
 *   password: 'decryptedPassword'
 * });
 */
export function createSmtpTransport(config: SmtpConfig): Transporter {
  const { host, port, security, username, password } = config;

  // Base transport options
  const transportOptions: {
    host: string;
    port: number;
    secure: boolean;
    requireTLS?: boolean;
    auth: {
      user: string;
      pass: string;
    };
    // Add common nodemailer options for better compatibility
    tls?: {
      rejectUnauthorized: boolean;
    };
  } = {
    host,
    port,
    secure: false,
    auth: {
      user: username,
      pass: password,
    },
    // Allow self-signed certificates in development/testing
    tls: {
      rejectUnauthorized: false,
    },
  };

  // Configure based on security mode
  switch (security) {
    case 'SSL':
      // SSL/TLS: typically port 465, secure connection from start
      transportOptions.secure = true;
      break;

    case 'STARTTLS':
      // STARTTLS: typically port 587, upgrade to TLS
      transportOptions.secure = false;
      transportOptions.requireTLS = true;
      break;

    case 'NONE':
      // No encryption: typically port 25, plaintext connection
      transportOptions.secure = false;
      break;

    default:
      throw new Error(`Unsupported security mode: ${security}`);
  }

  return nodemailer.createTransport(transportOptions);
}

/**
 * Tests SMTP connection by attempting to verify credentials
 *
 * @param config - SMTP configuration to test
 * @returns Promise resolving to test result with success status
 *
 * @example
 * const result = await testSmtpConnection({
 *   host: 'smtp.gmail.com',
 *   port: 587,
 *   security: 'STARTTLS',
 *   username: 'user@example.com',
 *   password: 'decryptedPassword'
 * });
 * if (result.success) {
 *   console.log('SMTP connection successful');
 * } else {
 *   console.error('SMTP connection failed:', result.error);
 * }
 */
export async function testSmtpConnection(
  config: SmtpConfig,
): Promise<TestConnectionResult> {
  try {
    const transporter = createSmtpTransport(config);

    // Verify connection using nodemailer's built-in verify method
    await transporter.verify();

    return { success: true };
  } catch (error) {
    let errorMessage = 'Unknown SMTP connection error';

    if (error instanceof Error) {
      errorMessage = error.message;
    } else if (typeof error === 'string') {
      errorMessage = error;
    }

    return {
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Sends an email via SMTP using nodemailer
 *
 * @param config - SMTP configuration including host, port, security mode, and credentials
 * @param emailData - Email data including recipients, subject, body, and attachments
 * @returns Promise resolving to send result with success status and messageId
 *
 * @example
 * const result = await sendEmail(
 *   {
 *     host: 'smtp.gmail.com',
 *     port: 587,
 *     security: 'STARTTLS',
 *     username: 'user@example.com',
 *     password: 'decryptedPassword'
 *   },
 *   {
 *     to: [{ email: 'recipient@example.com', name: 'John Doe' }],
 *     cc: [{ email: 'cc@example.com' }],
 *     subject: 'Test Email',
 *     body: '<p>This is a test email</p>',
 *     attachments: [
 *       { filename: 'file.pdf', path: '/path/to/file.pdf' }
 *     ]
 *   }
 * );
 */
export async function sendEmail(
  config: SmtpConfig,
  emailData: EmailData,
): Promise<SendEmailResult> {
  try {
    const transporter = createSmtpTransport(config);

    // Convert Sender[] format to nodemailer address format
    const formatAddresses = (
      addresses?: Sender[],
    ): string | string[] | undefined => {
      if (!addresses || addresses.length === 0) return undefined;

      return addresses.map((addr) => {
        if (addr.name) {
          return `"${addr.name}" <${addr.email}>`;
        }
        return addr.email;
      });
    };

    // Prepare mail options
    const mailOptions = {
      from: config.username, // Sender email (authenticated user)
      to: formatAddresses(emailData.to),
      cc: formatAddresses(emailData.cc),
      bcc: formatAddresses(emailData.bcc),
      subject: emailData.subject,
      html: emailData.body, // HTML body
      text: emailData.body.replace(/<[^>]*>/g, ''), // Strip HTML for text fallback
      attachments: emailData.attachments,
      // Threading headers for reply context
      inReplyTo: emailData.inReplyTo,
      references: emailData.references,
      replyTo: emailData.replyTo,
    };

    // Send the email
    const info = await transporter.sendMail(mailOptions);

    return {
      success: true,
      messageId: info.messageId,
    };
  } catch (error) {
    let errorMessage = 'Failed to send email';

    if (error instanceof Error) {
      // Provide more specific error messages based on error type
      if (error.message.includes('authentication')) {
        errorMessage = `SMTP authentication failed: ${error.message}`;
      } else if (error.message.includes('ECONNREFUSED')) {
        errorMessage = `Cannot connect to SMTP server: ${error.message}`;
      } else if (error.message.includes('ETIMEDOUT')) {
        errorMessage = `SMTP connection timeout: ${error.message}`;
      } else {
        errorMessage = `SMTP error: ${error.message}`;
      }
    } else if (typeof error === 'string') {
      errorMessage = error;
    }

    return {
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Extracts SMTP configuration from ManagerConfig and decrypts password
 *
 * @param managerConfig - ManagerConfig containing SMTP settings and encrypted password
 * @returns SMTP configuration with decrypted password, or null if SMTP not configured
 *
 * @example
 * const smtpConfig = await getSmtpConfigFromManager(managerConfig);
 * if (smtpConfig) {
 *   const result = await sendEmail(smtpConfig, emailData);
 * }
 */
export async function getSmtpConfigFromManager(
  managerConfig: ManagerConfig,
): Promise<SmtpConfig | null> {
  // Check if SMTP configuration exists
  if (!managerConfig.smtp) {
    return null;
  }

  // Extract SMTP settings
  const { host, port, security } = managerConfig.smtp;
  const username = managerConfig.auth.email;

  // Decrypt password
  // For IMAP connections, password is already stored in config.imap.password (decrypted)
  // But we need to get it from the encrypted source
  let password: string;

  if (managerConfig.imap?.password) {
    // If IMAP config has decrypted password, use it
    password = managerConfig.imap.password;
  } else {
    // Otherwise, we'd need to decrypt it, but ManagerConfig doesn't include encryptedPassword
    // This is a limitation - in practice, the password should be passed through imap.password
    throw new Error(
      'Cannot retrieve SMTP password: password not available in ManagerConfig',
    );
  }

  return {
    host,
    port,
    security,
    username,
    password,
  };
}

/**
 * Sends an email using ManagerConfig (convenience wrapper)
 *
 * @param managerConfig - ManagerConfig containing SMTP settings and credentials
 * @param emailData - Email data including recipients, subject, body, and attachments
 * @returns Promise resolving to send result
 *
 * @example
 * const result = await sendEmailWithManager(managerConfig, {
 *   to: [{ email: 'recipient@example.com', name: 'John Doe' }],
 *   subject: 'Test Email',
 *   body: '<p>This is a test email</p>'
 * });
 */
export async function sendEmailWithManager(
  managerConfig: ManagerConfig,
  emailData: EmailData,
): Promise<SendEmailResult> {
  const smtpConfig = await getSmtpConfigFromManager(managerConfig);

  if (!smtpConfig) {
    return {
      success: false,
      error: 'SMTP not configured for this connection',
    };
  }

  return sendEmail(smtpConfig, emailData);
}

/**
 * Tests SMTP connection using ManagerConfig (convenience wrapper)
 *
 * @param managerConfig - ManagerConfig containing SMTP settings and credentials
 * @returns Promise resolving to test result
 *
 * @example
 * const result = await testSmtpConnectionWithManager(managerConfig);
 * if (!result.success) {
 *   console.error('SMTP test failed:', result.error);
 * }
 */
export async function testSmtpConnectionWithManager(
  managerConfig: ManagerConfig,
): Promise<TestConnectionResult> {
  const smtpConfig = await getSmtpConfigFromManager(managerConfig);

  if (!smtpConfig) {
    return {
      success: false,
      error: 'SMTP not configured for this connection',
    };
  }

  return testSmtpConnection(smtpConfig);
}
