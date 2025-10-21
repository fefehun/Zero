# Phase 2: Core IMAP Driver - REVISED (AI-PROOF)

**Status**: Ready for Execution
**Estimated Time**: 3-4 hours
**Risk Level**: Medium
**Dependencies**: Phase 1 Complete

---

## Overview

Implement `ImapMailManager` class that implements the `MailManager` interface (26 methods) for IMAP/SMTP operations.

**Key Files Created**:
- `/apps/server/src/lib/driver/imap.ts` - ImapMailManager class (~1000 lines)
- `/apps/server/src/lib/imap-connection.ts` - Connection pooling (~200 lines)
- `/apps/server/src/lib/imap-threading.ts` - Threading algorithm (~300 lines)
- `/apps/server/src/lib/imap-utils.ts` - MIME parsing helpers (~200 lines)

**Success Criteria**: ImapMailManager compiles, basic methods work

---

## PRECONDITIONS

- [x] Phase 1 complete
- [ ] Dependencies installed (imap, mailparser, nodemailer)
- [ ] Types updated (EProviders includes 'imap')
- [ ] Build succeeds

---

## TASK 2.1: Create IMAP Connection Utilities

### Purpose
Helper functions for connecting to IMAP servers

**File**: `/apps/server/src/lib/imap-connection.ts` (NEW)

**Content** (Full implementation):
```typescript
import Imap from 'imap';

export interface ImapConfig {
  host: string;
  port: number;
  security: 'SSL' | 'STARTTLS' | 'NONE';
  user: string;
  password: string;
}

export async function connectImap(config: ImapConfig): Promise<Imap> {
  return new Promise((resolve, reject) => {
    const imap = new Imap({
      user: config.user,
      password: config.password,
      host: config.host,
      port: config.port,
      tls: config.security === 'SSL',
      tlsOptions: { rejectUnauthorized: false },
      connTimeout: 10000,
      authTimeout: 5000,
    });

    imap.once('ready', () => {
      console.log('[IMAP] Connected to', config.host);
      resolve(imap);
    });

    imap.once('error', (err) => {
      console.error('[IMAP] Connection error:', err);
      reject(err);
    });

    imap.connect();
  });
}

export async function disconnectImap(imap: Imap): Promise<void> {
  return new Promise((resolve) => {
    imap.once('end', () => {
      console.log('[IMAP] Disconnected');
      resolve();
    });
    imap.end();
  });
}

export async function openBox(
  imap: Imap,
  boxName: string,
  readOnly: boolean,
): Promise<Imap.Box> {
  return new Promise((resolve, reject) => {
    imap.openBox(boxName, readOnly, (err, box) => {
      if (err) reject(err);
      else resolve(box);
    });
  });
}
```

**Validation**: TypeScript compiles

---

## TASK 2.2: Create Threading Algorithm

### Purpose
Group IMAP messages into threads using email headers

**File**: `/apps/server/src/lib/imap-threading.ts` (NEW)

**Content** (Implementation outline - see existing Gmail driver for reference):
```typescript
import type { ParsedMessage } from '../types';

export interface ThreadingResult {
  threads: Map<string, ParsedMessage[]>;
  threadIds: Map<string, string>; // messageId -> threadId
}

export function threadMessages(messages: ParsedMessage[]): ThreadingResult {
  // Algorithm:
  // 1. Build map of Message-ID -> message
  // 2. For each message, find parent via In-Reply-To or References
  // 3. Group messages with same root into thread
  // 4. Generate thread ID from first message's ID

  const threads = new Map<string, ParsedMessage[]>();
  const threadIds = new Map<string, string>();

  // Implementation: ~250 lines
  // Ref: Gmail threading logic from analysis/00-driver-architecture.md

  return { threads, threadIds };
}

export function computeThreadId(message: ParsedMessage): string {
  // Extract root Message-ID from References header
  const references = message.payload?.headers?.find(h => h.name === 'References')?.value;
  if (references) {
    const ids = references.split(/\s+/);
    return ids[0] || message.id;
  }

  // Fallback to In-Reply-To
  const inReplyTo = message.payload?.headers?.find(h => h.name === 'In-Reply-To')?.value;
  if (inReplyTo) return inReplyTo;

  // Fallback to own message ID
  return message.id;
}
```

**Validation**: TypeScript compiles

---

## TASK 2.3: Create MIME Parsing Utilities

### Purpose
Parse IMAP MIME messages into ParsedMessage format

**File**: `/apps/server/src/lib/imap-utils.ts` (NEW)

**Content**:
```typescript
import { simpleParser, type ParsedMail } from 'mailparser';
import type { ParsedMessage } from '../types';

export async function parseImapMessage(
  rawMime: string,
  connectionId: string,
): Promise<ParsedMessage> {
  const parsed: ParsedMail = await simpleParser(rawMime);

  const decodedBody = parsed.text || parsed.html || '';

  return {
    id: parsed.messageId || `uid-${Date.now()}`,
    threadId: '', // Computed later by threading algorithm
    connectionId,
    subject: parsed.subject || '',
    decodedBody, // ⚠️ CRITICAL for AI
    body: parsed.html || parsed.textAsHtml || '',
    sender: {
      name: parsed.from?.value[0]?.name || '',
      email: parsed.from?.value[0]?.address || '',
    },
    to: parsed.to?.value.map(r => ({ name: r.name || '', email: r.address || '' })) || [],
    cc: parsed.cc?.value.map(r => ({ name: r.name || '', email: r.address || '' })) || [],
    receivedOn: parsed.date?.toISOString() || new Date().toISOString(),
    tags: [], // Populated from IMAP flags
    payload: {
      headers: Object.entries(parsed.headers || {}).map(([name, value]) => ({
        name,
        value: String(value),
      })),
      body: { data: parsed.html || parsed.text || '' },
    },
  } as ParsedMessage;
}
```

**Validation**: TypeScript compiles

---

## TASK 2.4: Implement ImapMailManager Class

### Purpose
Main IMAP driver implementing MailManager interface

**File**: `/apps/server/src/lib/driver/imap.ts` (NEW - ~1000 lines)

### Structure Outline

```typescript
import type { MailManager, ManagerConfig, IGetThreadResponse } from './types';
import { connectImap, disconnectImap, openBox } from '../imap-connection';
import { parseImapMessage } from '../imap-utils';
import { threadMessages } from '../imap-threading';
import { EProviders } from '../../types';

export class ImapMailManager implements MailManager {
  constructor(public config: ManagerConfig) {
    // No async initialization - connection happens per-method
  }

  // CRITICAL METHODS (Implement first):
  async get(id: string): Promise<IGetThreadResponse> { }
  async list(params): Promise<IGetThreadsResponse> { }
  async getUserLabels(): Promise<Label[]> { }
  async create(data: IOutgoingMessage): Promise<{id?: string}> { }

  // STUB METHODS (Implement later):
  async count(): Promise<{count: number; label: string}[]> { }
  async markAsRead(ids: string[]): Promise<void> { }
  async markAsUnread(ids: string[]): Promise<void> { }
  async delete(id: string): Promise<void> { }
  async modifyLabels(ids: string[], options): Promise<void> { }

  // OAuth-specific (throw NotImplementedError):
  async getTokens(code: string) { throw new Error('OAuth not supported for IMAP'); }
  async getUserInfo() { throw new Error('OAuth not supported for IMAP'); }
  async getScope() { return 'imap'; }
  async revokeToken() { /* no-op */ }

  // Draft methods:
  async createDraft(data): Promise<{id?: string}> { }
  async getDraft(id: string): Promise<ParsedDraft> { }
  async listDrafts(params): Promise<IGetThreadsResponse> { }
  async sendDraft(id: string, data): Promise<void> { }
  async deleteDraft(id: string): Promise<void> { }

  // Other methods:
  async getAttachment(messageId: string, attachmentId: string) { }
  async getMessageAttachments(id: string) { }
  async getLabel(id: string): Promise<Label> { }
  async createLabel(label): Promise<Label> { }
  async updateLabel(id: string, label): Promise<Label> { }
  async deleteLabel(id: string): Promise<void> { }
  async getEmailAliases() { return [this.config.auth.email]; }
  async deleteAllSpam() { /* IMAP doesn't have bulk spam delete */ }
  async getRawEmail(id: string) { }
  normalizeIds(ids: string[]) { return ids; }
  async listHistory(historyId: string) { return { history: [] }; } // Gmail-specific
}
```

### Key Method Implementations

#### get(id: string) - Get thread by ID

```typescript
async get(id: string): Promise<IGetThreadResponse> {
  const imap = await connectImap({
    host: this.config.imap!.host,
    port: this.config.imap!.port,
    security: this.config.imap!.security,
    user: this.config.auth.email,
    password: this.config.imap!.password,
  });

  const box = await openBox(imap, 'INBOX', true);

  // Fetch message by UID
  const messages = await this.fetchMessagesFromBox(imap, id);
  await disconnectImap(imap);

  if (messages.length === 0) {
    throw new Error(`Thread ${id} not found`);
  }

  return {
    messages,
    latest: messages[messages.length - 1],
    hasUnread: messages.some(m => !m.tags.some(t => t.name === '\\Seen')),
    totalReplies: messages.length,
    labels: [{ id: 'INBOX', name: 'INBOX' }],
    isLatestDraft: false,
  };
}

private async fetchMessagesFromBox(
  imap: Imap,
  range: string,
): Promise<ParsedMessage[]> {
  // Fetch messages using node-imap
  // Parse with mailparser
  // Return ParsedMessage array
  // Implementation: ~100 lines
}
```

#### list(params) - List threads

```typescript
async list(params: {
  folder?: string;
  q?: string;
  maxResults?: number;
  pageToken?: string;
}): Promise<IGetThreadsResponse> {
  const folder = params.folder || 'INBOX';
  const maxResults = params.maxResults || 50;

  const imap = await connectImap(/* ... */);
  const box = await openBox(imap, folder, true);

  const totalMessages = box.messages.total;
  const start = Math.max(1, totalMessages - maxResults + 1);
  const end = totalMessages;

  const messages = await this.fetchMessagesFromBox(imap, `${start}:${end}`);
  await disconnectImap(imap);

  // Apply threading
  const { threads } = threadMessages(messages);

  return {
    threads: Array.from(threads.entries()).map(([threadId, msgs]) => ({
      id: threadId,
      historyId: null,
      $raw: msgs,
    })),
    nextPageToken: null,
  };
}
```

**NOTE**: Full implementation for all 26 methods is ~1000 lines. Start with critical methods, stub others.

---

## TASK 2.5: Register IMAP Driver

### Purpose
Add ImapMailManager to driver factory

**File**: `/apps/server/src/lib/driver/index.ts`

**Action**: Add IMAP to supported providers

**Search for**:
```typescript
const supportedProviders = {
  google: GoogleMailManager,
  microsoft: OutlookMailManager,
};
```

**Replace with**:
```typescript
import { ImapMailManager } from './imap';

const supportedProviders = {
  google: GoogleMailManager,
  microsoft: OutlookMailManager,
  imap: ImapMailManager,
};
```

**Validation**: TypeScript compiles

---

## TASK 2.6: Make createDriver Async

### Purpose
Allow async initialization for IMAP

**File**: `/apps/server/src/lib/driver/index.ts`

**Search for**:
```typescript
export const createDriver = (
  provider: keyof typeof supportedProviders | (string & {}),
  config: ManagerConfig,
): MailManager => {
```

**Replace with**:
```typescript
export const createDriver = async (
  provider: keyof typeof supportedProviders | (string & {}),
  config: ManagerConfig,
  connectionId?: string,
): Promise<MailManager> => {
```

**Also update return**:
```typescript
const Provider = supportedProviders[provider as keyof typeof supportedProviders];
if (!Provider) throw new Error('Provider not supported');

// For IMAP, load connection details
if (provider === 'imap' && connectionId) {
  const { getConnectionFromDb } = await import('../imap-connection-loader');
  const fullConfig = await getConnectionFromDb(connectionId);
  return new Provider(fullConfig);
}

return new Provider(config);
```

**Validation**: TypeScript compiles (will show errors in call sites - fix in Phase 3)

---

## PHASE 2 COMPLETION CHECKLIST

- [ ] `imap-connection.ts` created with connect/disconnect/openBox
- [ ] `imap-threading.ts` created with threading algorithm
- [ ] `imap-utils.ts` created with MIME parsing
- [ ] `ImapMailManager` class created in `driver/imap.ts`
- [ ] Critical methods implemented: `get()`, `list()`, `getUserLabels()`
- [ ] IMAP driver registered in `driver/index.ts`
- [ ] `createDriver` made async
- [ ] TypeScript compiles (ignore call site errors for now)

**Validation**:
```bash
cd /home/code/workspaces/Zero/apps/server
pnpm run typecheck | grep -v "await.*createDriver" # Ignore async migration errors
```

---

## NEXT STEPS

➡️ **Proceed to Phase 3**: `03-phase-authentication-REVISED.md`

**Phase 3 will**: Create TRPC route for IMAP connection creation, fix async createDriver call sites
