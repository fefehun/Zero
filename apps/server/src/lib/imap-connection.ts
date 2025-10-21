/**
 * IMAP Connection Utilities
 *
 * This module provides core connection management utilities for IMAP servers.
 * It handles connection establishment, authentication, folder operations, and
 * graceful disconnection with comprehensive error handling.
 *
 * @module imap-connection
 */

import Imap from 'imap';
import type { ManagerConfig } from './driver/types';

/**
 * IMAP connection configuration interface
 * Supports SSL, STARTTLS, and NONE security modes
 */
export interface ImapConfig {
  host: string;
  port: number;
  security: 'SSL' | 'STARTTLS' | 'NONE';
  user: string;
  password: string;
}

/**
 * Connection error types for better error handling
 */
export enum ImapErrorType {
  CONNECTION_TIMEOUT = 'CONNECTION_TIMEOUT',
  AUTH_FAILED = 'AUTH_FAILED',
  NETWORK_ERROR = 'NETWORK_ERROR',
  INVALID_CREDENTIALS = 'INVALID_CREDENTIALS',
  BOX_NOT_FOUND = 'BOX_NOT_FOUND',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  UNKNOWN = 'UNKNOWN',
}

/**
 * Custom IMAP error class with type information
 */
export class ImapConnectionError extends Error {
  constructor(
    message: string,
    public type: ImapErrorType,
    public originalError?: unknown,
  ) {
    super(message);
    this.name = 'ImapConnectionError';
  }
}

/**
 * Converts ManagerConfig to ImapConfig
 * Extracts IMAP-specific configuration from the broader ManagerConfig
 *
 * @param config - ManagerConfig from the driver system
 * @returns ImapConfig ready for connection
 * @throws Error if IMAP configuration is missing
 */
export function managerConfigToImapConfig(config: ManagerConfig): ImapConfig {
  if (!config.imap) {
    throw new Error('IMAP configuration is missing from ManagerConfig');
  }

  return {
    host: config.imap.host,
    port: config.imap.port,
    security: config.imap.security,
    user: config.auth.email,
    password: config.imap.password, // Already decrypted by the time it reaches here
  };
}

/**
 * Establishes a connection to an IMAP server
 *
 * Features:
 * - Supports SSL, STARTTLS, and NONE security modes
 * - Configurable connection and auth timeouts
 * - Comprehensive error handling with typed errors
 * - Promise-based API for async/await usage
 *
 * @param config - IMAP connection configuration
 * @returns Promise resolving to connected Imap instance
 * @throws ImapConnectionError with specific error type
 *
 * @example
 * ```typescript
 * const imap = await connectImap({
 *   host: 'imap.gmail.com',
 *   port: 993,
 *   security: 'SSL',
 *   user: 'user@gmail.com',
 *   password: 'app-password'
 * });
 * ```
 */
export async function connectImap(config: ImapConfig): Promise<Imap> {
  return new Promise((resolve, reject) => {
    // Determine TLS settings based on security mode
    const useTls = config.security === 'SSL';
    const useStartTls = config.security === 'STARTTLS';

    const imap = new Imap({
      user: config.user,
      password: config.password,
      host: config.host,
      port: config.port,
      tls: useTls,
      autotls: useStartTls ? 'required' : 'never',
      tlsOptions: {
        // In production, you may want to set rejectUnauthorized: true
        // and handle certificate validation properly
        rejectUnauthorized: false,
      },
      connTimeout: 10000, // 10 seconds
      authTimeout: 5000, // 5 seconds
      keepalive: {
        interval: 10000, // Send NOOP every 10 seconds
        idleInterval: 300000, // 5 minutes
        forceNoop: true,
      },
    });

    let connected = false;

    // Connection successful
    imap.once('ready', () => {
      connected = true;
      console.log(`[IMAP] Connected to ${config.host}:${config.port} (${config.security})`);
      resolve(imap);
    });

    // Connection error handler
    imap.once('error', (err: Error) => {
      if (connected) return; // Already resolved, ignore subsequent errors

      console.error('[IMAP] Connection error:', err.message);

      // Classify error type based on error message
      let errorType = ImapErrorType.UNKNOWN;
      const errMsg = err.message.toLowerCase();

      if (errMsg.includes('timeout') || errMsg.includes('timed out')) {
        errorType = ImapErrorType.CONNECTION_TIMEOUT;
      } else if (
        errMsg.includes('authentication') ||
        errMsg.includes('auth failed') ||
        errMsg.includes('login failed') ||
        errMsg.includes('invalid credentials')
      ) {
        errorType = ImapErrorType.AUTH_FAILED;
      } else if (
        errMsg.includes('network') ||
        errMsg.includes('econnrefused') ||
        errMsg.includes('enotfound') ||
        errMsg.includes('econnreset')
      ) {
        errorType = ImapErrorType.NETWORK_ERROR;
      }

      reject(
        new ImapConnectionError(
          `Failed to connect to IMAP server: ${err.message}`,
          errorType,
          err,
        ),
      );
    });

    // Handle connection end during connection phase
    imap.once('end', () => {
      if (!connected) {
        reject(
          new ImapConnectionError(
            'Connection ended before ready',
            ImapErrorType.NETWORK_ERROR,
          ),
        );
      }
    });

    // Initiate connection
    try {
      imap.connect();
    } catch (err) {
      reject(
        new ImapConnectionError(
          `Failed to initiate IMAP connection: ${err instanceof Error ? err.message : String(err)}`,
          ImapErrorType.UNKNOWN,
          err,
        ),
      );
    }
  });
}

/**
 * Gracefully disconnects from an IMAP server
 *
 * Ensures proper cleanup of resources and waits for the connection
 * to fully close before resolving.
 *
 * @param imap - Connected Imap instance
 * @returns Promise that resolves when disconnected
 *
 * @example
 * ```typescript
 * await disconnectImap(imap);
 * console.log('Disconnected from IMAP server');
 * ```
 */
export async function disconnectImap(imap: Imap): Promise<void> {
  return new Promise((resolve) => {
    // Check if already disconnected
    if (imap.state === 'disconnected') {
      console.log('[IMAP] Already disconnected');
      resolve();
      return;
    }

    // Wait for end event
    imap.once('end', () => {
      console.log('[IMAP] Disconnected');
      resolve();
    });

    // Initiate disconnection
    try {
      imap.end();
    } catch (err) {
      // If end() throws, still resolve since connection is being closed
      console.warn('[IMAP] Error during disconnect:', err);
      resolve();
    }
  });
}

/**
 * Opens an IMAP mailbox/folder
 *
 * This function opens a specific IMAP folder (e.g., INBOX, Sent, Drafts)
 * with proper error handling for common failure scenarios.
 *
 * @param imap - Connected Imap instance
 * @param boxName - Name of the mailbox to open (e.g., 'INBOX', 'Sent')
 * @param readOnly - If true, opens in read-only mode (default: true)
 * @returns Promise resolving to Box information
 * @throws ImapConnectionError if box cannot be opened
 *
 * @example
 * ```typescript
 * const inbox = await openBox(imap, 'INBOX', true);
 * console.log(`Inbox has ${inbox.messages.total} messages`);
 * ```
 */
export async function openBox(
  imap: Imap,
  boxName: string,
  readOnly = true,
): Promise<Imap.Box> {
  return new Promise((resolve, reject) => {
    imap.openBox(boxName, readOnly, (err, box) => {
      if (err) {
        console.error(`[IMAP] Failed to open box '${boxName}':`, err.message);

        // Classify error type
        let errorType = ImapErrorType.UNKNOWN;
        const errMsg = err.message.toLowerCase();

        if (
          errMsg.includes('does not exist') ||
          errMsg.includes('not found') ||
          errMsg.includes('no such mailbox')
        ) {
          errorType = ImapErrorType.BOX_NOT_FOUND;
        } else if (
          errMsg.includes('permission') ||
          errMsg.includes('access denied') ||
          errMsg.includes('insufficient')
        ) {
          errorType = ImapErrorType.PERMISSION_DENIED;
        }

        reject(
          new ImapConnectionError(
            `Failed to open mailbox '${boxName}': ${err.message}`,
            errorType,
            err,
          ),
        );
      } else {
        console.log(`[IMAP] Opened box '${boxName}' (${box.messages.total} messages)`);
        resolve(box);
      }
    });
  });
}

/**
 * Retrieves list of all available mailboxes/folders
 *
 * Returns a hierarchical structure of all IMAP folders available
 * on the server. Useful for folder discovery and navigation.
 *
 * @param imap - Connected Imap instance
 * @returns Promise resolving to mailbox hierarchy
 * @throws ImapConnectionError if listing fails
 *
 * @example
 * ```typescript
 * const boxes = await getBoxes(imap);
 * console.log('Available folders:', Object.keys(boxes));
 * ```
 */
export async function getBoxes(imap: Imap): Promise<Imap.MailBoxes> {
  return new Promise((resolve, reject) => {
    imap.getBoxes((err, boxes) => {
      if (err) {
        console.error('[IMAP] Failed to get boxes:', err.message);
        reject(
          new ImapConnectionError(
            `Failed to retrieve mailbox list: ${err.message}`,
            ImapErrorType.UNKNOWN,
            err,
          ),
        );
      } else {
        const boxCount = Object.keys(boxes).length;
        console.log(`[IMAP] Retrieved ${boxCount} mailboxes`);
        resolve(boxes);
      }
    });
  });
}

/**
 * Connection pool for managing multiple IMAP connections
 *
 * Future enhancement: This can be extended to implement connection pooling
 * to reuse connections and improve performance for high-volume operations.
 *
 * @example
 * ```typescript
 * // Future usage
 * const pool = new ImapConnectionPool(config, { maxConnections: 5 });
 * const conn = await pool.acquire();
 * try {
 *   // Use connection
 * } finally {
 *   await pool.release(conn);
 * }
 * ```
 */
export interface ImapConnectionPoolOptions {
  maxConnections: number;
  idleTimeout: number; // milliseconds
  acquireTimeout: number; // milliseconds
}

// Connection pool is a placeholder for future Phase 4 implementation
// For now, each operation creates and destroys its own connection
// This is acceptable for low-volume operations but should be optimized later

/**
 * Utility function to test IMAP connection
 * Useful for validating credentials and connection settings
 *
 * @param config - IMAP connection configuration
 * @returns Promise<boolean> - true if connection successful
 */
export async function testImapConnection(config: ImapConfig): Promise<boolean> {
  try {
    const imap = await connectImap(config);
    await disconnectImap(imap);
    return true;
  } catch (err) {
    console.error('[IMAP] Connection test failed:', err);
    return false;
  }
}
