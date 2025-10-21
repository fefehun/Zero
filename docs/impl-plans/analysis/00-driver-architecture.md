# Driver Architecture Analysis

**Date**: 2025-10-20
**Status**: ✅ COMPLETED

---

## Executive Summary

The current driver architecture uses a **synchronous factory pattern** with provider-specific implementations (Google, Microsoft). The system is designed for OAuth-based email providers and would require **significant refactoring** to support IMAP.

### Critical Findings

1. **`createDriver` is synchronous** - Cannot load IMAP connection details from database
2. **`ManagerConfig` lacks connectionId** - Cannot retrieve connection-specific settings
3. **`connectionToDriver` widely used** - Breaking change affects 6+ files
4. **OAuth assumption** - accessToken/refreshToken in ManagerConfig not suitable for IMAP

---

## Current Architecture

### Driver Factory (`driver/index.ts`)

```typescript
const supportedProviders = {
  google: GoogleMailManager,
  microsoft: OutlookMailManager,
};

export const createDriver = (
  provider: keyof typeof supportedProviders | (string & {}),
  config: ManagerConfig,
): MailManager => {
  const Provider = supportedProviders[provider as keyof typeof supportedProviders];
  if (!Provider) throw new Error('Provider not supported');
  return new Provider(config);
};
```

**Characteristics**:
- Synchronous function
- Simple class instantiation
- No database access
- No async initialization

---

## ManagerConfig Structure

```typescript
export type ManagerConfig = {
  auth: {
    userId: string;
    accessToken: string;
    refreshToken: string;
    email: string;
  };
};
```

**Problems for IMAP**:
- ❌ No `connectionId` field
- ❌ Assumes OAuth tokens
- ❌ Missing IMAP-specific fields:
  - `imapHost`
  - `imapPort`
  - `imapSecurity`
  - `smtpHost`
  - `smtpPort`
  - `smtpSecurity`
  - `authType` (oauth2/password/app_password)
  - `encryptedPassword`

---

## MailManager Interface

**Location**: `/apps/server/src/lib/driver/types.ts`

**Total Methods**: 26

### Core Email Operations
- `get(id)` - Get thread by ID
- `list(params)` - List threads in folder
- `count()` - Count messages per label
- `listHistory(historyId)` - Get history changes (Gmail-specific)

### Message Operations
- `getMessageAttachments(id)`
- `getAttachment(messageId, attachmentId)`
- `getRawEmail(id)`

### Sending Operations
- `create(data)` - Send new email
- `sendDraft(id, data)` - Send existing draft
- `createDraft(data)` - Create draft
- `getDraft(id)` - Get draft
- `listDrafts(params)` - List drafts
- `deleteDraft(id)` - Delete draft

### Modification Operations
- `markAsRead(threadIds[])`
- `markAsUnread(threadIds[])`
- `modifyLabels(id[], options)`
- `delete(id)` - Delete thread
- `deleteAllSpam()` - Bulk delete spam

### Label Operations
- `getUserLabels()` - Get all labels
- `getLabel(id)` - Get specific label
- `createLabel(label)` - Create new label
- `updateLabel(id, label)` - Update label
- `deleteLabel(id)` - Delete label

### Authentication & Info
- `getTokens(code)` - Exchange OAuth code for tokens
- `getUserInfo(tokens?)` - Get user profile
- `getScope()` - Get required OAuth scopes
- `revokeToken(token)` - Revoke access token
- `getEmailAliases()` - Get email aliases

### Utility
- `normalizeIds(id[])` - Normalize thread IDs

---

## Provider Implementations

### GoogleMailManager

**Location**: `/apps/server/src/lib/driver/google.ts`

**Constructor**:
```typescript
constructor(public config: ManagerConfig) {
  this.auth = new OAuth2Client(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET);

  if (config.auth)
    this.auth.setCredentials({
      refresh_token: config.auth.refreshToken,
      scope: this.getScope(),
    });

  this.gmail = gmail({ version: 'v1', auth: this.auth });
}
```

**Characteristics**:
- Synchronous initialization
- Uses Google OAuth2Client
- Credentials set from ManagerConfig
- Gmail API client initialized immediately

**Error Handling**:
- Uses `withErrorHandler` wrapper
- Catches OAuth errors
- Supports fatal error detection (invalid_grant)

---

### OutlookMailManager

**Location**: `/apps/server/src/lib/driver/microsoft.ts`

**Constructor**:
```typescript
constructor(public config: ManagerConfig) {
  const getAccessToken = async () => {
    const c = getContext<HonoContext>();
    const data = await c.var.auth.api.getAccessToken({
      body: {
        providerId: 'microsoft',
        userId: config.auth.userId,
      },
      headers: c.req.raw.headers,
    });
    if (!data.accessToken) throw new Error('Failed to get access token');
    return data.accessToken;
  };

  this.graphClient = Client.initWithMiddleware({
    authProvider: { getAccessToken },
  });
}
```

**Characteristics**:
- Synchronous constructor
- **Async token fetching** during API calls
- Uses Hono context for auth
- Microsoft Graph Client

**Important**: Token refresh happens lazily during API calls, not at construction time.

---

## Integration Points

### 1. connectionToDriver (`server-utils.ts:576`)

**MOST CRITICAL INTEGRATION POINT**

```typescript
export const connectionToDriver = (activeConnection: typeof connection.$inferSelect) => {
  if (!activeConnection.accessToken || !activeConnection.refreshToken) {
    throw new Error(`Invalid connection ${JSON.stringify(activeConnection?.id)}`);
  }

  return createDriver(activeConnection.providerId, {
    auth: {
      userId: activeConnection.userId,
      accessToken: activeConnection.accessToken,
      refreshToken: activeConnection.refreshToken,
      email: activeConnection.email,
    },
  });
};
```

**Used In** (6 files via grep):
1. `routes/chat.ts`
2. `workflows/sync-threads-coordinator-workflow.ts`
3. `workflows/sync-threads-workflow.ts`
4. `routes/agent/index.ts`
5. `routes/agent/sync-worker.ts`
6. `lib/server-utils.ts`

**Purpose**:
- Converts database connection record to MailManager driver
- Primary way drivers are instantiated throughout the app

**Impact of Changes**:
- ⚠️ Making this async would require updating ALL 6 usage locations
- ⚠️ ALL callers would need to become async
- ⚠️ Potential cascade of async refactoring

---

### 2. connectionHandlerHook (`auth.ts:91`)

**OAuth Connection Creation**

```typescript
const driver = createDriver(account.providerId, {
  auth: {
    accessToken: account.accessToken,
    refreshToken: account.refreshToken,
    userId: account.userId,
    email: '',
  },
});

const userInfo = await driver.getUserInfo();
```

**Called**: During OAuth callback when new connection is being created

**Flow**:
1. User completes OAuth flow
2. Better Auth calls this hook
3. Driver created to fetch user info
4. Connection saved to database
5. Subscription queue triggered

**IMAP Consideration**:
- IMAP connections won't use OAuth flow
- Need separate connection creation path
- Must handle password encryption (Autumn)

---

## Shared Utilities (`driver/utils.ts`)

### Error Handling
- `StandardizedError` class
- `sanitizeContext()` - Redacts sensitive data
- `FatalErrors` array for non-recoverable errors
- `deleteActiveConnection()` - Cleanup on fatal error

### Data Transformation
- `fromBase64Url()` - Convert base64url to base64
- `fromBinary()` - Decode binary strings
- `findHtmlBody()` - Extract HTML from MIME parts
- `getSimpleLoginSender()` - Parse forwarded email headers

**Reusability for IMAP**:
- ✅ Error handling can be reused
- ✅ Base64 utilities useful for IMAP attachments
- ❌ MIME parsing not present (need mailparser library)

---

## Type System

### IGetThreadResponse
```typescript
{
  messages: ParsedMessage[];
  latest?: ParsedMessage;
  hasUnread: boolean;
  totalReplies: number;
  labels: { id: string; name: string }[];
  isLatestDraft?: boolean;
}
```

### IGetThreadsResponse
```typescript
{
  threads: { id: string; historyId: string | null; $raw?: unknown }[];
  nextPageToken: string | null;
}
```

### ParsedDraft
```typescript
{
  id: string;
  to?: string[];
  subject?: string;
  content?: string;
  rawMessage?: { internalDate?: string | null };
  cc?: string[];
  bcc?: string[];
}
```

**IMAP Compatibility**:
- ✅ IGetThreadResponse structure compatible
- ✅ ParsedDraft compatible
- ❌ `historyId` not applicable to IMAP (always null)
- ✅ `$raw` field can store IMAP-specific data

---

## Required Changes for IMAP Support

### 1. Make createDriver Async ⚠️ BREAKING CHANGE

```typescript
// BEFORE
export const createDriver = (provider, config): MailManager => { }

// AFTER
export const createDriver = async (
  provider,
  config,
  connectionId?: string
): Promise<MailManager> => { }
```

**Impact**:
- Update ALL call sites (6+ files)
- Add `await` to all invocations
- Make all caller functions async

**Files to Update**:
- `lib/server-utils.ts` - connectionToDriver
- `lib/auth.ts` - connectionHandlerHook
- `routes/chat.ts`
- `workflows/sync-threads-coordinator-workflow.ts`
- `workflows/sync-threads-workflow.ts`
- `routes/agent/index.ts`
- `routes/agent/sync-worker.ts`

---

### 2. Extend ManagerConfig OR Create ImapConfig

**Option A: Extend ManagerConfig** (Non-breaking)
```typescript
export type ManagerConfig = {
  auth: {
    userId: string;
    accessToken: string;      // Optional for IMAP
    refreshToken: string;     // Optional for IMAP
    email: string;
  };
  // IMAP-specific (optional)
  imap?: {
    host: string;
    port: number;
    security: 'SSL' | 'STARTTLS' | 'NONE';
    password: string;         // Decrypted
  };
  smtp?: {
    host: string;
    port: number;
    security: 'SSL' | 'STARTTLS' | 'NONE';
  };
};
```

**Option B: Separate ImapConfig** (Cleaner)
```typescript
export type ImapConfig = {
  userId: string;
  email: string;
  imap: {
    host: string;
    port: number;
    security: 'SSL' | 'STARTTLS' | 'NONE';
    password: string;
  };
  smtp: {
    host: string;
    port: number;
    security: 'SSL' | 'STARTTLS' | 'NONE';
  };
};
```

**Recommendation**: Option A (extend ManagerConfig) for backward compatibility

---

### 3. Add connectionId to createDriver

```typescript
export const createDriver = async (
  provider: string,
  config: ManagerConfig,
  connectionId?: string,  // NEW: For IMAP to load from DB
): Promise<MailManager> => {
  if (provider === 'imap') {
    if (!connectionId) throw new Error('connectionId required for IMAP');
    // Load connection details from DB
    // Decrypt password
    // Return ImapMailManager
  }

  // Existing logic for google/microsoft
}
```

---

### 4. Update connectionToDriver to be Async

```typescript
// BEFORE
export const connectionToDriver = (activeConnection) => {
  return createDriver(activeConnection.providerId, { ... });
};

// AFTER
export const connectionToDriver = async (activeConnection) => {
  return await createDriver(
    activeConnection.providerId,
    { ... },
    activeConnection.id  // Pass connectionId for IMAP
  );
};
```

---

## IMAP-Specific Considerations

### Constructor Pattern
- IMAP connection requires async initialization
- Cannot connect to IMAP server in constructor
- Must use separate `connect()` method or lazy connection

### Connection Pooling
- IMAP connections are stateful
- Need connection pooling strategy
- Consider max connections per user

### Error Handling
- IMAP-specific errors different from OAuth errors
- Connection timeouts
- Authentication failures
- Folder not found errors

### Method Implementations

**Not Applicable to IMAP**:
- `listHistory()` - Gmail-specific, return empty/throw
- `getTokens()` - OAuth-specific, throw error
- `revokeToken()` - OAuth-specific, no-op

**IMAP-Specific Implementations**:
- `getUserLabels()` - Map IMAP folders to labels
- `modifyLabels()` - COPY/MOVE messages between folders
- `createLabel()` - CREATE folder
- `deleteLabel()` - DELETE folder

---

## Dependency Analysis

### External Libraries Used
- `@googleapis/gmail` (GoogleMailManager)
- `@googleapis/people` (GoogleMailManager)
- `google-auth-library` (OAuth2Client)
- `@microsoft/microsoft-graph-client` (OutlookMailManager)
- `@microsoft/microsoft-graph-types` (Type definitions)

### Required for IMAP
- `imap` or `node-imap` - IMAP client
- `nodemailer` - SMTP client
- `mailparser` - Parse MIME messages
- `mimetext` - Already installed, create MIME messages

---

## Testing Impact

### Current Tests
- Grep for test files: (none found in analysis)
- Likely integration tests exist elsewhere

### IMAP Testing Needs
- Mock IMAP server for unit tests
- Integration tests with real IMAP servers (Gmail, Outlook, custom)
- Connection pooling tests
- Error handling tests
- Threading algorithm tests

---

## Recommendations

### Phase 1: Minimal Breaking Changes
1. Add `connectionId` as optional parameter to `createDriver`
2. Keep createDriver synchronous initially
3. Add ImapMailManager stub
4. Test with stub before full implementation

### Phase 2: Full Async Refactor
1. Make createDriver async
2. Update all call sites
3. Update connectionToDriver
4. Ensure all async paths tested

### Phase 3: IMAP Implementation
1. Implement ImapMailManager
2. Add connection loading logic
3. Implement IMAP-specific methods
4. Integration testing

---

## Conclusion

The driver architecture is **well-structured** but **not designed for IMAP**. The synchronous factory pattern and OAuth assumptions require refactoring. The impact is **significant** due to widespread `connectionToDriver` usage.

**Estimated Refactoring Scope**:
- **Files to modify**: 10-15
- **Lines of code**: 200-300
- **Risk**: Medium (breaking changes, but contained)
- **Test coverage needed**: High

**Next Steps**:
1. Complete database schema analysis
2. Map exact connection record structure
3. Design IMAP-specific configuration
4. Create detailed migration plan
