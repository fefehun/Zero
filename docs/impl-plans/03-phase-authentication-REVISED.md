# Phase 3: Authentication & Connection Management - REVISED

**Status**: Ready for Execution
**Estimated Time**: 2-3 hours
**Risk Level**: Medium (Breaking changes)
**Dependencies**: Phase 2 Complete

---

## Overview

Create TRPC route for IMAP connection creation and fix async createDriver call sites.

**Success Criteria**: Users can add IMAP connections via UI, async driver creation works

---

## PRECONDITIONS

- [x] Phase 2 complete
- [ ] ImapMailManager implemented
- [ ] createDriver is async

---

## TASK 3.1: Create connections.createImap Route

**File**: `/apps/server/src/trpc/routes/connections.ts`

**Action**: Add new mutation

```typescript
createImap: privateProcedure
  .input(z.object({
    email: z.string().email(),
    name: z.string().optional(),
    imapHost: z.string(),
    imapPort: z.number().int().positive(),
    imapSecurity: z.enum(['SSL', 'STARTTLS', 'NONE']),
    smtpHost: z.string(),
    smtpPort: z.number().int().positive(),
    smtpSecurity: z.enum(['SSL', 'STARTTLS', 'NONE']),
    password: z.string(),
    testConnection: z.boolean().optional().default(true),
  }))
  .mutation(async ({ input, ctx }) => {
    const { sessionUser } = ctx;
    const db = await getZeroDB(sessionUser.id);

    // Test connection first
    if (input.testConnection) {
      const testImap = await connectImap({
        host: input.imapHost,
        port: input.imapPort,
        security: input.imapSecurity,
        user: input.email,
        password: input.password,
      });
      await disconnectImap(testImap);
    }

    // Encrypt password
    const { encryptPassword } = await import('../../lib/encryption');
    const encryptedPassword = await encryptPassword(input.password, sessionUser.id);

    // Create connection
    const [connection] = await db.createConnection('imap', input.email, {
      name: input.name || input.email,
      picture: null,
      accessToken: null,
      refreshToken: null,
      scope: 'imap',
      expiresAt: new Date('2099-12-31'),
      imapHost: input.imapHost,
      imapPort: input.imapPort,
      imapSecurity: input.imapSecurity,
      smtpHost: input.smtpHost,
      smtpPort: input.smtpPort,
      smtpSecurity: input.smtpSecurity,
      authType: 'password',
      encryptedPassword,
      lastSyncUid: '{}',
    });

    // Enable subscription (polling)
    await env.subscribe_queue.send({
      connectionId: connection.id,
      providerId: 'imap',
    });

    return { success: true, connectionId: connection.id };
  }),
```

---

## TASK 3.2: Fix connectionToDriver (Make Async)

**File**: `/apps/server/src/lib/server-utils.ts` (line 576)

**Replace**:
```typescript
export const connectionToDriver = (activeConnection) => {
  if (!activeConnection.accessToken || !activeConnection.refreshToken) {
    throw new Error(`Invalid connection ${activeConnection?.id}`);
  }

  return createDriver(activeConnection.providerId, {
    auth: { /* ... */ },
  });
};
```

**With**:
```typescript
export const connectionToDriver = async (activeConnection) => {
  // Skip OAuth validation for IMAP
  if (activeConnection.providerId !== 'imap') {
    if (!activeConnection.accessToken || !activeConnection.refreshToken) {
      throw new Error(`Invalid OAuth connection ${activeConnection.id}`);
    }
  }

  return await createDriver(
    activeConnection.providerId,
    {
      auth: {
        userId: activeConnection.userId,
        accessToken: activeConnection.accessToken || '',
        refreshToken: activeConnection.refreshToken || '',
        email: activeConnection.email,
      },
    },
    activeConnection.id, // Pass for IMAP
  );
};
```

---

## TASK 3.3: Fix All createDriver Call Sites

**Files to Update** (add `await`):
1. `/apps/server/src/lib/auth.ts` (line 99)
2. `/apps/server/src/routes/chat.ts`
3. `/apps/server/src/workflows/*-workflow.ts`
4. `/apps/server/src/routes/agent/*.ts`

**Pattern**: Change `const driver = connectionToDriver(conn)` to `const driver = await connectionToDriver(conn)`

**Validation**: TypeScript compiles with no createDriver errors

---

## TASK 3.4: Update connections.list (Fix Disconnected Detection)

**File**: `/apps/server/src/trpc/routes/connections.ts` (line 20)

**Replace**:
```typescript
const disconnectedIds = connections
  .filter((c) => !c.accessToken || !c.refreshToken)
  .map((c) => c.id);
```

**With**:
```typescript
const disconnectedIds = connections
  .filter((c) => {
    if (c.providerId === 'imap') {
      return !c.encryptedPassword;
    }
    return !c.accessToken || !c.refreshToken;
  })
  .map((c) => c.id);
```

---

## PHASE 3 COMPLETION CHECKLIST

- [ ] `connections.createImap` route added
- [ ] `connectionToDriver` is async with conditional validation
- [ ] All createDriver call sites updated (6+ files)
- [ ] `connections.list` fixed for IMAP
- [ ] TypeScript compiles without errors
- [ ] Test IMAP connection creation

---

## NEXT STEPS

➡️ **Proceed to Phase 4**: `04-phase-email-sync-REVISED.md`
