import { simpleParser, type ParsedMail, type AddressObject, type Attachment as MailAttachment } from 'mailparser';
import type { ParsedMessage, Attachment } from '../types';
import * as sanitizeHtml from 'sanitize-html';
import * as cheerio from 'cheerio';

/**
 * Parse IMAP MIME message into ParsedMessage format
 *
 * This function uses mailparser to decode MIME messages and extract all fields
 * required for the AI pipeline. The most critical field is `decodedBody` which
 * must contain plain text for AI processing.
 *
 * @param raw - Raw MIME message buffer
 * @param connectionId - Connection ID for this message
 * @param uid - Optional IMAP UID for the message
 * @returns ParsedMessage object ready for AI processing
 */
export async function parseImapMessage(
  raw: Buffer,
  connectionId: string,
  uid?: number,
): Promise<ParsedMessage> {
  const parsed: ParsedMail = await simpleParser(raw);

  // CRITICAL: Extract plain text for AI processing
  const decodedBody = extractTextBody(parsed);

  // Extract email addresses from AddressObject
  const extractAddresses = (addr: AddressObject | AddressObject[] | undefined) => {
    if (!addr) return [];
    const addresses = Array.isArray(addr) ? addr : [addr];
    return addresses.flatMap(a =>
      a.value.map(v => ({
        name: v.name || '',
        email: v.address || '',
      }))
    );
  };

  // Extract sender
  const senderAddresses = extractAddresses(parsed.from);
  const sender = senderAddresses[0] || { name: '', email: '' };

  // Extract recipients
  const to = extractAddresses(parsed.to);
  const cc = extractAddresses(parsed.cc);
  const bcc = extractAddresses(parsed.bcc);

  // Extract Message-ID and threading headers
  const messageId = parsed.messageId || `imap-${uid || Date.now()}@${connectionId}`;
  const inReplyTo = parsed.inReplyTo || undefined;
  const references = parsed.references ? parsed.references.join(' ') : undefined;

  // Extract and sanitize HTML body
  const htmlBody = parsed.html ? sanitizeHtml(parsed.html as string) : '';

  // Extract attachments metadata
  const attachments = extractAttachments(parsed);

  // Build headers array
  const headers: { name: string; value: string }[] = [];
  if (parsed.headers) {
    for (const [name, value] of parsed.headers) {
      headers.push({
        name,
        value: Array.isArray(value) ? value.join(', ') : (value?.toString() || ''),
      });
    }
  }

  // Parse List-Unsubscribe header
  const listUnsubscribe = parsed.headers?.get('list-unsubscribe')?.toString();
  const listUnsubscribePost = parsed.headers?.get('list-unsubscribe-post')?.toString();

  // Check if TLS was used (from Received headers)
  const receivedHeaders = parsed.headers?.get('received');
  const tlsUsed = receivedHeaders
    ? String(receivedHeaders).toLowerCase().includes('tls')
    : false;

  return {
    id: messageId,
    threadId: '', // Will be computed by threading algorithm
    connectionId,
    title: parsed.subject || '(No Subject)',
    subject: parsed.subject || '(No Subject)',
    tags: [], // Will be populated from IMAP flags by ImapMailManager
    sender,
    to,
    cc: cc.length > 0 ? cc : null,
    bcc: bcc.length > 0 ? bcc : null,
    tls: tlsUsed,
    listUnsubscribe,
    listUnsubscribePost,
    receivedOn: parsed.date ? parsed.date.toISOString() : new Date().toISOString(),
    unread: false, // Will be set from IMAP \Seen flag
    body: htmlBody,
    processedHtml: htmlBody,
    blobUrl: '', // Not applicable for IMAP
    decodedBody, // CRITICAL for AI
    references,
    inReplyTo,
    replyTo: parsed.replyTo ? extractAddresses(parsed.replyTo)[0]?.email : undefined,
    messageId,
    attachments,
    isDraft: false, // Will be set based on IMAP folder
  };
}

/**
 * Extract plain text body from parsed MIME message
 *
 * Priority:
 * 1. Use text/plain part if available
 * 2. Convert HTML to plain text as fallback
 * 3. Return empty string if no content
 *
 * @param parsed - Parsed MIME message from mailparser
 * @returns Plain text content
 */
export function extractTextBody(parsed: ParsedMail): string {
  // First priority: plain text
  if (parsed.text) {
    return parsed.text.trim();
  }

  // Second priority: convert HTML to plain text
  if (parsed.html) {
    return htmlToPlainText(parsed.html as string);
  }

  // Third priority: try textAsHtml (sometimes mailparser provides this)
  if (parsed.textAsHtml) {
    return htmlToPlainText(parsed.textAsHtml);
  }

  return '';
}

/**
 * Convert HTML to plain text
 *
 * Strips all HTML tags and extracts readable text content.
 * Used when email only has HTML part but we need plain text for AI.
 *
 * @param html - HTML content
 * @returns Plain text
 */
function htmlToPlainText(html: string): string {
  try {
    if (!html || typeof html !== 'string') {
      return '';
    }

    const $ = cheerio.load(html);

    // Remove script and style tags
    $('script').remove();
    $('style').remove();

    // Remove common email tracking elements
    $('img[width="1"][height="1"]').remove();
    $('img[width="0"][height="0"]').remove();

    // Extract text from body or root
    let text = $('body').length > 0 ? $('body').text() : $.text();

    // Normalize whitespace
    text = text
      .replace(/\r?\n|\r/g, ' ')  // Convert newlines to spaces
      .replace(/\s+/g, ' ')        // Collapse multiple spaces
      .trim();

    return text;
  } catch (error) {
    console.error('[IMAP-UTILS] Error converting HTML to plain text:', error);
    return '';
  }
}

/**
 * Extract attachment metadata from parsed MIME message
 *
 * This extracts metadata only (filename, size, type, etc).
 * Actual attachment content is handled separately via lazy loading.
 *
 * @param parsed - Parsed MIME message from mailparser
 * @returns Array of attachment metadata
 */
export function extractAttachments(parsed: ParsedMail): Attachment[] {
  if (!parsed.attachments || parsed.attachments.length === 0) {
    return [];
  }

  return parsed.attachments
    .filter((att): att is MailAttachment => att.type === 'attachment')
    .map((att, index) => {
      // Generate attachment ID from content-id or filename
      const attachmentId = att.contentId
        ? att.contentId.replace(/^<|>$/g, '')
        : `att-${index}-${att.filename || 'unknown'}`;

      // Extract headers
      const headers: { name?: string | null; value?: string | null }[] = [];
      if (att.headers) {
        for (const [name, value] of att.headers) {
          headers.push({
            name,
            value: Array.isArray(value) ? value.join(', ') : (value?.toString() || null),
          });
        }
      }

      return {
        attachmentId,
        filename: att.filename || 'attachment',
        mimeType: att.contentType || 'application/octet-stream',
        size: att.size || 0,
        body: att.content ? att.content.toString('base64') : '',
        headers,
      };
    });
}

/**
 * Sanitize HTML content to remove dangerous elements
 *
 * Provides basic XSS protection by:
 * - Removing script tags
 * - Removing inline event handlers
 * - Allowing only safe HTML tags
 * - Sanitizing CSS
 *
 * @param html - HTML content to sanitize
 * @returns Sanitized HTML
 */
export function sanitizeHtmlContent(html: string): string {
  if (!html) return '';

  const sanitizeConfig: sanitizeHtml.IOptions = {
    allowedTags: [
      // Text formatting
      'b', 'i', 'u', 'em', 'strong', 'small', 'mark', 'del', 'ins', 'sub', 'sup',
      // Headings and paragraphs
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'br', 'hr',
      // Lists
      'ul', 'ol', 'li', 'dl', 'dt', 'dd',
      // Tables
      'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption', 'col', 'colgroup',
      // Links and images
      'a', 'img',
      // Quotes and code
      'blockquote', 'code', 'pre', 'kbd', 'samp', 'var',
      // Structural
      'div', 'span', 'article', 'section', 'aside', 'header', 'footer', 'nav',
      // Other
      'details', 'summary', 'figure', 'figcaption',
    ],

    allowedAttributes: {
      '*': ['class', 'style', 'id'],
      'a': ['href', 'name', 'target', 'rel'],
      'img': ['src', 'alt', 'width', 'height', 'loading'],
      'table': ['border', 'cellpadding', 'cellspacing', 'width'],
      'td': ['colspan', 'rowspan', 'width', 'height', 'align', 'valign'],
      'th': ['colspan', 'rowspan', 'width', 'height', 'align', 'valign'],
    },

    // Only allow safe URL schemes
    allowedSchemes: ['http', 'https', 'mailto', 'tel', 'data', 'cid'],
    allowedSchemesByTag: {
      'img': ['http', 'https', 'data', 'cid'],
      'a': ['http', 'https', 'mailto', 'tel'],
    },

    // Transform tags for safety
    transformTags: {
      'a': (tagName, attribs) => {
        return {
          tagName,
          attribs: {
            ...attribs,
            target: '_blank',
            rel: 'noopener noreferrer',
          },
        };
      },
    },

    // Allow CSS properties (basic)
    allowedStyles: {
      '*': {
        'color': [/^#[0-9a-f]{3,6}$/i, /^rgb\(/i, /^rgba\(/i],
        'background-color': [/^#[0-9a-f]{3,6}$/i, /^rgb\(/i, /^rgba\(/i],
        'font-size': [/^\d+(?:px|em|rem|%)$/],
        'font-weight': [/^\w+$/],
        'text-align': [/^(?:left|right|center|justify)$/],
        'margin': [/^\d+(?:px|em|rem|%)$/],
        'padding': [/^\d+(?:px|em|rem|%)$/],
        'border': [/.*/],
        'width': [/^\d+(?:px|em|rem|%)$/],
        'height': [/^\d+(?:px|em|rem|%)$/],
      },
    },
  };

  return sanitizeHtml(html, sanitizeConfig);
}

/**
 * Parse email address from string format
 *
 * Handles formats like:
 * - "John Doe <john@example.com>"
 * - "john@example.com"
 * - "<john@example.com>"
 *
 * @param addressStr - Email address string
 * @returns Parsed name and email
 */
export function parseEmailAddress(addressStr: string): { name: string; email: string } {
  if (!addressStr) {
    return { name: '', email: '' };
  }

  // Match "Name <email@example.com>" format
  const match = addressStr.match(/^(.+?)\s*<(.+?)>$/);
  if (match) {
    return {
      name: match[1].trim().replace(/^["']|["']$/g, ''),
      email: match[2].trim(),
    };
  }

  // Match "<email@example.com>" format
  const emailOnlyMatch = addressStr.match(/^<(.+?)>$/);
  if (emailOnlyMatch) {
    return {
      name: '',
      email: emailOnlyMatch[1].trim(),
    };
  }

  // Just an email address
  return {
    name: '',
    email: addressStr.trim(),
  };
}

/**
 * Generate unique message ID if not present in MIME
 *
 * Uses IMAP UID and connection ID to create deterministic IDs
 *
 * @param uid - IMAP UID
 * @param connectionId - Connection ID
 * @returns Message ID
 */
export function generateMessageId(uid: number, connectionId: string): string {
  return `imap-${uid}@${connectionId}`;
}
