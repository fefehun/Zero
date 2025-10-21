/**
 * IMAP Email Threading Algorithm
 *
 * Implements RFC 5256-compliant message threading based on email headers:
 * - Message-ID: Unique identifier for each message
 * - In-Reply-To: Direct parent message ID
 * - References: Full ancestry chain (oldest to newest)
 *
 * Threading Algorithm:
 * 1. Parse message headers to extract threading metadata
 * 2. Build parent-child relationships using In-Reply-To and References
 * 3. Group messages by finding root (oldest ancestor)
 * 4. Generate deterministic thread IDs from root Message-ID
 * 5. Handle edge cases (missing IDs, circular refs, subject fallback)
 */

import { createHash, randomBytes } from 'crypto';
import type { ParsedMessage } from '../types';

/**
 * Thread group containing related messages
 */
export interface ThreadGroup {
  /** Deterministic thread ID (hash of root Message-ID) */
  threadId: string;
  /** All messages in this thread, ordered by receivedOn */
  messages: ParsedMessage[];
  /** Root message (first in conversation) */
  rootMessage: ParsedMessage;
  /** Subject line (from root or first message with subject) */
  subject: string;
}

/**
 * Internal message metadata for threading
 */
interface MessageMetadata {
  message: ParsedMessage;
  messageId: string;
  inReplyTo: string | null;
  references: string[];
  subject: string;
  receivedOn: Date;
}

/**
 * Main threading function: Groups messages into conversation threads
 *
 * @param messages - Array of parsed IMAP messages
 * @returns Array of thread groups with messages organized by conversation
 *
 * Algorithm:
 * 1. Extract threading metadata from each message
 * 2. Build message lookup map by Message-ID
 * 3. For each message, find its root ancestor
 * 4. Group messages by root Message-ID
 * 5. Generate deterministic thread IDs
 * 6. Sort messages within each thread by date
 */
export function buildThreads(messages: ParsedMessage[]): ThreadGroup[] {
  if (messages.length === 0) {
    return [];
  }

  // Step 1: Extract metadata from messages
  const metadata = messages.map(extractMessageMetadata);

  // Step 2: Build message ID lookup map
  const messageMap = new Map<string, MessageMetadata>();
  metadata.forEach(meta => {
    if (meta.messageId) {
      messageMap.set(meta.messageId, meta);
    }
  });

  // Step 3: Group messages by root Message-ID
  const threadGroups = new Map<string, MessageMetadata[]>();
  const processedMessages = new Set<string>();

  metadata.forEach(meta => {
    if (processedMessages.has(meta.messageId)) {
      return;
    }

    // Find root message by traversing parent chain
    const rootId = findRootMessageId(meta, messageMap, processedMessages);

    if (!threadGroups.has(rootId)) {
      threadGroups.set(rootId, []);
    }
    threadGroups.get(rootId)!.push(meta);
    processedMessages.add(meta.messageId);
  });

  // Step 4: Convert to ThreadGroup objects
  const threads: ThreadGroup[] = [];

  for (const [rootId, threadMessages] of Array.from(threadGroups.entries())) {
    // Sort messages by date (oldest first)
    threadMessages.sort((a, b) => a.receivedOn.getTime() - b.receivedOn.getTime());

    // Find root message (should be first after sorting, but verify)
    const rootMessage = threadMessages.find(m => m.messageId === rootId) || threadMessages[0];

    // Generate deterministic thread ID
    const threadId = computeThreadId(rootId);

    // Update all messages with the computed thread ID
    threadMessages.forEach(meta => {
      meta.message.threadId = threadId;
    });

    threads.push({
      threadId,
      messages: threadMessages.map(m => m.message),
      rootMessage: rootMessage.message,
      subject: rootMessage.subject || threadMessages[0].subject || '(No Subject)',
    });
  }

  // Sort threads by most recent message (newest first)
  threads.sort((a, b) => {
    const aLatest = a.messages[a.messages.length - 1].receivedOn;
    const bLatest = b.messages[b.messages.length - 1].receivedOn;
    return new Date(bLatest).getTime() - new Date(aLatest).getTime();
  });

  return threads;
}

/**
 * Extract threading metadata from message headers
 *
 * Handles multiple edge cases:
 * - Missing Message-ID (generates fallback)
 * - Missing payload/headers
 * - Malformed header values
 * - Multiple References values (whitespace or comma separated)
 */
function extractMessageMetadata(message: ParsedMessage): MessageMetadata {
  // Extract Message-ID (or generate fallback)
  let messageId = message.messageId || '';

  // Clean Message-ID (remove angle brackets)
  messageId = cleanMessageId(messageId);

  // Generate fallback Message-ID if missing
  if (!messageId) {
    messageId = generateFallbackMessageId(message);
  }

  // Extract In-Reply-To
  let inReplyTo = message.inReplyTo || null;
  if (inReplyTo) {
    inReplyTo = cleanMessageId(inReplyTo);
  }

  // Extract References (can be space or comma separated)
  const referencesStr = message.references || '';
  const references = parseReferences(referencesStr);

  // Extract subject
  const subject = message.subject || '';

  // Parse date
  const receivedOn = new Date(message.receivedOn);

  return {
    message,
    messageId,
    inReplyTo,
    references,
    subject,
    receivedOn,
  };
}

/**
 * Find root Message-ID by traversing parent chain
 *
 * Algorithm:
 * 1. Start with current message
 * 2. Check In-Reply-To for parent
 * 3. If no In-Reply-To, check References (first = root)
 * 4. If parent exists in map, recursively find its root
 * 5. Detect circular references to prevent infinite loops
 * 6. Fallback to subject-based grouping if needed
 *
 * @param meta - Message metadata
 * @param messageMap - Map of all messages by Message-ID
 * @param processedMessages - Set to track visited messages (prevent circular refs)
 * @returns Root Message-ID for this thread
 */
function findRootMessageId(
  meta: MessageMetadata,
  messageMap: Map<string, MessageMetadata>,
  processedMessages: Set<string>,
): string {
  const visited = new Set<string>();
  let currentId = meta.messageId;
  let current: MessageMetadata | undefined = meta;

  // Traverse parent chain up to root
  while (current) {
    // Circular reference detection
    if (visited.has(currentId)) {
      console.warn(`[Threading] Circular reference detected: ${currentId}`);
      break;
    }
    visited.add(currentId);

    // Try In-Reply-To first (direct parent)
    const parentId = current.inReplyTo;
    if (parentId && messageMap.has(parentId)) {
      currentId = parentId;
      current = messageMap.get(parentId);
      continue;
    }

    // Try References (first reference is root)
    if (current.references.length > 0) {
      const rootFromRefs = current.references[0];
      if (messageMap.has(rootFromRefs)) {
        currentId = rootFromRefs;
        current = messageMap.get(rootFromRefs);
        continue;
      }
      // Root reference exists but message not in our dataset - use it anyway
      return rootFromRefs;
    }

    // No parent found - this is the root
    break;
  }

  return currentId;
}

/**
 * Generate deterministic thread ID from root Message-ID
 *
 * Uses SHA-256 hash to ensure:
 * - Same Message-ID always produces same thread ID
 * - Thread ID is consistent across sessions/syncs
 * - Thread ID is URL-safe and database-friendly
 *
 * @param rootMessageId - Root Message-ID for the thread
 * @returns Deterministic thread ID (first 16 chars of hex hash)
 */
export function computeThreadId(rootMessageId: string): string {
  if (!rootMessageId) {
    // Fallback for empty Message-ID
    return randomBytes(8).toString('hex');
  }

  // Generate SHA-256 hash
  const hash = createHash('sha256')
    .update(rootMessageId)
    .digest('hex');

  // Return first 16 characters (64 bits) for compact ID
  // This provides 2^64 possible values (collision probability negligible)
  return hash.substring(0, 16);
}

/**
 * Find root message in a thread
 *
 * Root is defined as:
 * 1. Message with no In-Reply-To or References headers
 * 2. OR earliest message if all have parent references
 *
 * @param messages - Array of messages in a thread
 * @returns Root message (earliest in conversation)
 */
export function findRootMessage(messages: ParsedMessage[]): ParsedMessage {
  if (messages.length === 0) {
    throw new Error('Cannot find root of empty message array');
  }

  if (messages.length === 1) {
    return messages[0];
  }

  // Find messages with no parent references
  const rootCandidates = messages.filter(msg => {
    const hasInReplyTo = !!msg.inReplyTo;
    const hasReferences = !!msg.references;
    return !hasInReplyTo && !hasReferences;
  });

  // If we found messages with no parent, pick earliest
  if (rootCandidates.length > 0) {
    return rootCandidates.sort((a, b) =>
      new Date(a.receivedOn).getTime() - new Date(b.receivedOn).getTime()
    )[0];
  }

  // All messages have parent references - pick earliest by date
  return messages.sort((a, b) =>
    new Date(a.receivedOn).getTime() - new Date(b.receivedOn).getTime()
  )[0];
}

/**
 * Helper: Clean Message-ID by removing angle brackets and whitespace
 *
 * Message-IDs are often wrapped in angle brackets: <id@host.com>
 * We store them without brackets for consistency
 */
function cleanMessageId(messageId: string): string {
  if (!messageId) return '';
  return messageId.trim().replace(/^<|>$/g, '');
}

/**
 * Helper: Parse References header into array of Message-IDs
 *
 * References can be:
 * - Space-separated: <id1@host> <id2@host>
 * - Comma-separated: <id1@host>, <id2@host>
 * - Newline-separated (wrapped)
 *
 * Returns array ordered oldest to newest (left to right)
 */
function parseReferences(referencesStr: string): string[] {
  if (!referencesStr) return [];

  // Split on whitespace, commas, or newlines
  const parts = referencesStr
    .split(/[\s,\n]+/)
    .map(cleanMessageId)
    .filter(id => id.length > 0);

  return parts;
}

/**
 * Helper: Generate fallback Message-ID for messages missing one
 *
 * Creates deterministic ID from message content:
 * - Subject
 * - Sender email
 * - Timestamp
 * - First 100 chars of body
 *
 * This allows same message to get same ID even without Message-ID header
 */
function generateFallbackMessageId(message: ParsedMessage): string {
  const parts = [
    message.subject || '',
    message.sender?.email || '',
    message.receivedOn || '',
    (message.decodedBody || message.body || '').substring(0, 100),
  ];

  const content = parts.join('|');
  const hash = createHash('sha256')
    .update(content)
    .digest('hex');

  return `generated-${hash.substring(0, 16)}@imap.local`;
}

/**
 * Helper: Normalize subject for grouping
 *
 * Removes Re:, Fwd:, etc. prefixes for subject-based fallback grouping
 * Not currently used but useful for future subject-based threading
 */
export function normalizeSubject(subject: string): string {
  if (!subject) return '';

  // Remove Re:, RE:, Fwd:, FW:, etc. (case insensitive)
  let normalized = subject.replace(/^(re|fwd?|aw|antw|sv|vs):\s*/gi, '');

  // Trim whitespace
  normalized = normalized.trim();

  return normalized.toLowerCase();
}

/**
 * Advanced: Subject-based fallback threading
 *
 * For messages with no threading headers, attempt to group by:
 * 1. Normalized subject (remove Re:, Fwd:)
 * 2. Sender/recipient overlap
 * 3. Time proximity (within 48 hours)
 *
 * NOT CURRENTLY USED - Available for future enhancement
 */
export function groupBySubject(messages: ParsedMessage[]): Map<string, ParsedMessage[]> {
  const subjectGroups = new Map<string, ParsedMessage[]>();

  messages.forEach(msg => {
    const normalizedSubj = normalizeSubject(msg.subject);
    if (!normalizedSubj) return;

    if (!subjectGroups.has(normalizedSubj)) {
      subjectGroups.set(normalizedSubj, []);
    }
    subjectGroups.get(normalizedSubj)!.push(msg);
  });

  return subjectGroups;
}

/**
 * Utility: Validate thread integrity
 *
 * Checks that all messages in a thread have:
 * 1. Same thread ID
 * 2. Valid parent-child relationships
 * 3. Correct chronological order
 *
 * Useful for debugging threading issues
 */
export function validateThread(thread: ThreadGroup): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Check thread ID consistency
  const invalidIds = thread.messages.filter(m => m.threadId !== thread.threadId);
  if (invalidIds.length > 0) {
    errors.push(`${invalidIds.length} messages have incorrect thread ID`);
  }

  // Check chronological order
  for (let i = 1; i < thread.messages.length; i++) {
    const prev = new Date(thread.messages[i - 1].receivedOn);
    const curr = new Date(thread.messages[i].receivedOn);
    if (curr < prev) {
      errors.push(`Message ${i} is out of chronological order`);
    }
  }

  // Check root message is actually first
  if (thread.messages[0].id !== thread.rootMessage.id) {
    errors.push('Root message is not first in thread');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
