# Phase 6: AI Integration & Testing - REVISED

**Status**: Ready for Execution
**Estimated Time**: 2-3 hours
**Risk Level**: Low
**Dependencies**: Phase 5 Complete

---

## Overview

Fix workflow integration and test AI pipeline with IMAP messages.

**Success Criteria**: IMAP messages trigger workflows, summaries generated, drafts created

---

## TASK 6.1: Fix runZeroWorkflow Token Validation

**File**: `/apps/server/src/pipelines.ts` (line 277)

**Replace**:
```typescript
if (!foundConnection.accessToken || !foundConnection.refreshToken) {
  throw new Error(`Connection is not authorized`);
}
```

**With**:
```typescript
if (foundConnection.providerId !== 'imap') {
  if (!foundConnection.accessToken || !foundConnection.refreshToken) {
    throw new Error(`Connection is not authorized`);
  }
}
```

---

## TASK 6.2: Ensure ParsedMessage Compliance

Verify ImapMailManager returns ParsedMessage with:
- ✅ `decodedBody` - Plain text (CRITICAL for AI)
- ✅ `sender`, `to`, `cc` - Email addresses
- ✅ `threadId` - Computed via threading algorithm
- ✅ `connectionId` - Set correctly
- ✅ `receivedOn` - ISO date string

---

## TASK 6.3: Test Workflow Execution

1. Create test IMAP connection
2. Send test email to IMAP account
3. Trigger poll
4. Verify:
   - Message synced
   - Thread created
   - Summary generated
   - Vector stored
   - Automatic draft created (if needed)

---

## TASK 6.4: Update Error Handling

**File**: `/apps/server/src/trpc/trpc.ts` (activeDriverProcedure)

Add IMAP error handling:
```typescript
if (activeConnection.providerId === 'imap') {
  if (errorMessage.includes('authenticationfailed')) {
    await db.updateConnection(activeConnection.id, {
      encryptedPassword: null,
    });
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'IMAP authentication failed',
    });
  }
}
```

---

## PHASE 6 COMPLETION CHECKLIST

- [ ] runZeroWorkflow token validation fixed
- [ ] ParsedMessage format verified
- [ ] Workflow execution tested
- [ ] Error handling added
- [ ] End-to-end test passed

---

## FINAL VALIDATION

**Complete Test Scenario**:
1. ✅ Add IMAP connection via UI
2. ✅ Connection appears in list
3. ✅ Send test email to IMAP account
4. ✅ Poll triggers, fetches email
5. ✅ Thread appears in inbox
6. ✅ Summary generated
7. ✅ Can read email in UI
8. ✅ Can reply to email
9. ✅ Reply sent via SMTP
10. ✅ AI draft generated for incoming question

---

## ROLLBACK PROCEDURE

If issues arise, revert in reverse order:
- Phase 6 → Phase 5 → Phase 4 → Phase 3 → Phase 2 → Phase 1

Use git to revert file changes.

---

## SUCCESS

🎉 **IMAP support is now fully implemented!**

Users can now:
- Add IMAP/SMTP connections
- Receive emails via IMAP polling
- Send emails via SMTP
- Use AI features (summaries, drafts, etc.)
- Manage labels (IMAP folders)

**Next**: Deploy to staging, test with real IMAP accounts (Gmail, Outlook, custom servers)
