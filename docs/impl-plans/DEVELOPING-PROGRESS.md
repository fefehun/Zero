# IMAP Implementation - Development Progress Tracker

**Status**: ⏳ NOT STARTED
**Started**: TBD
**Completed**: TBD
**Last Updated**: 2025-10-21

---

## Development Methodology

This document tracks the detailed implementation progress for adding IMAP support to the Zero project.

### Goals
1. Execute all 6 implementation phases sequentially
2. Complete all tasks in each phase before moving to next
3. Validate each task completion with explicit checkpoints
4. Commit working code after each phase
5. Track errors and blockers with resolution steps
6. Ensure session continuity across multiple sessions

### Development Phases

- [ ] **Phase 1**: Preparation (30-45 min) - ⏳ NOT STARTED
  - [ ] 1.1: Install Dependencies
  - [ ] 1.2: Update Type Definitions
  - [ ] 1.3: Create Database Migration
  - [ ] 1.4: Create Encryption Utilities
  - [ ] 1.5: Verify Build

- [ ] **Phase 2**: Core IMAP Driver (3-4 hours) - ⏳ NOT STARTED
  - [ ] 2.1: Create IMAP Connection Utilities
  - [ ] 2.2: Create Threading Algorithm
  - [ ] 2.3: Create IMAP Utils (MIME parsing)
  - [ ] 2.4: Implement ImapMailManager (26 methods)
  - [ ] 2.5: Register IMAP Driver
  - [ ] 2.6: Make createDriver Async

- [ ] **Phase 3**: Authentication (2-3 hours) - ⏳ NOT STARTED
  - [ ] 3.1: Create connections.createImap TRPC Route
  - [ ] 3.2: Make connectionToDriver Async
  - [ ] 3.3: Update All createDriver Call Sites
  - [ ] 3.4: Fix connections.list Disconnected Detection

- [ ] **Phase 4**: Email Sync & Subscription (2-3 hours) - ⏳ NOT STARTED
  - [ ] 4.1: Create ImapSubscriptionFactory
  - [ ] 4.2: Register IMAP Factory
  - [ ] 4.3: Create Poll Queue Consumer
  - [ ] 4.4: Update wrangler.toml

- [ ] **Phase 5**: SMTP Email Sending (1-2 hours) - ⏳ NOT STARTED
  - [ ] 5.1: Create SMTP Manager
  - [ ] 5.2: Implement create() in ImapMailManager
  - [ ] 5.3: Implement Draft Methods

- [ ] **Phase 6**: AI Integration & Testing (2-3 hours) - ⏳ NOT STARTED
  - [ ] 6.1: Fix runZeroWorkflow Token Validation
  - [ ] 6.2: Ensure ParsedMessage Compliance
  - [ ] 6.3: Test Workflow Execution
  - [ ] 6.4: Update Error Handling

---

## Progress Tracker

### Phase 1: Preparation (30-45 min)
**Status**: ⏳ NOT STARTED
**Plan Document**: `/home/code/workspaces/Zero/docs/impl-plans/01-phase-preparation-REVISED.md`

#### Task 1.1: Install Dependencies
**Status**: ⏳ NOT STARTED

**Steps**:
1. Navigate to `/home/code/workspaces/Zero/apps/server`
2. Run `pnpm add imap @types/imap mailparser nodemailer @types/nodemailer`
3. Verify installation with `pnpm list imap mailparser nodemailer`

**Validation**:
- [ ] All packages appear in package.json
- [ ] No installation errors
- [ ] Build still succeeds

**Blockers**: None

---

#### Task 1.2: Update Type Definitions
**Status**: ⏳ NOT STARTED

**Steps**:
1. Add 'imap' to EProviders enum in `/apps/server/src/types.ts`
2. Make OAuth fields optional in ManagerConfig (`/apps/server/src/lib/driver/types.ts`)
3. Add IMAP-specific fields to ManagerConfig

**Validation**:
- [ ] TypeScript compiles without errors
- [ ] EProviders includes 'imap'
- [ ] ManagerConfig extended correctly

**Blockers**: None

---

#### Task 1.3: Create Database Migration
**Status**: ⏳ NOT STARTED

**Steps**:
1. Update schema in `/apps/server/src/db/schema.ts`
2. Add 9 new fields to connection table (imapHost, imapPort, etc.)
3. Generate migration: `pnpm db:generate`
4. Apply migration: `pnpm db:migrate`

**Validation**:
- [ ] Migration file generated
- [ ] Migration applied successfully
- [ ] No database errors
- [ ] Existing connections still work

**Blockers**: None

---

#### Task 1.4: Create Encryption Utilities
**Status**: ⏳ NOT STARTED

**Steps**:
1. Create `/apps/server/src/lib/encryption.ts`
2. Implement encryptPassword() and decryptPassword()
3. Test encryption/decryption roundtrip

**Validation**:
- [ ] encryption.ts created
- [ ] Functions export correctly
- [ ] Autumn encryption works
- [ ] Test passes

**Blockers**: None

---

#### Task 1.5: Verify Build
**Status**: ⏳ NOT STARTED

**Steps**:
1. Run `pnpm build` in `/apps/server`
2. Check for TypeScript errors
3. Verify no runtime errors

**Validation**:
- [ ] Build succeeds
- [ ] No type errors
- [ ] No missing dependencies

**Blockers**: None

---

**Phase 1 Completion Checklist**:
- [ ] All tasks completed
- [ ] All validations passed
- [ ] Build succeeds
- [ ] Git commit created

**Git Commit Command**:
```bash
git add .
git commit -m "Phase 1: Preparation complete

- Installed IMAP dependencies (imap, mailparser, nodemailer)
- Extended EProviders enum with 'imap'
- Created database migration for IMAP fields
- Implemented password encryption utilities
- Build verified successfully

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Phase 2: Core IMAP Driver (3-4 hours)
**Status**: ⏳ NOT STARTED
**Plan Document**: `/home/code/workspaces/Zero/docs/impl-plans/02-phase-core-driver-REVISED.md`

#### Task 2.1: Create IMAP Connection Utilities
**Status**: ⏳ NOT STARTED

**File**: `/apps/server/src/lib/imap-connection.ts`

**Validation**:
- [ ] connectImap() works
- [ ] disconnectImap() works
- [ ] openBox() works
- [ ] Error handling implemented

**Blockers**: None

---

#### Task 2.2: Create Threading Algorithm
**Status**: ⏳ NOT STARTED

**File**: `/apps/server/src/lib/imap-threading.ts`

**Validation**:
- [ ] buildThreads() implemented
- [ ] Message-ID/In-Reply-To/References parsing works
- [ ] Thread grouping correct
- [ ] Edge cases handled

**Blockers**: None

---

#### Task 2.3: Create IMAP Utils (MIME parsing)
**Status**: ⏳ NOT STARTED

**File**: `/apps/server/src/lib/imap-utils.ts`

**Validation**:
- [ ] parseImapMessage() works
- [ ] MIME parsing correct
- [ ] Attachments handled
- [ ] HTML/plain text extraction works

**Blockers**: None

---

#### Task 2.4: Implement ImapMailManager (26 methods)
**Status**: ⏳ NOT STARTED

**File**: `/apps/server/src/lib/driver/imap.ts`

**Sub-tasks**:
- [ ] Constructor
- [ ] get(id) - Get thread
- [ ] list(params) - List threads
- [ ] getUserLabels() - Map folders to labels
- [ ] create(data) - Send email (SMTP)
- [ ] createDraft() - Create draft
- [ ] sendDraft() - Send draft
- [ ] getDraft() - Get draft
- [ ] listDrafts() - List drafts
- [ ] deleteDraft() - Delete draft
- [ ] delete() - Delete thread
- [ ] markAsRead() - Mark as read
- [ ] markAsUnread() - Mark as unread
- [ ] modifyLabels() - Modify labels
- [ ] getAttachment() - Get attachment
- [ ] getLabel() - Get label
- [ ] createLabel() - Create label
- [ ] updateLabel() - Update label
- [ ] deleteLabel() - Delete label
- [ ] count() - Count messages
- [ ] normalizeIds() - Normalize IDs
- [ ] getMessageAttachments() - Get attachments
- [ ] getUserInfo() - Get user info
- [ ] getScope() - Get scope (N/A for IMAP)
- [ ] getTokens() - Get tokens (N/A for IMAP)
- [ ] revokeToken() - Revoke token (N/A for IMAP)
- [ ] deleteAllSpam() - Delete spam

**Validation**:
- [ ] All 26 methods implemented
- [ ] No TypeScript errors
- [ ] Basic manual test passes

**Blockers**: None

---

#### Task 2.5: Register IMAP Driver
**Status**: ⏳ NOT STARTED

**File**: `/apps/server/src/lib/driver/index.ts`

**Validation**:
- [ ] ImapMailManager imported
- [ ] Registered in supportedProviders
- [ ] Factory returns correct instance

**Blockers**: None

---

#### Task 2.6: Make createDriver Async
**Status**: ⏳ NOT STARTED

**Files Modified**:
- `/apps/server/src/lib/driver/index.ts`
- `/apps/server/src/lib/server-utils.ts` (connectionToDriver)

**Validation**:
- [ ] createDriver returns Promise<MailManager>
- [ ] connectionToDriver is async
- [ ] No breaking changes yet (will fix call sites in Phase 3)

**Blockers**: None

---

**Phase 2 Completion Checklist**:
- [ ] All tasks completed
- [ ] All 26 MailManager methods implemented
- [ ] Build succeeds
- [ ] Basic IMAP connection test passes
- [ ] Git commit created

**Git Commit Command**:
```bash
git add .
git commit -m "Phase 2: Core IMAP driver implementation

- Created IMAP connection utilities (imap-connection.ts)
- Implemented threading algorithm (imap-threading.ts)
- Created MIME parsing utilities (imap-utils.ts)
- Implemented ImapMailManager with all 26 MailManager methods
- Registered IMAP driver in factory
- Made createDriver async

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Phase 3: Authentication (2-3 hours)
**Status**: ⏳ NOT STARTED
**Plan Document**: `/home/code/workspaces/Zero/docs/impl-plans/03-phase-authentication-REVISED.md`

#### Task 3.1: Create connections.createImap TRPC Route
**Status**: ⏳ NOT STARTED

**File**: `/apps/server/src/trpc/routes/connections.ts`

**Validation**:
- [ ] Route created
- [ ] Password encryption works
- [ ] IMAP connection test works
- [ ] Connection record created in DB
- [ ] Subscription triggered

**Blockers**: None

---

#### Task 3.2: Make connectionToDriver Async
**Status**: ⏳ NOT STARTED

**File**: `/apps/server/src/lib/server-utils.ts`

**Validation**:
- [ ] Function signature is async
- [ ] Conditional OAuth validation added
- [ ] Returns Promise<MailManager>

**Blockers**: None

---

#### Task 3.3: Update All createDriver Call Sites
**Status**: ⏳ NOT STARTED

**Files to Update**:
- [ ] `/apps/server/src/lib/auth.ts`
- [ ] `/apps/server/src/trpc/routes/chat.ts`
- [ ] `/apps/server/src/workflows/*.ts`
- [ ] `/apps/server/src/trpc/routes/agent/*.ts`
- [ ] Other files found via grep

**Validation**:
- [ ] All call sites updated with await
- [ ] No TypeScript errors
- [ ] Build succeeds

**Blockers**: None

---

#### Task 3.4: Fix connections.list Disconnected Detection
**Status**: ⏳ NOT STARTED

**File**: `/apps/server/src/trpc/routes/connections.ts`

**Validation**:
- [ ] Conditional token check for IMAP
- [ ] OAuth connections still work
- [ ] IMAP connections show correct status

**Blockers**: None

---

**Phase 3 Completion Checklist**:
- [ ] All tasks completed
- [ ] TRPC route works
- [ ] All call sites updated
- [ ] Build succeeds
- [ ] Manual test: create IMAP connection
- [ ] Git commit created

**Git Commit Command**:
```bash
git add .
git commit -m "Phase 3: IMAP authentication integration

- Created connections.createImap TRPC mutation
- Made connectionToDriver async with conditional OAuth validation
- Updated all createDriver call sites (6+ files)
- Fixed connections.list for IMAP provider detection
- IMAP connections can now be created via API

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Phase 4: Email Sync & Subscription (2-3 hours)
**Status**: ⏳ NOT STARTED
**Plan Document**: `/home/code/workspaces/Zero/docs/impl-plans/04-phase-email-sync-REVISED.md`

#### Task 4.1: Create ImapSubscriptionFactory
**Status**: ⏳ NOT STARTED

**File**: `/apps/server/src/lib/factories/imap-subscription.factory.ts`

**Validation**:
- [ ] Factory created
- [ ] subscribe() implemented
- [ ] unsubscribe() implemented
- [ ] verifyToken() implemented

**Blockers**: None

---

#### Task 4.2: Register IMAP Factory
**Status**: ⏳ NOT STARTED

**File**: `/apps/server/src/lib/factories/subscription-factory.registry.ts`

**Validation**:
- [ ] Factory imported
- [ ] Registered in registry
- [ ] Factory accessible via EProviders.imap

**Blockers**: None

---

#### Task 4.3: Create Poll Queue Consumer
**Status**: ⏳ NOT STARTED

**File**: `/apps/server/src/workers/imap-poll-consumer.ts`

**Validation**:
- [ ] Consumer created
- [ ] Poll logic implemented
- [ ] Workflow triggering works
- [ ] Re-enqueue logic works

**Blockers**: None

---

#### Task 4.4: Update wrangler.toml
**Status**: ⏳ NOT STARTED

**File**: `wrangler.toml`

**Validation**:
- [ ] Queue configuration added
- [ ] Consumer configured
- [ ] No syntax errors

**Blockers**: None

---

**Phase 4 Completion Checklist**:
- [ ] All tasks completed
- [ ] Factory registered
- [ ] Queue consumer works
- [ ] Manual test: polling triggers
- [ ] Git commit created

**Git Commit Command**:
```bash
git add .
git commit -m "Phase 4: IMAP email sync and subscription

- Created ImapSubscriptionFactory with polling mechanism
- Registered IMAP factory in registry
- Created IMAP poll queue consumer
- Updated wrangler.toml with queue configuration
- IMAP connections now poll for new messages every 5 minutes

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Phase 5: SMTP Email Sending (1-2 hours)
**Status**: ⏳ NOT STARTED
**Plan Document**: `/home/code/workspaces/Zero/docs/impl-plans/05-phase-smtp-send-REVISED.md`

#### Task 5.1: Create SMTP Manager
**Status**: ⏳ NOT STARTED

**File**: `/apps/server/src/lib/driver/smtp-manager.ts`

**Validation**:
- [ ] SmtpManager created
- [ ] sendEmail() works
- [ ] OAuth and password auth supported
- [ ] TLS/STARTTLS works

**Blockers**: None

---

#### Task 5.2: Implement create() in ImapMailManager
**Status**: ⏳ NOT STARTED

**File**: `/apps/server/src/lib/driver/imap.ts`

**Validation**:
- [ ] create() implemented
- [ ] SMTP sending works
- [ ] Email appears in Sent folder

**Blockers**: None

---

#### Task 5.3: Implement Draft Methods
**Status**: ⏳ NOT STARTED

**File**: `/apps/server/src/lib/driver/imap.ts`

**Methods**:
- [ ] createDraft()
- [ ] getDraft()
- [ ] listDrafts()
- [ ] sendDraft()
- [ ] deleteDraft()

**Validation**:
- [ ] All draft methods work
- [ ] Drafts saved to IMAP
- [ ] Drafts can be sent via SMTP

**Blockers**: None

---

**Phase 5 Completion Checklist**:
- [ ] All tasks completed
- [ ] SMTP sending works
- [ ] Draft management works
- [ ] Manual test: send email
- [ ] Git commit created

**Git Commit Command**:
```bash
git add .
git commit -m "Phase 5: SMTP email sending

- Created SmtpManager for email sending
- Implemented create() method in ImapMailManager
- Implemented all draft methods (create, send, delete)
- IMAP connections can now send emails via SMTP
- Draft management fully functional

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Phase 6: AI Integration & Testing (2-3 hours)
**Status**: ⏳ NOT STARTED
**Plan Document**: `/home/code/workspaces/Zero/docs/impl-plans/06-phase-ai-integration-REVISED.md`

#### Task 6.1: Fix runZeroWorkflow Token Validation
**Status**: ⏳ NOT STARTED

**File**: `/apps/server/src/pipelines.ts`

**Validation**:
- [ ] Token validation conditional for IMAP
- [ ] OAuth workflows still work
- [ ] IMAP workflows trigger correctly

**Blockers**: None

---

#### Task 6.2: Ensure ParsedMessage Compliance
**Status**: ⏳ NOT STARTED

**Validation**:
- [ ] decodedBody present (plain text)
- [ ] sender, to, cc correct
- [ ] threadId computed correctly
- [ ] connectionId set
- [ ] receivedOn is ISO date

**Blockers**: None

---

#### Task 6.3: Test Workflow Execution
**Status**: ⏳ NOT STARTED

**Test Scenario**:
1. Create test IMAP connection
2. Send test email to IMAP account
3. Trigger poll
4. Verify message synced
5. Verify thread created
6. Verify summary generated
7. Verify vector stored
8. Verify automatic draft created (if needed)

**Validation**:
- [ ] Message synced
- [ ] Thread created
- [ ] Summary generated
- [ ] Vector stored
- [ ] Draft created (if applicable)

**Blockers**: None

---

#### Task 6.4: Update Error Handling
**Status**: ⏳ NOT STARTED

**File**: `/apps/server/src/trpc/trpc.ts`

**Validation**:
- [ ] IMAP error handling added
- [ ] Authentication errors caught
- [ ] Password cleared on auth failure

**Blockers**: None

---

**Phase 6 Completion Checklist**:
- [ ] All tasks completed
- [ ] AI workflows work with IMAP
- [ ] End-to-end test passed
- [ ] Error handling verified
- [ ] Git commit created

**Git Commit Command**:
```bash
git add .
git commit -m "Phase 6: AI integration and testing complete

- Fixed runZeroWorkflow token validation for IMAP
- Verified ParsedMessage compliance
- Tested complete workflow execution
- Added IMAP-specific error handling
- End-to-end test passed: IMAP → AI summary → draft generation

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Final Validation

### Complete Test Scenario

- [ ] Add Gmail IMAP connection via UI
- [ ] Connection appears in list
- [ ] Send test email to Gmail
- [ ] Poll triggers, fetches email
- [ ] Thread appears in inbox
- [ ] Summary generated
- [ ] Can read email in UI
- [ ] Can reply to email
- [ ] Reply sent via SMTP
- [ ] AI draft generated for incoming question

### Success Criteria

**Technical Success**:
- [ ] IMAP connections can be created via UI
- [ ] Emails received via IMAP polling
- [ ] Emails sent via SMTP
- [ ] AI summaries generated for IMAP messages
- [ ] Automatic drafts created
- [ ] Labels/folders work correctly
- [ ] All 26 MailManager methods implemented
- [ ] TypeScript compiles without errors
- [ ] All tests pass

**User Success**:
- [ ] Users can add Gmail via IMAP
- [ ] Users can add Outlook via IMAP
- [ ] Users can add custom IMAP servers
- [ ] Email experience identical to OAuth connections
- [ ] AI features work seamlessly
- [ ] No data loss or corruption

---

## Session Continuity

### How to Resume Development After Session Break

1. Read this `DEVELOPING-PROGRESS.md` file
2. Check the "Progress Tracker" section
3. Find the last task marked as ✅ COMPLETED
4. Find the first task marked as ⏳ NOT STARTED or 🔄 IN PROGRESS
5. Resume from that task
6. Update status when starting: ⏳ → 🔄
7. Update status when complete: 🔄 → ✅
8. Move to next task

### Status Markers
- ⏳ NOT STARTED
- 🔄 IN PROGRESS
- ✅ COMPLETED
- ❌ BLOCKED (with reason in Blockers field)

---

## Error Handling Protocol

### If Task Fails

1. **Document the error**:
   - Update task status to ❌ BLOCKED
   - Add error message to Blockers field
   - Do NOT proceed to next task

2. **Attempt resolution**:
   - Check troubleshooting section in phase document
   - Review error message and stack trace
   - Verify prerequisites completed
   - Check for typos or missing steps

3. **If unresolvable**:
   - Document the blocker clearly
   - Mark task as ❌ BLOCKED
   - STOP and report to user
   - Do NOT continue to next phase

### If Phase Fails

1. **Rollback strategy** (see 00-OVERVIEW-REVISED.md):
   - Use git to revert changes
   - Restore database if needed
   - Document rollback in this file

2. **Report to user**:
   - Explain what failed
   - Explain what was attempted
   - Suggest next steps

---

## Commit Strategy

### After Each Phase

1. **Review changes**:
   ```bash
   git status
   git diff
   ```

2. **Stage files**:
   ```bash
   git add .
   ```

3. **Commit with template** (see each phase's commit command above)

4. **Tag phase**:
   ```bash
   git tag phase-N-complete
   ```

5. **Update this file**:
   - Mark phase as ✅ COMPLETED
   - Update Last Updated timestamp
   - Add session notes if needed

---

## Environment Setup Checklist

Before starting development, ensure:

- [ ] Repository cloned: `/home/code/workspaces/Zero`
- [ ] Node.js and pnpm installed
- [ ] Database connection configured in `.env`
- [ ] All planning documents reviewed
- [ ] Test IMAP account credentials available
- [ ] Development server can run

---

## Notes & Discoveries

(This section will be populated during implementation with important patterns, gotcas, or design decisions discovered during development)

---

## Timeline Tracking

**Estimated Total Time**: 11-16 hours

| Phase | Estimated | Actual | Status |
|-------|-----------|--------|--------|
| Phase 1 | 30-45 min | - | ⏳ |
| Phase 2 | 3-4 hours | - | ⏳ |
| Phase 3 | 2-3 hours | - | ⏳ |
| Phase 4 | 2-3 hours | - | ⏳ |
| Phase 5 | 1-2 hours | - | ⏳ |
| Phase 6 | 2-3 hours | - | ⏳ |
| **Total** | **11-16 hours** | **-** | **⏳** |

---

## Next Steps

**To begin implementation**:

1. Read this entire document
2. Review `/home/code/workspaces/Zero/docs/impl-plans/00-OVERVIEW-REVISED.md`
3. Open `/home/code/workspaces/Zero/docs/impl-plans/01-phase-preparation-REVISED.md`
4. Mark Phase 1 as 🔄 IN PROGRESS
5. Begin with Task 1.1
6. Update this file continuously as you progress

**IMPORTANT**:
- Follow phases strictly in order (1 → 2 → 3 → 4 → 5 → 6)
- Complete all validations before proceeding
- Commit after each phase
- Update this tracker after each task
- STOP if blocked, do not continue

---

**Ready to implement!** 🚀

**Start with**: Phase 1, Task 1.1 - Install Dependencies
