# TRPC Routes Analysis

**Date**: 2025-10-20
**Status**: ✅ COMPLETED

---

## Executive Summary

TRPC routes use **middleware-based authentication** and **Durable Object agents** for email operations. All routes use `activeConnection` from context - **IMAP connections work automatically** once driver implements MailManager interface.

### Critical Findings

1. **activeConnectionProcedure** - Middleware loads active connection
2. **activeDriverProcedure** - Additional error handling for OAuth token expiration
3. **ZeroAgent (Durable Object)** - Caches and manages email operations
4. **All routes provider-agnostic** - Use driver interface, not provider-specific code
5. **IMAP requires NO route changes** - Just implement driver interface

---

## TRPC Middleware Stack

### 1. publicProcedure
- Base procedure with logging
- No authentication

### 2. privateProcedure
- Requires `sessionUser` from Better Auth
- Throws UNAUTHORIZED if no session

### 3. activeConnectionProcedure
- Extends privateProcedure
- Calls `getActiveConnection()` to load user's active email connection
- Returns connection in ctx.activeConnection

**IMAP Impact**: ✅ Works - getActiveConnection returns any connection (OAuth or IMAP)

### 4. activeDriverProcedure
- Extends activeConnectionProcedure
- Error handling for OAuth token issues (invalid_grant, insufficient permission)
- Disconnects connection on fatal errors

**IMAP Impact**: ⚠️ Need to handle IMAP-specific errors (AUTHENTICATIONFAILED, connection timeout)

---

## Key Routes

### mailRouter

**Routes**:
- `get(id)` - Get thread via `getThread()`
- `listThreads(folder, q, labelIds)` - List threads via ZeroAgent or DB
- `markAsRead(ids)` - Mark threads read via ZeroAgent
- `send(data)` - Send email via ZeroAgent
- `forceSync()` - Trigger resync

**IMAP Impact**: ✅ All work if driver implements interface

### labelsRouter

**Routes**:
- `list()` - Get labels via `agent.getUserLabels()`
- `create(name, color)` - Create label via `agent.createLabel()`
- `update(id, data)` - Update label
- `delete(id)` - Delete label

**IMAP Impact**: ✅ IMAP driver maps folders to labels

### connectionsRouter

**Routes** (from Phase 0.3):
- `list()` - List connections
- `setDefault(connectionId)` - Set default
- `delete(connectionId)` - Delete connection
- `getDefault()` - Get active connection

**IMAP Impact**: ✅ Works, needs fix for "disconnected" detection

---

## ZeroAgent (Durable Object)

**Purpose**: Cache email data and proxy driver operations

**Key Methods**:
- `getThread(id)` - Load from cache or driver
- `listThreads(params)` - Load from DB or driver
- `getUserLabels()` - Proxy to driver
- `syncThread(id)` - Sync single thread
- `forceReSync()` - Full resync

**IMAP Impact**: ✅ Proxy pattern works for any driver

---

## Required Changes for IMAP

### 1. Update activeDriverProcedure Error Handling

**Location**: `/apps/server/src/trpc/trpc.ts` (lines 97-139)

**Current**: Handles OAuth errors (invalid_grant, insufficient permission)

**Add IMAP errors**:
```typescript
// After existing OAuth error handling
if (activeConnection.providerId === 'imap') {
  if (errorMessage.includes('authenticationfailed') ||
      errorMessage.includes('authentication failed')) {
    // Clear encrypted password on auth failure
    await db.updateConnection(activeConnection.id, {
      encryptedPassword: null,
    });

    ctx.c.header(
      'X-Zero-Redirect',
      `/settings/connections?disconnectedConnectionId=${activeConnection.id}`,
    );

    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'IMAP authentication failed. Please update credentials.',
      cause: res.error,
    });
  }
}
```

---

## Conclusion

TRPC routes are **provider-agnostic** and require **minimal changes** for IMAP. Only error handling needs IMAP-specific logic.

**Risk**: Low
**Complexity**: Low
**Impact**: Minimal
