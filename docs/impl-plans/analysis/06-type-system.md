# Type System Analysis

**Date**: 2025-10-20
**Status**: ✅ COMPLETED

---

## Executive Summary

Type system documented throughout analysis phases. Key types for IMAP:
- **ParsedMessage** - Individual email format
- **IGetThreadResponse** - Thread with messages
- **MailManager** - Driver interface (26 methods)
- **EProviders** - Add 'imap' enum value

---

## Key Types for IMAP

### ParsedMessage (documented in Phase 0.4)
Required fields for AI:
- `decodedBody` - Plain text (CRITICAL)
- `sender`, `to`, `cc` - Email addresses
- `threadId`, `connectionId` - Identifiers
- `subject`, `receivedOn` - Metadata

### IGetThreadResponse (documented in Phase 0.1)
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

### EProviders Enum
**Location**: `/apps/server/src/types.ts`

**Current**: `'google' | 'microsoft'`
**Add**: `'imap'`

---

## Required Changes

1. **EProviders enum** - Add 'imap'
2. **ManagerConfig** - Make accessToken/refreshToken optional OR add IMAP config
3. **Connection type** - Database schema already analyzed in Phase 0.2

**Complexity**: Trivial
