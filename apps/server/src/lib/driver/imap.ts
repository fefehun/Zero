/**
 * IMAP Mail Manager
 *
 * Implements MailManager interface for IMAP/SMTP email providers.
 * This driver enables Zero to work with any IMAP-compliant email server
 * including Gmail (via IMAP), Outlook/Exchange, custom mail servers, etc.
 *
 * Phase 2 Implementation - Task 2.4
 *
 * Architecture:
 * - Lazy connection: Connects on-demand, not in constructor
 * - Threading: Uses imap-threading.ts to build conversation threads
 * - Parsing: Uses imap-utils.ts for MIME parsing
 * - Connection: Uses imap-connection.ts for IMAP operations
 *
 * Critical Methods (Fully Implemented):
 * - get() - Fetch thread by ID
 * - list() - List threads with filtering
 * - getUserLabels() - List IMAP folders as labels
 * - createDraft() - Create draft in Drafts folder
 * - markAsRead/Unread() - Modify IMAP flags
 *
 * Stub Methods (Minimal Implementation):
 * - delete(), count(), modifyLabels(), etc.
 *
 * Not Applicable:
 * - OAuth methods (getTokens, revokeToken, etc.)
 * - create() - Will be implemented in Phase 5 (SMTP)
 */

import type {
  MailManager,
  ManagerConfig,
  IGetThreadResponse,
  IGetThreadsResponse,
  ParsedDraft,
} from './types';
import type { IOutgoingMessage, Label, ParsedMessage, DeleteAllSpamResponse } from '../../types';
import type { CreateDraftData } from '../schemas';
import {
  connectImap,
  disconnectImap,
  openBox,
  getBoxes,
  managerConfigToImapConfig,
  ImapConnectionError,
  ImapErrorType,
  type ImapConfig,
} from '../imap-connection';
import { parseImapMessage } from '../imap-utils';
import { buildThreads, computeThreadId, findRootMessage } from '../imap-threading';
import { StandardizedError } from './utils';
import { createMimeMessage } from 'mimetext';
import { deserializeFiles } from '../schemas';
import Imap from 'imap';
import { sendEmailWithManager, type EmailData } from '../smtp-utils';

/**
 * IMAP-specific message representation with UID
 */
interface ImapMessage {
  uid: number;
  flags: string[];
  body: Buffer;
  attributes: {
    uid: number;
    flags: string[];
    date?: Date;
  };
}

/**
 * ImapMailManager - Full implementation of MailManager interface for IMAP
 */
export class ImapMailManager implements MailManager {
  // Store config but don't connect yet (lazy connection)
  constructor(public config: ManagerConfig) {
    // Validate IMAP configuration
    if (!config.imap) {
      throw new Error('IMAP configuration is required for ImapMailManager');
    }
    if (!config.auth?.email) {
      throw new Error('Email address is required in auth config');
    }
  }

  /**
   * Get IMAP configuration from ManagerConfig
   */
  private getImapConfig(): ImapConfig {
    return managerConfigToImapConfig(this.config);
  }

  /**
   * Establish IMAP connection (used internally by all methods)
   */
  private async connect(): Promise<Imap> {
    return await connectImap(this.getImapConfig());
  }

  /**
   * Disconnect from IMAP server
   */
  private async disconnect(imap: Imap): Promise<void> {
    return await disconnectImap(imap);
  }

  /**
   * Fetch messages from IMAP server by range
   *
   * @param imap - Connected IMAP instance
   * @param range - UID range (e.g., '1:*', '100:200', '1,2,3')
   * @param boxName - Mailbox name (default: already opened)
   * @returns Array of parsed messages
   */
  private async fetchMessages(imap: Imap, range: string): Promise<ParsedMessage[]> {
    return new Promise((resolve, reject) => {
      const messages: ParsedMessage[] = [];
      const fetch = imap.seq.fetch(range, {
        bodies: '',
        struct: true,
      });

      fetch.on('message', (msg, seqno) => {
        let buffer = Buffer.alloc(0);
        let uid = 0;
        let flags: string[] = [];

        msg.on('body', (stream) => {
          stream.on('data', (chunk) => {
            buffer = Buffer.concat([buffer, chunk]);
          });
        });

        msg.once('attributes', (attrs) => {
          uid = attrs.uid;
          flags = attrs.flags || [];
        });

        msg.once('end', async () => {
          try {
            const parsed = await parseImapMessage(buffer, this.config.connectionId || '', uid);

            // Add IMAP flags as tags
            parsed.tags = flags.map((flag) => ({
              id: flag,
              name: flag,
              type: 'system',
            }));

            // Set unread status based on \Seen flag
            parsed.unread = !flags.includes('\\Seen');

            messages.push(parsed);
          } catch (err) {
            console.error(`[IMAP] Failed to parse message UID ${uid}:`, err);
          }
        });
      });

      fetch.once('error', (err) => {
        console.error('[IMAP] Fetch error:', err);
        const imapErr = err as Error & { code: string };
        imapErr.code = imapErr.code || 'IMAP_FETCH_ERROR';
        reject(new StandardizedError(imapErr, 'fetchMessages'));
      });

      fetch.once('end', () => {
        console.log(`[IMAP] Fetched ${messages.length} messages`);
        resolve(messages);
      });
    });
  }

  /**
   * CRITICAL METHOD: Get thread by ID
   *
   * Fetches all messages in a conversation thread.
   * Thread ID can be:
   * - A computed thread ID (from threading algorithm)
   * - A message UID
   * - A Message-ID
   *
   * @param id - Thread ID or message ID
   * @returns Thread with messages, latest message, and metadata
   */
  async get(id: string): Promise<IGetThreadResponse> {
    const imap = await this.connect();

    try {
      // Open INBOX in read-only mode
      const box = await openBox(imap, 'INBOX', true);

      // Fetch all messages from INBOX
      // In a real implementation, you'd want to fetch only relevant messages
      // For now, fetch recent messages and filter by thread ID
      const totalMessages = box.messages.total;
      if (totalMessages === 0) {
        const err = new Error(`Thread ${id} not found (mailbox empty)`) as Error & { code: string };
        err.code = 'THREAD_NOT_FOUND';
        throw new StandardizedError(err, 'get');
      }

      // Fetch last 100 messages (or all if less than 100)
      const start = Math.max(1, totalMessages - 100 + 1);
      const end = totalMessages;
      const range = `${start}:${end}`;

      const messages = await this.fetchMessages(imap, range);

      // Build threads to get thread IDs
      const threads = buildThreads(messages);

      // Find the thread matching the requested ID
      let targetThread = threads.find((t) => t.threadId === id);

      // If not found, try to find by message ID
      if (!targetThread) {
        const messageById = messages.find((m) => m.id === id || m.messageId === id);
        if (messageById && messageById.threadId) {
          targetThread = threads.find((t) => t.threadId === messageById.threadId);
        }
      }

      if (!targetThread) {
        const err = new Error(`Thread ${id} not found`) as Error & { code: string };
        err.code = 'THREAD_NOT_FOUND';
        throw new StandardizedError(err, 'get');
      }

      // Sort messages by date (oldest first)
      const sortedMessages = targetThread.messages.sort(
        (a, b) => new Date(a.receivedOn).getTime() - new Date(b.receivedOn).getTime(),
      );

      const latest = sortedMessages[sortedMessages.length - 1];
      const hasUnread = sortedMessages.some((m) => m.unread);

      return {
        messages: sortedMessages,
        latest,
        hasUnread,
        totalReplies: sortedMessages.length,
        labels: [{ id: 'INBOX', name: 'INBOX' }],
        isLatestDraft: false,
      };
    } finally {
      await this.disconnect(imap);
    }
  }

  /**
   * CRITICAL METHOD: List threads
   *
   * Lists email threads from a specific folder with filtering and pagination.
   *
   * @param params - Folder, query, pagination params
   * @returns Paginated list of threads
   */
  async list(params: {
    folder: string;
    query?: string;
    maxResults?: number;
    labelIds?: string[];
    pageToken?: string | number;
  }): Promise<IGetThreadsResponse> {
    const folder = params.folder || 'INBOX';
    const maxResults = params.maxResults || 50;
    const pageToken = params.pageToken ? Number(params.pageToken) : 0;

    const imap = await this.connect();

    try {
      const box = await openBox(imap, folder, true);

      const totalMessages = box.messages.total;
      if (totalMessages === 0) {
        return {
          threads: [],
          nextPageToken: null,
        };
      }

      // Calculate range for pagination
      // pageToken represents the starting message number
      const start = Math.max(1, totalMessages - pageToken - maxResults + 1);
      const end = Math.max(1, totalMessages - pageToken);
      const range = `${start}:${end}`;

      console.log(`[IMAP] Fetching messages ${start}:${end} from ${folder} (total: ${totalMessages})`);

      const messages = await this.fetchMessages(imap, range);

      // Apply query filter if provided
      let filteredMessages = messages;
      if (params.query) {
        const queryLower = params.query.toLowerCase();
        filteredMessages = messages.filter(
          (m) =>
            m.subject.toLowerCase().includes(queryLower) ||
            m.sender.email.toLowerCase().includes(queryLower) ||
            m.decodedBody?.toLowerCase().includes(queryLower),
        );
      }

      // Build threads
      const threads = buildThreads(filteredMessages);

      // Determine next page token
      const nextPageToken = start > 1 ? String(pageToken + maxResults) : null;

      return {
        threads: threads.map((t) => ({
          id: t.threadId,
          historyId: null, // IMAP doesn't have history IDs
          $raw: t,
        })),
        nextPageToken,
      };
    } finally {
      await this.disconnect(imap);
    }
  }

  /**
   * CRITICAL METHOD: Get user labels (IMAP folders)
   *
   * Lists all IMAP folders and maps them to Label format.
   * Standard folders: INBOX, Sent, Drafts, Trash, Spam
   * Custom folders: User-created folders
   *
   * @returns Array of labels representing IMAP folders
   */
  async getUserLabels(): Promise<Label[]> {
    const imap = await this.connect();

    try {
      const boxes = await getBoxes(imap);

      const labels: Label[] = [];

      // Helper to convert IMAP box to Label
      const convertBoxToLabel = (name: string, box: Imap.MailBoxes[string], parentPath = '') => {
        const fullPath = parentPath ? `${parentPath}${box.delimiter}${name}` : name;

        // Determine label type
        let type = 'user';
        const nameLower = name.toLowerCase();
        if (['inbox', 'sent', 'drafts', 'trash', 'spam', 'junk'].includes(nameLower)) {
          type = 'system';
        }

        const label: Label = {
          id: fullPath,
          name: fullPath,
          type,
        };

        labels.push(label);

        // Recursively process child folders
        if (box.children) {
          Object.entries(box.children).forEach(([childName, childBox]) => {
            convertBoxToLabel(childName, childBox, fullPath);
          });
        }
      };

      // Process all top-level folders
      Object.entries(boxes).forEach(([name, box]) => {
        convertBoxToLabel(name, box);
      });

      return labels;
    } finally {
      await this.disconnect(imap);
    }
  }

  /**
   * CRITICAL METHOD: Create draft
   *
   * Creates a draft message in the Drafts folder using IMAP APPEND.
   *
   * @param data - Draft data (to, subject, message, etc.)
   * @returns Draft ID (UID in Drafts folder)
   */
  async createDraft(
    data: CreateDraftData,
  ): Promise<{ id?: string | null; success?: boolean; error?: string }> {
    const imap = await this.connect();

    try {
      // Build MIME message
      const msg = createMimeMessage();

      msg.setSender({ name: this.config.auth.email, addr: this.config.auth.email });
      msg.setSubject(data.subject);

      // Parse recipients
      const toAddrs = data.to.split(',').map((email) => ({ addr: email.trim() }));
      msg.setRecipients(toAddrs);

      if (data.cc) {
        const ccAddrs = data.cc.split(',').map((email) => ({ addr: email.trim() }));
        msg.setCc(ccAddrs);
      }

      if (data.bcc) {
        const bccAddrs = data.bcc.split(',').map((email) => ({ addr: email.trim() }));
        msg.setBcc(bccAddrs);
      }

      // Set message body
      msg.addMessage({
        contentType: 'text/html',
        data: data.message,
      });

      // Handle attachments
      if (data.attachments && data.attachments.length > 0) {
        const files = await deserializeFiles(data.attachments);
        for (const file of files) {
          const buffer = await file.arrayBuffer();
          msg.addAttachment({
            filename: file.name,
            contentType: file.type,
            data: Buffer.from(buffer).toString('base64'),
          });
        }
      }

      // Add threading headers if replying to a thread
      if (data.threadId) {
        msg.setHeader('In-Reply-To', `<${data.threadId}>`);
        msg.setHeader('References', `<${data.threadId}>`);
      }

      const mimeMessage = msg.asRaw();

      // Append to Drafts folder
      return new Promise((resolve, reject) => {
        imap.append(mimeMessage, { mailbox: 'Drafts', flags: ['\\Draft'] }, (err, box) => {
          if (err) {
            console.error('[IMAP] Failed to create draft:', err);
            const draftErr = err as Error & { code: string };
            draftErr.code = draftErr.code || 'DRAFT_CREATE_FAILED';
            reject(new StandardizedError(draftErr, 'createDraft'));
          } else {
            // IMAP doesn't return UID directly, we'd need to search for it
            // For now, return success without specific ID
            resolve({ id: null, success: true });
          }
        });
      });
    } catch (err) {
      console.error('[IMAP] Error creating draft:', err);
      return {
        id: null,
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    } finally {
      await this.disconnect(imap);
    }
  }

  /**
   * Mark threads as read
   *
   * Adds the \Seen flag to all messages in the specified threads.
   *
   * @param threadIds - Array of thread IDs
   */
  async markAsRead(threadIds: string[]): Promise<void> {
    const imap = await this.connect();

    try {
      await openBox(imap, 'INBOX', false); // Read-write mode

      // Fetch all messages to find UIDs for these threads
      const box = await openBox(imap, 'INBOX', false);
      const totalMessages = box.messages.total;

      if (totalMessages === 0) return;

      const messages = await this.fetchMessages(imap, `1:${totalMessages}`);
      const threads = buildThreads(messages);

      // Find UIDs for messages in specified threads
      const uids: number[] = [];
      for (const threadId of threadIds) {
        const thread = threads.find((t) => t.threadId === threadId);
        if (thread) {
          for (const msg of thread.messages) {
            // Extract UID from message ID if it's in the format imap-{uid}@...
            const match = msg.id.match(/imap-(\d+)@/);
            if (match) {
              uids.push(Number(match[1]));
            }
          }
        }
      }

      if (uids.length === 0) return;

      // Add \Seen flag to all UIDs
      return new Promise((resolve, reject) => {
        imap.addFlags(uids, ['\\Seen'], (err) => {
          if (err) {
            console.error('[IMAP] Failed to mark as read:', err);
            const markErr = err as Error & { code: string };
            markErr.code = markErr.code || 'MARK_READ_FAILED';
            reject(new StandardizedError(markErr, 'markAsRead'));
          } else {
            console.log(`[IMAP] Marked ${uids.length} messages as read`);
            resolve();
          }
        });
      });
    } finally {
      await this.disconnect(imap);
    }
  }

  /**
   * Mark threads as unread
   *
   * Removes the \Seen flag from all messages in the specified threads.
   *
   * @param threadIds - Array of thread IDs
   */
  async markAsUnread(threadIds: string[]): Promise<void> {
    const imap = await this.connect();

    try {
      await openBox(imap, 'INBOX', false); // Read-write mode

      const box = await openBox(imap, 'INBOX', false);
      const totalMessages = box.messages.total;

      if (totalMessages === 0) return;

      const messages = await this.fetchMessages(imap, `1:${totalMessages}`);
      const threads = buildThreads(messages);

      // Find UIDs for messages in specified threads
      const uids: number[] = [];
      for (const threadId of threadIds) {
        const thread = threads.find((t) => t.threadId === threadId);
        if (thread) {
          for (const msg of thread.messages) {
            const match = msg.id.match(/imap-(\d+)@/);
            if (match) {
              uids.push(Number(match[1]));
            }
          }
        }
      }

      if (uids.length === 0) return;

      // Remove \Seen flag from all UIDs
      return new Promise((resolve, reject) => {
        imap.delFlags(uids, ['\\Seen'], (err) => {
          if (err) {
            console.error('[IMAP] Failed to mark as unread:', err);
            const markErr = err as Error & { code: string };
            markErr.code = markErr.code || 'MARK_UNREAD_FAILED';
            reject(new StandardizedError(markErr, 'markAsUnread'));
          } else {
            console.log(`[IMAP] Marked ${uids.length} messages as unread`);
            resolve();
          }
        });
      });
    } finally {
      await this.disconnect(imap);
    }
  }

  /**
   * Get draft by ID
   *
   * @param id - Draft message UID
   * @returns Parsed draft
   */
  async getDraft(id: string): Promise<ParsedDraft> {
    const imap = await this.connect();

    try {
      await openBox(imap, 'Drafts', true);

      // Parse UID from ID
      const match = id.match(/imap-(\d+)@/);
      const uid = match ? match[1] : id;

      const messages = await this.fetchMessages(imap, uid);

      if (messages.length === 0) {
        const err = new Error(`Draft ${id} not found`) as Error & { code: string };
        err.code = 'DRAFT_NOT_FOUND';
        throw new StandardizedError(err, 'getDraft');
      }

      const msg = messages[0];

      return {
        id: msg.id,
        to: msg.to?.map((r) => r.email) || [],
        cc: msg.cc?.map((r) => r.email) || undefined,
        bcc: msg.bcc?.map((r) => r.email) || undefined,
        subject: msg.subject,
        content: msg.body,
        rawMessage: {
          internalDate: msg.receivedOn,
        },
      };
    } finally {
      await this.disconnect(imap);
    }
  }

  /**
   * List drafts
   *
   * @param params - Query and pagination params
   * @returns List of draft threads
   */
  async listDrafts(params: {
    q?: string;
    maxResults?: number;
    pageToken?: string;
  }): Promise<IGetThreadsResponse> {
    // Reuse list() method with Drafts folder
    return this.list({
      folder: 'Drafts',
      query: params.q,
      maxResults: params.maxResults,
      pageToken: params.pageToken,
    });
  }

  /**
   * Send draft via SMTP
   *
   * Phase 5 Implementation - Task 5.3
   *
   * In IMAP, drafts are stored in the "Drafts" folder as regular messages.
   * Unlike OAuth providers (Google, Outlook) which have native draft APIs,
   * IMAP draft sending simply means:
   * 1. Send the draft as a regular email via SMTP (using create())
   * 2. Optionally delete the draft from the Drafts folder
   *
   * This implementation reuses the existing create() method which handles
   * SMTP sending. The draft ID is logged for tracking but not used for
   * actual SMTP operations, as SMTP sending is based on the message content,
   * not the draft storage.
   *
   * @param id - Draft ID (UID in Drafts folder) - used for logging/tracking
   * @param data - Outgoing message data with recipients, subject, body, etc.
   * @returns Promise<void> - Throws error if sending fails
   *
   * @example
   * await manager.sendDraft('imap-123@host', {
   *   to: [{ email: 'user@example.com' }],
   *   subject: 'Test',
   *   message: '<p>Hello</p>'
   * });
   */
  async sendDraft(id: string, data: IOutgoingMessage): Promise<void> {
    console.log(`[IMAP] Sending draft ${id} as email via SMTP`);

    // Drafts in IMAP are sent as regular emails via SMTP
    // The draft ID is informational only - we use create() to send via SMTP
    const result = await this.create(data);

    if (result.error) {
      console.error(`[IMAP] Failed to send draft ${id}:`, result.error);
      const err = new Error(`Failed to send draft: ${result.error}`) as Error & { code: string };
      err.code = 'DRAFT_SEND_FAILED';
      throw new StandardizedError(err, 'sendDraft');
    }

    if (result.id) {
      console.log(`[IMAP] Draft ${id} sent successfully via SMTP with message ID: ${result.id}`);
    } else {
      console.log(`[IMAP] Draft ${id} sent successfully via SMTP (no message ID returned)`);
    }

    // Note: We don't automatically delete the draft from the Drafts folder
    // The client should call deleteDraft() if they want to remove it
  }

  /**
   * Delete draft from Drafts folder
   *
   * Phase 5 Implementation - Task 5.3
   *
   * Deletes a draft message from the IMAP Drafts folder by marking it with
   * the \Deleted flag and expunging it. This is the standard IMAP way to
   * permanently delete messages.
   *
   * The draft ID can be in two formats:
   * - Full format: "imap-{uid}@{host}" (e.g., "imap-123@mail.example.com")
   * - Simple format: Just the UID number (e.g., "123")
   *
   * Process:
   * 1. Connect to IMAP server
   * 2. Open Drafts folder in read-write mode
   * 3. Parse UID from the draft ID
   * 4. Mark message with \Deleted flag
   * 5. Expunge to permanently remove the message
   * 6. Disconnect from server
   *
   * @param id - Draft ID to delete (UID or full imap-{uid}@{host} format)
   * @returns Promise<void> - Throws error if deletion fails
   *
   * @example
   * // Delete using full ID format
   * await manager.deleteDraft('imap-123@mail.example.com');
   *
   * // Delete using simple UID format
   * await manager.deleteDraft('123');
   */
  async deleteDraft(id: string): Promise<void> {
    const imap = await this.connect();

    try {
      await openBox(imap, 'Drafts', false); // Read-write mode

      // Parse UID from ID (supports both "imap-123@host" and "123" formats)
      const match = id.match(/imap-(\d+)@/);
      const uid = match ? Number(match[1]) : Number(id);

      console.log(`[IMAP] Deleting draft with UID ${uid} from Drafts folder`);

      return new Promise((resolve, reject) => {
        // Step 1: Mark message as deleted
        imap.addFlags([uid], ['\\Deleted'], (err) => {
          if (err) {
            console.error('[IMAP] Failed to mark draft as deleted:', err);
            const delErr = err as Error & { code: string };
            delErr.code = delErr.code || 'DELETE_DRAFT_FAILED';
            reject(new StandardizedError(delErr, 'deleteDraft'));
          } else {
            // Step 2: Expunge to permanently delete marked messages
            imap.expunge((expungeErr) => {
              if (expungeErr) {
                console.error('[IMAP] Failed to expunge deleted draft:', expungeErr);
                const expErr = expungeErr as Error & { code: string };
                expErr.code = expErr.code || 'EXPUNGE_FAILED';
                reject(new StandardizedError(expErr, 'deleteDraft'));
              } else {
                console.log(`[IMAP] Successfully deleted draft UID ${uid} from Drafts folder`);
                resolve();
              }
            });
          }
        });
      });
    } finally {
      await this.disconnect(imap);
    }
  }

  /**
   * Delete thread (move to Trash)
   *
   * @param id - Thread ID
   */
  async delete(id: string): Promise<void> {
    // In IMAP, "delete" typically means moving to Trash folder
    // Implementation would use COPY + EXPUNGE or MOVE extension
    const err = new Error('delete() will be implemented in Phase 4') as Error & { code: string };
    err.code = 'NOT_IMPLEMENTED';
    throw new StandardizedError(err, 'delete');
  }

  /**
   * Count messages per label/folder
   *
   * @returns Array of counts per folder
   */
  async count(): Promise<{ count?: number; label?: string }[]> {
    const imap = await this.connect();

    try {
      const boxes = await getBoxes(imap);
      const counts: { count?: number; label?: string }[] = [];

      // Helper to count messages in a box
      const countBox = async (name: string, parentPath = '') => {
        const fullPath = parentPath ? `${parentPath}/${name}` : name;

        try {
          const box = await openBox(imap, fullPath, true);
          counts.push({
            label: fullPath,
            count: box.messages.total,
          });
        } catch (err) {
          console.error(`[IMAP] Failed to count messages in ${fullPath}:`, err);
        }
      };

      // Count messages in standard folders
      const standardFolders = ['INBOX', 'Sent', 'Drafts', 'Trash', 'Spam'];
      for (const folder of standardFolders) {
        try {
          const box = await openBox(imap, folder, true);
          counts.push({
            label: folder,
            count: box.messages.total,
          });
        } catch (err) {
          // Folder might not exist, skip
        }
      }

      return counts;
    } finally {
      await this.disconnect(imap);
    }
  }

  /**
   * Modify labels (move/copy between folders)
   *
   * @param ids - Thread IDs
   * @param options - Add/remove label operations
   */
  async modifyLabels(
    ids: string[],
    options: { addLabels: string[]; removeLabels: string[] },
  ): Promise<void> {
    // IMAP implementation would use COPY + EXPUNGE or MOVE extension
    const err = new Error('modifyLabels() will be implemented in Phase 4') as Error & { code: string };
    err.code = 'NOT_IMPLEMENTED';
    throw new StandardizedError(err, 'modifyLabels');
  }

  /**
   * Get attachment
   *
   * @param messageId - Message ID
   * @param attachmentId - Attachment ID
   * @returns Base64-encoded attachment data
   */
  async getAttachment(messageId: string, attachmentId: string): Promise<string | undefined> {
    // Would fetch message and extract specific attachment
    // For now, stub implementation
    const err = new Error('getAttachment() will be implemented in Phase 4') as Error & { code: string };
    err.code = 'NOT_IMPLEMENTED';
    throw new StandardizedError(err, 'getAttachment');
  }

  /**
   * Get message attachments
   *
   * @param id - Message ID
   * @returns Array of attachment metadata
   */
  async getMessageAttachments(id: string): Promise<
    {
      filename: string;
      mimeType: string;
      size: number;
      attachmentId: string;
      headers: { name: string; value: string }[];
      body: string;
    }[]
  > {
    const imap = await this.connect();

    try {
      await openBox(imap, 'INBOX', true);

      // Parse UID from ID
      const match = id.match(/imap-(\d+)@/);
      const uid = match ? match[1] : id;

      const messages = await this.fetchMessages(imap, uid);

      if (messages.length === 0) {
        return [];
      }

      const msg = messages[0];

      return (msg.attachments || []).map((att) => ({
        filename: att.filename,
        mimeType: att.mimeType,
        size: att.size,
        attachmentId: att.attachmentId,
        headers: att.headers.map((h) => ({
          name: h.name || '',
          value: h.value || '',
        })),
        body: att.body,
      }));
    } finally {
      await this.disconnect(imap);
    }
  }

  /**
   * Get label by ID
   *
   * @param id - Label ID (folder name)
   * @returns Label information
   */
  async getLabel(id: string): Promise<Label> {
    const labels = await this.getUserLabels();
    const label = labels.find((l) => l.id === id);

    if (!label) {
      const err = new Error(`Label ${id} not found`) as Error & { code: string };
      err.code = 'LABEL_NOT_FOUND';
      throw new StandardizedError(err, 'getLabel');
    }

    return label;
  }

  /**
   * Create label (IMAP folder)
   *
   * @param label - Label data (name, color)
   */
  async createLabel(label: {
    name: string;
    color?: { backgroundColor: string; textColor: string };
  }): Promise<void> {
    const imap = await this.connect();

    try {
      return new Promise((resolve, reject) => {
        imap.addBox(label.name, (err) => {
          if (err) {
            console.error(`[IMAP] Failed to create folder ${label.name}:`, err);
            const createErr = err as Error & { code: string };
            createErr.code = createErr.code || 'CREATE_LABEL_FAILED';
            reject(new StandardizedError(createErr, 'createLabel'));
          } else {
            console.log(`[IMAP] Created folder ${label.name}`);
            resolve();
          }
        });
      });
    } finally {
      await this.disconnect(imap);
    }
  }

  /**
   * Update label (rename IMAP folder)
   *
   * @param id - Current folder name
   * @param label - New label data
   */
  async updateLabel(
    id: string,
    label: { name: string; color?: { backgroundColor: string; textColor: string } },
  ): Promise<void> {
    const imap = await this.connect();

    try {
      return new Promise((resolve, reject) => {
        imap.renameBox(id, label.name, (err) => {
          if (err) {
            console.error(`[IMAP] Failed to rename folder ${id} to ${label.name}:`, err);
            const renameErr = err as Error & { code: string };
            renameErr.code = renameErr.code || 'UPDATE_LABEL_FAILED';
            reject(new StandardizedError(renameErr, 'updateLabel'));
          } else {
            console.log(`[IMAP] Renamed folder ${id} to ${label.name}`);
            resolve();
          }
        });
      });
    } finally {
      await this.disconnect(imap);
    }
  }

  /**
   * Delete label (IMAP folder)
   *
   * @param id - Folder name to delete
   */
  async deleteLabel(id: string): Promise<void> {
    const imap = await this.connect();

    try {
      return new Promise((resolve, reject) => {
        imap.delBox(id, (err) => {
          if (err) {
            console.error(`[IMAP] Failed to delete folder ${id}:`, err);
            const delErr = err as Error & { code: string };
            delErr.code = delErr.code || 'DELETE_LABEL_FAILED';
            reject(new StandardizedError(delErr, 'deleteLabel'));
          } else {
            console.log(`[IMAP] Deleted folder ${id}`);
            resolve();
          }
        });
      });
    } finally {
      await this.disconnect(imap);
    }
  }

  /**
   * Get raw email (RFC822 format)
   *
   * @param id - Message ID
   * @returns Raw RFC822 message
   */
  async getRawEmail(id: string): Promise<string> {
    const imap = await this.connect();

    try {
      await openBox(imap, 'INBOX', true);

      // Parse UID from ID
      const match = id.match(/imap-(\d+)@/);
      const uid = match ? match[1] : id;

      return new Promise((resolve, reject) => {
        let raw = '';

        const fetch = imap.seq.fetch(uid, { bodies: '' });

        fetch.on('message', (msg) => {
          msg.on('body', (stream) => {
            stream.on('data', (chunk) => {
              raw += chunk.toString('utf8');
            });
          });
        });

        fetch.once('error', (err) => {
          const fetchErr = err as Error & { code: string };
          fetchErr.code = fetchErr.code || 'FETCH_RAW_FAILED';
          reject(new StandardizedError(fetchErr, 'getRawEmail'));
        });

        fetch.once('end', () => {
          resolve(raw);
        });
      });
    } finally {
      await this.disconnect(imap);
    }
  }

  /**
   * Normalize IDs (pass-through for IMAP)
   *
   * @param ids - Thread IDs
   * @returns Normalized IDs
   */
  normalizeIds(ids: string[]): { threadIds: string[] } {
    return { threadIds: ids };
  }

  /**
   * Get email aliases
   *
   * IMAP doesn't support aliases, return primary email
   *
   * @returns Array with primary email
   */
  async getEmailAliases(): Promise<{ email: string; name?: string; primary?: boolean }[]> {
    return [
      {
        email: this.config.auth.email,
        primary: true,
      },
    ];
  }

  /**
   * Delete all spam
   *
   * Deletes all messages in Spam folder
   *
   * @returns Number of deleted messages
   */
  async deleteAllSpam(): Promise<DeleteAllSpamResponse> {
    const imap = await this.connect();

    try {
      const box = await openBox(imap, 'Spam', false); // Read-write mode
      const totalMessages = box.messages.total;

      if (totalMessages === 0) {
        return { success: true, message: 'No spam messages to delete', count: 0 };
      }

      // Mark all messages as deleted
      return new Promise((resolve, reject) => {
        imap.addFlags(`1:${totalMessages}`, ['\\Deleted'], (err) => {
          if (err) {
            console.error('[IMAP] Failed to mark spam as deleted:', err);
            const delErr = err as Error & { code: string };
            delErr.code = delErr.code || 'DELETE_SPAM_FAILED';
            reject(new StandardizedError(delErr, 'deleteAllSpam'));
          } else {
            // Expunge to permanently delete
            imap.expunge((expungeErr) => {
              if (expungeErr) {
                console.error('[IMAP] Failed to expunge spam:', expungeErr);
                const expErr = expungeErr as Error & { code: string };
                expErr.code = expErr.code || 'EXPUNGE_SPAM_FAILED';
                reject(new StandardizedError(expErr, 'deleteAllSpam'));
              } else {
                console.log(`[IMAP] Deleted ${totalMessages} spam messages`);
                resolve({ success: true, message: `Deleted ${totalMessages} spam messages`, count: totalMessages });
              }
            });
          }
        });
      });
    } catch (err) {
      // Spam folder might not exist
      console.error('[IMAP] Spam folder not found or error:', err);
      return { success: false, message: 'Spam folder not found or error', count: 0 };
    } finally {
      await this.disconnect(imap);
    }
  }

  // ============================================================================
  // OAuth-specific methods (NOT APPLICABLE TO IMAP)
  // ============================================================================

  /**
   * Get OAuth tokens - NOT SUPPORTED for IMAP
   */
  async getTokens(
    code: string,
  ): Promise<{ tokens: { access_token?: string; refresh_token?: string; expiry_date?: number } }> {
    const err = new Error('OAuth tokens not applicable to IMAP provider') as Error & { code: string };
    err.code = 'NOT_SUPPORTED';
    throw new StandardizedError(err, 'getTokens');
  }

  /**
   * Get user info
   *
   * Returns email from config (IMAP doesn't have user profile API)
   */
  async getUserInfo(
    tokens?: ManagerConfig['auth'],
  ): Promise<{ address: string; name: string; photo: string }> {
    return {
      address: this.config.auth.email,
      name: this.config.auth.email.split('@')[0], // Extract name from email
      photo: '', // No photo support
    };
  }

  /**
   * Get OAuth scope - NOT APPLICABLE to IMAP
   */
  getScope(): string {
    return 'imap';
  }

  /**
   * List history - NOT SUPPORTED for IMAP
   *
   * Gmail-specific feature, not applicable to IMAP
   */
  async listHistory<T>(historyId: string): Promise<{ history: T[]; historyId: string }> {
    return {
      history: [],
      historyId,
    };
  }

  /**
   * Revoke OAuth token - NOT APPLICABLE to IMAP
   */
  async revokeToken(token: string): Promise<boolean> {
    // No-op for IMAP
    return true;
  }

  /**
   * Create/send email via SMTP
   *
   * Converts IOutgoingMessage to EmailData format and sends via SMTP.
   * This is Phase 5 implementation using smtp-utils.
   *
   * @param data - Outgoing message data with recipients, subject, body, attachments
   * @returns Response with message ID or error
   */
  async create(data: IOutgoingMessage): Promise<{ id?: string | null; error?: string }> {
    try {
      // Convert IOutgoingMessage to EmailData format
      const emailData: EmailData = {
        to: data.to,
        cc: data.cc,
        bcc: data.bcc,
        subject: data.subject,
        body: data.message,
        attachments: this.convertAttachments(data.attachments),
        replyTo: undefined, // IOutgoingMessage doesn't have replyTo as Sender
        inReplyTo: data.headers?.['In-Reply-To'],
        references: data.headers?.['References'],
      };

      // Send email via SMTP
      const result = await sendEmailWithManager(this.config, emailData);

      if (!result.success) {
        console.error('[IMAP] Failed to send email via SMTP:', result.error);
        return {
          id: null,
          error: result.error || 'Failed to send email',
        };
      }

      console.log('[IMAP] Email sent successfully via SMTP:', result.messageId);
      return {
        id: result.messageId || null,
      };
    } catch (err) {
      console.error('[IMAP] Error in create():', err);
      const error = err instanceof Error ? err.message : String(err);
      return {
        id: null,
        error,
      };
    }
  }

  /**
   * Convert IOutgoingMessage attachments to EmailData attachments
   *
   * Transforms base64-encoded attachments to Buffer format required by nodemailer.
   *
   * @param attachments - Array of attachments with base64 content
   * @returns Array of EmailAttachment with Buffer content
   */
  private convertAttachments(
    attachments?: IOutgoingMessage['attachments'],
  ): EmailData['attachments'] {
    if (!attachments || attachments.length === 0) {
      return undefined;
    }

    return attachments.map((att) => ({
      filename: att.name,
      content: Buffer.from(att.base64, 'base64'),
      contentType: att.type,
    }));
  }
}
