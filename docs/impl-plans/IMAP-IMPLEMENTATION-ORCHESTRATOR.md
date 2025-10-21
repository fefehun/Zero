# IMAP Implementation - Orchestrator Workflow

**Purpose**: Orchestrate IMAP/SMTP implementation using specialized agents with automated progress tracking and quality audits.

**Based on**: Multi-agent workflow pattern from wshobson/agents

**Reports Directory**: `/home/code/workspaces/Zero/docs/reports/`

---

## Orchestrator Algorithm

### Execution Loop

For each Phase (1-6):
1. **Read Phase Document** - Load `/docs/impl-plans/{phase-number}-phase-{name}-REVISED.md`
2. **Execute Tasks** - For each task in phase:
   - Invoke specialized agent via Task tool with `subagent_type`
   - Agent produces code/config changes
   - Agent writes report to `docs/reports/phase-{N}/task-{N.M}-{task-name}-report.md`
   - Validate task completion (run validation steps from phase doc)
   - Update `DEVELOPING-PROGRESS.md` (mark task ✅)
3. **Phase Audit** - Invoke audit agent
   - Review all task outputs
   - Verify success criteria met
   - Generate audit report to `docs/reports/phase-{N}/phase-{N}-audit-report.md`
   - If audit fails → STOP, report blockers
4. **Git Commit** - Commit phase with standardized message
5. **Next Phase** - Proceed to next phase or finish

### Pre-Execution Checklist

Before starting orchestration:
- [ ] Repository at `/home/code/workspaces/Zero`
- [ ] Required plugins installed (see below)
- [ ] `docs/reports/` directory created
- [ ] Planning documents reviewed
- [ ] DEVELOPING-PROGRESS.md initialized
- [ ] Test IMAP credentials available

---

## Required Agent Plugins

These plugins are already installed for this project:

```bash
# Already installed via .claude/settings.json:
# - full-stack-orchestration (deployment-engineer, performance-engineer, security-auditor, test-automator)
# - javascript-typescript (javascript-pro, typescript-pro)
# - backend-development (backend-architect, graphql-architect, tdd-orchestrator)
# - database-design (database-architect, sql-pro)
# - code-review-ai (architect-review)
```

**Available Agents**:
- `javascript-typescript::typescript-pro` - TypeScript/Node.js development
- `backend-development::backend-architect` - Backend architecture design
- `database-design::database-architect` - Database schema design
- `database-design::sql-pro` - SQL implementation
- `code-review-ai::architect-review` - Architecture review and code quality
- `full-stack-orchestration::test-automator` - Test generation
- `full-stack-orchestration::security-auditor` - Security audits

---

## Phase 1: Preparation (30-45 min)

**Plan Document**: `/home/code/workspaces/Zero/docs/impl-plans/01-phase-preparation-REVISED.md`

**Reports Directory**: `/home/code/workspaces/Zero/docs/reports/phase-1/`

### Task 1.1: Install Dependencies

**Agent**: `javascript-typescript::typescript-pro`

**Execution**:
```
Use Task tool with subagent_type="javascript-typescript::typescript-pro"
```

**Prompt**:
```
Install IMAP/SMTP dependencies for Zero email project:

Required packages:
- imap + @types/imap (IMAP client)
- mailparser (MIME parsing)
- nodemailer + @types/nodemailer (SMTP client)

Steps:
1. Navigate to /home/code/workspaces/Zero/apps/server
2. Run: pnpm add imap @types/imap mailparser nodemailer @types/nodemailer
3. Verify installation: pnpm list imap mailparser nodemailer
4. Verify build still succeeds: pnpm build

Report to: /home/code/workspaces/Zero/docs/reports/phase-1/task-1.1-dependencies-report.md

Include in report:
- Installation output
- Installed versions
- Build verification result
- Any warnings or errors
```

**Expected Output**:
- Packages installed in package.json
- Build succeeds
- Report file created

**Validation**:
- [ ] All packages in package.json
- [ ] No installation errors
- [ ] Build succeeds
- [ ] Report exists

---

### Task 1.2: Update Type Definitions

**Agent**: `javascript-typescript::typescript-pro`

**Execution**:
```
Use Task tool with subagent_type="javascript-typescript::typescript-pro"
```

**Prompt**:
```
Update TypeScript type definitions for IMAP provider:

Files to modify:
1. /apps/server/src/types.ts
   - Add 'imap' to EProviders enum

2. /apps/server/src/lib/driver/types.ts
   - Make OAuth fields optional in ManagerConfig
   - Add IMAP-specific fields: imapHost, imapPort, imapSecurity, smtpHost, smtpPort, smtpSecurity, encryptedPassword

Reference: /docs/impl-plans/01-phase-preparation-REVISED.md (Task 1.2)

Verify:
- TypeScript compiles without errors: pnpm typecheck
- EProviders includes 'imap'
- ManagerConfig extended correctly

Report to: /home/code/workspaces/Zero/docs/reports/phase-1/task-1.2-types-report.md

Include in report:
- Changes made to each file
- Type definitions added
- Compilation result
- Any type errors resolved
```

**Expected Output**:
- EProviders enum updated
- ManagerConfig extended
- Types compile successfully
- Report file created

**Validation**:
- [ ] TypeScript compiles
- [ ] 'imap' in EProviders
- [ ] ManagerConfig has IMAP fields
- [ ] Report exists

---

### Task 1.3: Create Database Migration

**Agent**: `database-design::database-architect`

**Execution**:
```
Use Task tool with subagent_type="database-design::database-architect"
```

**Prompt**:
```
Create database migration to add IMAP fields to connection table:

File to modify: /apps/server/src/db/schema.ts

Add these fields to connection table:
- imapHost: text('imap_host')
- imapPort: integer('imap_port')
- imapSecurity: text('imap_security').$type<'SSL' | 'STARTTLS' | 'NONE'>()
- smtpHost: text('smtp_host')
- smtpPort: integer('smtp_port')
- smtpSecurity: text('smtp_security').$type<'SSL' | 'STARTTLS' | 'NONE'>()
- authType: text('auth_type').$type<'oauth2' | 'app_password' | 'password'>().default('oauth2')
- encryptedPassword: text('encrypted_password')
- lastSyncUid: text('last_sync_uid')

All fields should be nullable for backward compatibility.

Steps:
1. Update schema.ts
2. Generate migration: pnpm db:generate
3. Review migration SQL
4. Apply migration: pnpm db:migrate
5. Verify existing connections still work

Reference: /docs/impl-plans/analysis/01-database-schema.md

Report to: /home/code/workspaces/Zero/docs/reports/phase-1/task-1.3-migration-report.md

Include in report:
- Schema changes
- Generated migration SQL
- Migration application result
- Backward compatibility verification
```

**Expected Output**:
- Schema updated
- Migration file generated
- Migration applied
- Report file created

**Validation**:
- [ ] Migration file exists
- [ ] Migration applied successfully
- [ ] No database errors
- [ ] Existing connections work
- [ ] Report exists

---

### Task 1.4: Create Encryption Utilities

**Agent**: `backend-development::backend-architect`

**Execution**:
```
Use Task tool with subagent_type="backend-development::backend-architect"
```

**Prompt**:
```
Create password encryption utilities using Autumn encryption:

File to create: /apps/server/src/lib/encryption.ts

Implement two functions:
1. encryptPassword(plainPassword: string, userId: string): Promise<string>
   - Use Autumn.encrypt() with env.AUTUMN_SECRET_KEY
   - Salt with userId for user-specific encryption

2. decryptPassword(encryptedPassword: string, userId: string): Promise<string>
   - Use Autumn.decrypt() with env.AUTUMN_SECRET_KEY
   - Match userId salt

Reference existing Autumn usage in codebase for pattern.

Test:
- Encryption roundtrip (encrypt then decrypt returns original)
- Different users produce different ciphertexts

Reference: /docs/impl-plans/01-phase-preparation-REVISED.md (Task 1.4)

Report to: /home/code/workspaces/Zero/docs/reports/phase-1/task-1.4-encryption-report.md

Include in report:
- Implementation code
- Test results
- Security considerations
- Usage examples
```

**Expected Output**:
- encryption.ts created
- Functions implemented
- Tests pass
- Report file created

**Validation**:
- [ ] File created
- [ ] Functions export correctly
- [ ] Roundtrip test passes
- [ ] Report exists

---

### Task 1.5: Verify Build

**Agent**: `javascript-typescript::typescript-pro`

**Execution**:
```
Use Task tool with subagent_type="javascript-typescript::typescript-pro"
```

**Prompt**:
```
Verify complete build after Phase 1 changes:

Steps:
1. Clean build: pnpm clean (if available)
2. Type check: pnpm typecheck
3. Full build: pnpm build
4. Run tests: pnpm test (if any exist)

Verify:
- No TypeScript errors
- No build errors
- No missing dependencies
- All imports resolve

Report to: /home/code/workspaces/Zero/docs/reports/phase-1/task-1.5-build-verification-report.md

Include in report:
- Build output
- Type check results
- Any warnings or errors
- Bundle size comparison (before/after)
```

**Expected Output**:
- Build succeeds
- No type errors
- Report file created

**Validation**:
- [ ] Build succeeds
- [ ] No type errors
- [ ] No runtime errors
- [ ] Report exists

---

### Phase 1 Audit

**Agent**: `code-review-ai::architect-review`

**Execution**:
```
Use Task tool with subagent_type="code-review-ai::architect-review"
```

**Prompt**:
```
Audit Phase 1 completion for IMAP implementation preparation:

Review artifacts:
1. Read all task reports from /docs/reports/phase-1/task-*.md
2. Verify all Phase 1 success criteria met:
   - Dependencies installed (imap, mailparser, nodemailer)
   - EProviders enum includes 'imap'
   - ManagerConfig extended with IMAP fields
   - Database migration created and applied
   - Encryption utilities implemented and tested
   - Build succeeds without errors

3. Check code quality:
   - TypeScript types properly defined
   - Database schema backward compatible
   - Encryption follows security best practices
   - No regressions introduced

4. Verify DEVELOPING-PROGRESS.md updated:
   - All Phase 1 tasks marked ✅
   - Blockers documented (if any)

Reference: /docs/impl-plans/01-phase-preparation-REVISED.md (Phase 1 Completion Checklist)

Generate audit report to: /home/code/workspaces/Zero/docs/reports/phase-1/phase-1-audit-report.md

Audit report structure:
# Phase 1 Audit Report

## Summary
[PASS/FAIL with overall assessment]

## Task Completion Review
[Review each task 1.1-1.5]

## Success Criteria Verification
[Check each criterion from phase plan]

## Code Quality Assessment
[Review code changes]

## Issues Found
[List any problems]

## Recommendations
[Suggestions for improvement]

## Approval
[Approve to proceed to Phase 2 or block with reasons]
```

**Expected Output**:
- Comprehensive audit report
- PASS/FAIL determination
- Issues identified (if any)

**Validation**:
- [ ] Audit report exists
- [ ] All criteria reviewed
- [ ] Approval given or blockers documented

**Action**:
- If PASS → Proceed to Git Commit
- If FAIL → STOP, fix blockers, re-audit

---

### Phase 1 Git Commit

**Execute after audit PASS**:

```bash
cd /home/code/workspaces/Zero
git add .
git commit -m "Phase 1: Preparation complete

- Installed IMAP dependencies (imap, mailparser, nodemailer)
- Extended EProviders enum with 'imap'
- Created database migration for IMAP fields
- Implemented password encryption utilities
- Build verified successfully
- Phase 1 audit: PASS

Reports: docs/reports/phase-1/

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"

git tag phase-1-complete
```

**Update DEVELOPING-PROGRESS.md**:
- Mark Phase 1: ✅ COMPLETED
- Update Last Updated timestamp
- Add git commit hash to notes

---

## Phase 2: Core IMAP Driver (3-4 hours)

**Plan Document**: `/home/code/workspaces/Zero/docs/impl-plans/02-phase-core-driver-REVISED.md`

**Reports Directory**: `/home/code/workspaces/Zero/docs/reports/phase-2/`

### Task 2.1: Create IMAP Connection Utilities

**Agent**: `backend-development::backend-architect`

**Execution**:
```
Use Task tool with subagent_type="backend-development::backend-architect"
```

**Prompt**:
```
Create IMAP connection utilities for Zero email project:

File to create: /apps/server/src/lib/imap-connection.ts

Implement functions:
1. connectImap(config): Promise<ImapConnection>
   - Create IMAP connection with error handling
   - Support SSL/STARTTLS/NONE security modes
   - Handle authentication (password or OAuth2)
   - Connection pooling consideration

2. disconnectImap(connection): Promise<void>
   - Graceful connection close
   - Cleanup resources

3. openBox(connection, boxName): Promise<Box>
   - Open IMAP folder (INBOX, Sent, etc.)
   - Handle errors (folder not found, permission denied)

4. getBoxes(connection): Promise<Boxes>
   - List all IMAP folders

Error handling:
- Connection timeout
- Authentication failure
- Network errors
- Invalid credentials

Reference: /docs/impl-plans/02-phase-core-driver-REVISED.md (Task 2.1)
Reference: /docs/impl-plans/analysis/00-driver-architecture.md (Gmail/Outlook patterns)

Report to: /home/code/workspaces/Zero/docs/reports/phase-2/task-2.1-imap-connection-report.md

Include in report:
- Implementation approach
- Error handling strategy
- Connection pooling design
- Test scenarios
- Code snippets
```

**Expected Output**:
- imap-connection.ts created (~200 lines)
- All functions implemented
- Error handling robust
- Report file created

**Validation**:
- [ ] connectImap() works
- [ ] disconnectImap() works
- [ ] openBox() works
- [ ] Error handling implemented
- [ ] Report exists

---

### Task 2.2: Create Threading Algorithm

**Agent**: `backend-development::backend-architect`

**Execution**:
```
Use Task tool with subagent_type="backend-development::backend-architect"
```

**Prompt**:
```
Create email threading algorithm for IMAP messages:

File to create: /apps/server/src/lib/imap-threading.ts

Implement:
1. buildThreads(messages: ParsedMessage[]): ThreadGroup[]
   - Parse Message-ID, In-Reply-To, References headers
   - Build thread graph using header relationships
   - Generate threadId from root Message-ID hash
   - Group messages into threads
   - Handle edge cases:
     - Missing Message-ID
     - Broken References chains
     - Circular references
     - Subject-based fallback (Re: prefix)

2. computeThreadId(messageId: string): string
   - Deterministic thread ID generation
   - Hash-based (consistent across sessions)

3. findRootMessage(messages: ParsedMessage[]): ParsedMessage
   - Identify thread root (earliest message)

Threading algorithm reference:
- Message-ID is unique identifier
- In-Reply-To points to parent
- References is full ancestry chain
- Thread ID = hash of root Message-ID

Reference: /docs/impl-plans/02-phase-core-driver-REVISED.md (Task 2.2)
Reference: Gmail threading logic (see analysis docs)

Report to: /home/code/workspaces/Zero/docs/reports/phase-2/task-2.2-threading-report.md

Include in report:
- Threading algorithm explanation
- Edge case handling
- Test cases and results
- Performance considerations
- Example thread graphs
```

**Expected Output**:
- imap-threading.ts created (~300 lines)
- Threading algorithm implemented
- Edge cases handled
- Report file created

**Validation**:
- [ ] buildThreads() implemented
- [ ] Message-ID/In-Reply-To parsing works
- [ ] Thread grouping correct
- [ ] Edge cases handled
- [ ] Report exists

---

### Task 2.3: Create IMAP Utils (MIME Parsing)

**Agent**: `backend-development::backend-architect`

**Execution**:
```
Use Task tool with subagent_type="backend-development::backend-architect"
```

**Prompt**:
```
Create IMAP message parsing utilities:

File to create: /apps/server/src/lib/imap-utils.ts

Implement:
1. parseImapMessage(raw: Buffer): Promise<ParsedMessage>
   - Use mailparser to parse MIME message
   - Extract all required fields for ParsedMessage type
   - CRITICAL: Extract decodedBody (plain text) for AI processing
   - Parse HTML body and convert to plain text if no text/plain part
   - Extract sender, to, cc, bcc
   - Parse date to ISO string
   - Extract Message-ID, In-Reply-To, References headers
   - Handle attachments metadata

2. extractTextBody(parsed): string
   - Get plain text content
   - Fallback: convert HTML to plain text (strip tags)
   - Handle multipart messages

3. extractAttachments(parsed): Attachment[]
   - Extract attachment metadata
   - Don't download content yet (lazy loading)

4. sanitizeHtml(html: string): string
   - Strip dangerous HTML
   - Basic XSS protection

ParsedMessage format compliance:
- decodedBody: plain text (required for AI)
- sender, to, cc: email addresses
- subject: string
- receivedOn: ISO date
- messageId: unique identifier
- headers: Message-ID, In-Reply-To, References

Reference: /docs/impl-plans/02-phase-core-driver-REVISED.md (Task 2.3)
Reference: /docs/impl-plans/analysis/03-brain-ai-pipeline.md (ParsedMessage requirements)

Report to: /home/code/workspaces/Zero/docs/reports/phase-2/task-2.3-imap-utils-report.md

Include in report:
- MIME parsing approach
- Plain text extraction strategy
- Attachment handling
- ParsedMessage compliance verification
- Test cases
```

**Expected Output**:
- imap-utils.ts created (~200 lines)
- MIME parsing works
- ParsedMessage format compliant
- Report file created

**Validation**:
- [ ] parseImapMessage() works
- [ ] decodedBody extracted (plain text)
- [ ] Attachments handled
- [ ] HTML sanitized
- [ ] Report exists

---

### Task 2.4: Implement ImapMailManager (26 Methods)

**Agent**: `backend-development::backend-architect`

**Execution**:
```
Use Task tool with subagent_type="backend-development::backend-architect"
```

**Prompt**:
```
Implement ImapMailManager class implementing MailManager interface:

File to create: /apps/server/src/lib/driver/imap.ts

Implement all 26 MailManager methods:

CRITICAL METHODS (must work):
1. constructor(config: ManagerConfig)
   - Store config with IMAP/SMTP credentials
   - DO NOT connect yet (lazy connection)

2. get(id: string): Promise<IGetThreadResponse>
   - Connect to IMAP
   - Fetch all messages in thread
   - Parse messages using imap-utils
   - Build thread using imap-threading
   - Return thread with messages, latest, hasUnread, labels

3. list(params): Promise<IGetThreadsResponse>
   - Connect to IMAP
   - Fetch message list from INBOX (or specified folder)
   - Apply filters (unread, date range)
   - Build threads
   - Return paginated thread list

4. getUserLabels(): Promise<Label[]>
   - List IMAP folders
   - Map to Label format
   - Standard folders: INBOX, Sent, Drafts, Trash, Spam
   - Custom folders as custom labels

5. create(data: IOutgoingMessage): Promise<{id?: string}>
   - Send email via SMTP (implement in Phase 5)
   - For now: throw new Error('Not implemented - Phase 5')

6. createDraft(data): Promise<{id: string}>
   - IMAP APPEND to Drafts folder
   - Return message ID

7. sendDraft(id, data): Promise<void>
   - Fetch draft from IMAP
   - Send via SMTP (Phase 5)
   - Delete draft

8. markAsRead(threadIds: string[]): Promise<void>
   - Add \\Seen flag to messages

9. markAsUnread(threadIds: string[]): Promise<void>
   - Remove \\Seen flag

10. modifyLabels(id, options): Promise<void>
    - IMAP COPY/MOVE between folders

STUB METHODS (minimal implementation):
11. delete(id) - Move to Trash
12. deleteDraft(id) - Delete draft message
13. getDraft(id) - Fetch draft
14. listDrafts() - List drafts folder
15. count() - Count messages per folder
16. normalizeIds(ids) - Return as-is
17. getAttachment(messageId, attachmentId) - Fetch attachment
18. getLabel(id) - Get folder by name
19. createLabel(label) - CREATE folder
20. updateLabel(id, label) - RENAME folder
21. deleteLabel(id) - DELETE folder
22. getMessageAttachments(id) - List message attachments
23. getRawEmail(id) - Fetch raw RFC822

NOT APPLICABLE TO IMAP (throw error or return empty):
24. getTokens() - N/A for IMAP
25. getUserInfo() - Return email from config
26. getScope() - N/A
27. revokeToken() - N/A
28. deleteAllSpam() - Delete all in Spam folder
29. listHistory() - N/A

Use utilities:
- imap-connection.ts for connection
- imap-threading.ts for threading
- imap-utils.ts for MIME parsing
- encryption.ts for password decryption

Reference: /docs/impl-plans/02-phase-core-driver-REVISED.md (Task 2.4)
Reference: /docs/impl-plans/analysis/00-driver-architecture.md (MailManager interface)

Report to: /home/code/workspaces/Zero/docs/reports/phase-2/task-2.4-imap-manager-report.md

Include in report:
- Implementation approach for each method
- IMAP commands used
- Error handling strategy
- Connection management
- Test results for critical methods
- List of stub vs full implementations
```

**Expected Output**:
- driver/imap.ts created (~1000 lines)
- All 26 methods implemented
- Critical methods fully functional
- Report file created

**Validation**:
- [ ] All 26 methods present
- [ ] get() works
- [ ] list() works
- [ ] getUserLabels() works
- [ ] No TypeScript errors
- [ ] Report exists

---

### Task 2.5: Register IMAP Driver

**Agent**: `javascript-typescript::typescript-pro`

**Execution**:
```
Use Task tool with subagent_type="javascript-typescript::typescript-pro"
```

**Prompt**:
```
Register IMAP driver in driver factory:

File to modify: /apps/server/src/lib/driver/index.ts

Changes:
1. Import ImapMailManager from './imap'
2. Add to supportedProviders object:
   imap: ImapMailManager

Verify:
- Factory can instantiate ImapMailManager
- TypeScript compiles
- No import errors

Reference: /docs/impl-plans/02-phase-core-driver-REVISED.md (Task 2.5)

Report to: /home/code/workspaces/Zero/docs/reports/phase-2/task-2.5-register-driver-report.md

Include in report:
- Changes made
- Verification steps
- Supported providers list
```

**Expected Output**:
- IMAP registered in factory
- Imports work
- Report file created

**Validation**:
- [ ] ImapMailManager imported
- [ ] Registered in supportedProviders
- [ ] Factory returns correct instance
- [ ] Report exists

---

### Task 2.6: Make createDriver Async

**Agent**: `backend-development::backend-architect`

**Execution**:
```
Use Task tool with subagent_type="backend-development::backend-architect"
```

**Prompt**:
```
Refactor createDriver to async function:

Files to modify:
1. /apps/server/src/lib/driver/index.ts
   - Change createDriver signature to async
   - Return Promise<MailManager>
   - Add optional connectionId parameter

2. /apps/server/src/lib/server-utils.ts
   - Make connectionToDriver async
   - Add conditional OAuth token validation (skip for IMAP)

Changes needed:
// BEFORE
export const createDriver = (provider, config): MailManager => {
  return new Provider(config);
};

// AFTER
export const createDriver = async (
  provider,
  config,
  connectionId?: string
): Promise<MailManager> => {
  const Provider = supportedProviders[provider];
  if (!Provider) throw new Error('Provider not supported');
  const manager = new Provider(config);
  // Future: async initialization if needed
  return manager;
};

// connectionToDriver - add conditional validation
export const connectionToDriver = async (activeConnection) => {
  // Skip OAuth validation for IMAP
  if (activeConnection.providerId !== 'imap') {
    if (!activeConnection.accessToken || !activeConnection.refreshToken) {
      throw new Error(`Invalid OAuth connection`);
    }
  }

  return await createDriver(
    activeConnection.providerId,
    {
      auth: {
        userId: activeConnection.userId,
        accessToken: activeConnection.accessToken,
        refreshToken: activeConnection.refreshToken,
        email: activeConnection.email,
      },
      // IMAP-specific fields
      imapHost: activeConnection.imapHost,
      imapPort: activeConnection.imapPort,
      imapSecurity: activeConnection.imapSecurity,
      smtpHost: activeConnection.smtpHost,
      smtpPort: activeConnection.smtpPort,
      smtpSecurity: activeConnection.smtpSecurity,
      encryptedPassword: activeConnection.encryptedPassword,
    },
    activeConnection.id
  );
};

DO NOT update call sites yet (Phase 3 task).

Reference: /docs/impl-plans/02-phase-core-driver-REVISED.md (Task 2.6)
Reference: /docs/impl-plans/analysis/00-driver-architecture.md

Report to: /home/code/workspaces/Zero/docs/reports/phase-2/task-2.6-async-driver-report.md

Include in report:
- Signature changes
- Breaking change impact analysis
- Call sites to update in Phase 3
- Verification that existing code compiles (even if not working yet)
```

**Expected Output**:
- createDriver is async
- connectionToDriver is async with conditional validation
- TypeScript compiles (with warnings about call sites)
- Report file created

**Validation**:
- [ ] createDriver returns Promise<MailManager>
- [ ] connectionToDriver is async
- [ ] Conditional OAuth validation added
- [ ] Report exists

---

### Phase 2 Audit

**Agent**: `code-review-ai::architect-review`

**Execution**:
```
Use Task tool with subagent_type="code-review-ai::architect-review"
```

**Prompt**:
```
Audit Phase 2 completion for IMAP core driver implementation:

Review artifacts:
1. Read all task reports from /docs/reports/phase-2/task-*.md
2. Verify all Phase 2 success criteria met:
   - IMAP connection utilities created (imap-connection.ts)
   - Threading algorithm implemented (imap-threading.ts)
   - MIME parsing utilities created (imap-utils.ts)
   - ImapMailManager implements all 26 MailManager methods
   - IMAP driver registered in factory
   - createDriver is async
   - connectionToDriver is async with conditional validation

3. Code quality review:
   - Error handling comprehensive
   - Threading algorithm handles edge cases
   - ParsedMessage format compliant (decodedBody present)
   - IMAP driver methods correctly implemented
   - TypeScript types correct
   - No security vulnerabilities (password handling)

4. Manual testing verification:
   - Can basic IMAP connection be established? (unit test)
   - Does threading algorithm work on sample data?
   - Does MIME parsing extract plain text correctly?

5. Breaking changes documented:
   - createDriver now async (call sites need updating in Phase 3)
   - List of files to update

Reference: /docs/impl-plans/02-phase-core-driver-REVISED.md (Phase 2 Completion Checklist)

Generate audit report to: /home/code/workspaces/Zero/docs/reports/phase-2/phase-2-audit-report.md

Audit report structure:
# Phase 2 Audit Report

## Summary
[PASS/FAIL with overall assessment]

## Task Completion Review
[Review each task 2.1-2.6]

## Success Criteria Verification
[Check all 26 methods implemented, etc.]

## Code Quality Assessment
[Review IMAP driver implementation]

## Security Review
[Password handling, error exposure]

## Breaking Changes
[List async refactor impacts]

## Manual Testing Results
[If any tests were run]

## Issues Found
[List any problems]

## Recommendations
[Next phase preparation]

## Approval
[Approve to proceed to Phase 3 or block]
```

**Expected Output**:
- Comprehensive audit report
- All 26 methods verified
- Breaking changes documented
- PASS/FAIL determination

**Validation**:
- [ ] Audit report exists
- [ ] All criteria reviewed
- [ ] Breaking changes listed
- [ ] Approval given or blockers documented

**Action**:
- If PASS → Proceed to Git Commit
- If FAIL → STOP, fix blockers, re-audit

---

### Phase 2 Git Commit

**Execute after audit PASS**:

```bash
git add .
git commit -m "Phase 2: Core IMAP driver implementation

- Created IMAP connection utilities (imap-connection.ts)
- Implemented threading algorithm (imap-threading.ts)
- Created MIME parsing utilities (imap-utils.ts)
- Implemented ImapMailManager with all 26 MailManager methods
- Registered IMAP driver in factory
- Made createDriver async
- Phase 2 audit: PASS

Reports: docs/reports/phase-2/

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"

git tag phase-2-complete
```

**Update DEVELOPING-PROGRESS.md**:
- Mark Phase 2: ✅ COMPLETED
- Note breaking changes (async createDriver)
- Update Last Updated timestamp

---

## Phase 3: Authentication (2-3 hours)

**Plan Document**: `/home/code/workspaces/Zero/docs/impl-plans/03-phase-authentication-REVISED.md`

**Reports Directory**: `/home/code/workspaces/Zero/docs/reports/phase-3/`

### Task 3.1: Create connections.createImap TRPC Route

**Agent**: `backend-development::backend-architect`

**Execution**:
```
Use Task tool with subagent_type="backend-development::backend-architect"
```

**Prompt**:
```
Create TRPC mutation for IMAP connection creation:

File to modify: /apps/server/src/trpc/routes/connections.ts

Add new mutation:
createImap: privateProcedure
  .input(z.object({
    email: z.string().email(),
    password: z.string(),
    imapHost: z.string(),
    imapPort: z.number().int().positive(),
    imapSecurity: z.enum(['SSL', 'STARTTLS', 'NONE']),
    smtpHost: z.string(),
    smtpPort: z.number().int().positive(),
    smtpSecurity: z.enum(['SSL', 'STARTTLS', 'NONE']),
    authType: z.enum(['password', 'app_password']).default('password'),
  }))
  .mutation(async ({ input, ctx }) => {
    // 1. Test IMAP connection before saving
    // 2. Encrypt password
    // 3. Create connection record in database
    // 4. Trigger subscription (polling)
    // 5. Return connection
  })

Implementation steps:
1. Test IMAP connection (connectImap from imap-connection.ts)
2. If connection fails, return error with details
3. Encrypt password using encryptPassword() from encryption.ts
4. Create connection record in database
5. Call subscription factory to start polling
6. Return created connection

Error handling:
- Invalid credentials → clear error message
- Connection timeout → helpful message
- Invalid host/port → validation error

Reference: /docs/impl-plans/03-phase-authentication-REVISED.md (Task 3.1)
Reference: /docs/impl-plans/analysis/02-auth-connection-flow.md

Report to: /home/code/workspaces/Zero/docs/reports/phase-3/task-3.1-create-imap-route-report.md

Include in report:
- TRPC mutation implementation
- Connection testing approach
- Error handling scenarios
- Security considerations
- Example usage
```

**Expected Output**:
- createImap mutation added
- Connection testing works
- Password encryption works
- Report file created

**Validation**:
- [ ] Route created
- [ ] Password encryption works
- [ ] Connection test works
- [ ] Database record created
- [ ] Report exists

---

### Task 3.2: Update All createDriver Call Sites

**Agent**: `javascript-typescript::typescript-pro`

**Execution**:
```
Use Task tool with subagent_type="javascript-typescript::typescript-pro"
```

**Prompt**:
```
Update all createDriver call sites to use async/await:

Find all call sites:
grep -r "createDriver" apps/server/src --include="*.ts" | grep -v "export const createDriver"

Files to update (from analysis):
1. /apps/server/src/lib/auth.ts (line 99)
2. /apps/server/src/trpc/routes/chat.ts
3. /apps/server/src/workflows/*.ts
4. /apps/server/src/trpc/routes/agent/*.ts
5. Any other files found

Change pattern:
// BEFORE
const driver = createDriver(provider, config);
await driver.someMethod();

// AFTER
const driver = await createDriver(provider, config);
await driver.someMethod();

Also update all connectionToDriver calls:
// BEFORE
const driver = connectionToDriver(connection);

// AFTER
const driver = await connectionToDriver(connection);

Verify:
- All call sites updated
- TypeScript compiles
- No async function becomes non-async
- Proper error handling maintained

Reference: /docs/impl-plans/03-phase-authentication-REVISED.md (Task 3.3)

Report to: /home/code/workspaces/Zero/docs/reports/phase-3/task-3.2-async-call-sites-report.md

Include in report:
- List of files modified
- Number of call sites updated
- Any compilation errors resolved
- Verification results
```

**Expected Output**:
- All call sites updated
- TypeScript compiles
- Report file created

**Validation**:
- [ ] All call sites updated with await
- [ ] No TypeScript errors
- [ ] Build succeeds
- [ ] Report exists

---

### Task 3.3: Fix connections.list Disconnected Detection

**Agent**: `backend-development::backend-architect`

**Execution**:
```
Use Task tool with subagent_type="backend-development::backend-architect"
```

**Prompt**:
```
Fix connections.list to correctly detect IMAP connection status:

File to modify: /apps/server/src/trpc/routes/connections.ts

Current issue: connections.list checks for accessToken/refreshToken to determine if disconnected.
This fails for IMAP connections (no OAuth tokens).

Fix: Add conditional check:
- OAuth connections (google, microsoft): check tokens
- IMAP connections: check encryptedPassword exists

Pseudocode:
for each connection:
  if (connection.providerId === 'imap') {
    disconnected = !connection.encryptedPassword
  } else {
    disconnected = !connection.accessToken || !connection.refreshToken
  }

Reference: /docs/impl-plans/03-phase-authentication-REVISED.md (Task 3.4)

Report to: /home/code/workspaces/Zero/docs/reports/phase-3/task-3.3-fix-list-report.md

Include in report:
- Code changes
- Logic explanation
- Test results (both OAuth and IMAP connections)
```

**Expected Output**:
- connections.list updated
- Conditional detection works
- Report file created

**Validation**:
- [ ] Conditional token check added
- [ ] OAuth connections still work
- [ ] IMAP connections show correct status
- [ ] Report exists

---

### Phase 3 Audit

**Agent**: `code-review-ai::architect-review`

**Execution**:
```
Use Task tool with subagent_type="code-review-ai::architect-review"
```

**Prompt**:
```
Audit Phase 3 completion for IMAP authentication integration:

Review artifacts:
1. Read all task reports from /docs/reports/phase-3/task-*.md
2. Verify Phase 3 success criteria:
   - connections.createImap TRPC route works
   - Password encryption in route works
   - IMAP connection test before saving works
   - All createDriver call sites updated to async
   - connections.list correctly detects IMAP status
   - Build succeeds
   - Manual test: can create IMAP connection via API

3. Security review:
   - Password never stored plain text
   - Encryption uses proper salt (userId)
   - Connection test doesn't leak credentials in errors
   - TRPC input validation comprehensive

4. Breaking changes verification:
   - All async call sites updated
   - No regressions in OAuth connections
   - Both OAuth and IMAP work simultaneously

Reference: /docs/impl-plans/03-phase-authentication-REVISED.md (Phase 3 Completion Checklist)

Generate audit report to: /home/code/workspaces/Zero/docs/reports/phase-3/phase-3-audit-report.md

Audit structure:
# Phase 3 Audit Report

## Summary
[PASS/FAIL]

## Task Completion Review
[Tasks 3.1-3.3]

## Success Criteria Verification
[All criteria checked]

## Security Review
[Password handling, input validation]

## Integration Testing
[OAuth and IMAP coexistence]

## Issues Found
[Any problems]

## Recommendations
[Phase 4 preparation]

## Approval
[Approve or block]
```

**Expected Output**:
- Audit report
- Security review passed
- PASS/FAIL determination

**Validation**:
- [ ] Audit report exists
- [ ] Security reviewed
- [ ] Manual test passed
- [ ] Approval given or blockers documented

**Action**:
- If PASS → Git Commit
- If FAIL → Fix and re-audit

---

### Phase 3 Git Commit

```bash
git add .
git commit -m "Phase 3: IMAP authentication integration

- Created connections.createImap TRPC mutation
- Updated all createDriver call sites to async/await
- Fixed connections.list for IMAP provider detection
- IMAP connections can now be created via API
- Phase 3 audit: PASS

Reports: docs/reports/phase-3/

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"

git tag phase-3-complete
```

---

## Phase 4: Email Sync & Subscription (2-3 hours)

**Plan Document**: `/home/code/workspaces/Zero/docs/impl-plans/04-phase-email-sync-REVISED.md`

**Reports Directory**: `/home/code/workspaces/Zero/docs/reports/phase-4/`

### Task 4.1: Create ImapSubscriptionFactory

**Agent**: `backend-development::backend-architect`

**Prompt**: [Create ImapSubscriptionFactory with polling mechanism...]

[Similar detailed task structure for 4.1-4.4]

### Phase 4 Audit
[Similar audit structure]

### Phase 4 Git Commit
[Similar commit pattern]

---

## Phase 5: SMTP Email Sending (1-2 hours)

**Plan Document**: `/home/code/workspaces/Zero/docs/impl-plans/05-phase-smtp-send-REVISED.md`

**Reports Directory**: `/home/code/workspaces/Zero/docs/reports/phase-5/`

### Task 5.1: Create SMTP Manager
[Similar structure]

### Task 5.2: Implement create() in ImapMailManager
[Similar structure]

### Task 5.3: Implement Draft Methods
[Similar structure]

### Phase 5 Audit
[Similar audit]

### Phase 5 Git Commit
[Similar commit]

---

## Phase 6: AI Integration & Testing (2-3 hours)

**Plan Document**: `/home/code/workspaces/Zero/docs/impl-plans/06-phase-ai-integration-REVISED.md`

**Reports Directory**: `/home/code/workspaces/Zero/docs/reports/phase-6/`

### Task 6.1: Fix runZeroWorkflow Token Validation

**Agent**: `backend-development::backend-architect`

**Prompt**:
```
Fix workflow token validation for IMAP connections:

File to modify: /apps/server/src/pipelines.ts (line 277)

Change token validation to conditional:
// BEFORE
if (!foundConnection.accessToken || !foundConnection.refreshToken) {
  throw new Error(`Connection is not authorized`);
}

// AFTER
if (foundConnection.providerId !== 'imap') {
  if (!foundConnection.accessToken || !foundConnection.refreshToken) {
    throw new Error(`Connection is not authorized`);
  }
}

This allows IMAP connections to trigger workflows without OAuth tokens.

Reference: /docs/impl-plans/06-phase-ai-integration-REVISED.md (Task 6.1)
Reference: /docs/impl-plans/analysis/03-brain-ai-pipeline.md

Report to: /home/code/workspaces/Zero/docs/reports/phase-6/task-6.1-workflow-fix-report.md
```

### Task 6.2: Ensure ParsedMessage Compliance

**Agent**: `code-review-ai::code-reviewer`

**Prompt**:
```
Verify ImapMailManager returns AI-compliant ParsedMessage:

Review: /apps/server/src/lib/driver/imap.ts (get and list methods)

Check ParsedMessage contains:
- ✅ decodedBody (plain text) - CRITICAL for AI
- ✅ sender, to, cc (email addresses)
- ✅ threadId (computed via threading algorithm)
- ✅ connectionId (set correctly)
- ✅ receivedOn (ISO date string)

Test: Fetch sample IMAP message and verify format.

Reference: /docs/impl-plans/analysis/03-brain-ai-pipeline.md (ParsedMessage requirements)

Report to: /home/code/workspaces/Zero/docs/reports/phase-6/task-6.2-parsedmessage-compliance-report.md
```

### Task 6.3: End-to-End Workflow Test

**Agent**: `full-stack-orchestration::test-automator`

**Execution**:
```
Use Task tool with subagent_type="full-stack-orchestration::test-automator"
```

**Prompt**:
```
Execute complete end-to-end IMAP workflow test:

Test scenario:
1. Create test IMAP connection (use test credentials)
2. Send test email to IMAP account (external tool or SMTP)
3. Trigger polling (manually or wait for scheduled poll)
4. Verify message synced to database
5. Verify thread created
6. Verify AI summary generated
7. Verify vector stored in Vectorize
8. Verify automatic draft created (if email is question/request)

Validation checklist:
- [ ] Message appears in UI
- [ ] Thread grouped correctly
- [ ] Summary accurate
- [ ] Draft quality acceptable (if generated)
- [ ] No errors in logs

Reference: /docs/impl-plans/06-phase-ai-integration-REVISED.md (Task 6.3)

Report to: /home/code/workspaces/Zero/docs/reports/phase-6/task-6.3-e2e-test-report.md

Include:
- Test setup details
- Test execution log
- Screenshots (if UI tested)
- Success/failure for each step
- Any issues found
```

### Task 6.4: Update Error Handling

**Agent**: `backend-development::backend-architect`

**Prompt**:
```
Add IMAP-specific error handling to TRPC middleware:

File to modify: /apps/server/src/trpc/trpc.ts (activeDriverProcedure)

Add IMAP error handling:
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

Handle common IMAP errors:
- Authentication failure
- Connection timeout
- Mailbox not found
- Permission denied

Reference: /docs/impl-plans/06-phase-ai-integration-REVISED.md (Task 6.4)

Report to: /home/code/workspaces/Zero/docs/reports/phase-6/task-6.4-error-handling-report.md
```

### Phase 6 Final Audit

**Agent**: `full-stack-orchestration::security-auditor`

**Execution**:
```
Use Task tool with subagent_type="full-stack-orchestration::security-auditor"
```

**Prompt**:
```
Final comprehensive audit for IMAP implementation:

Review all phases:
1. Read all phase audit reports (phase-1-audit to phase-5-audit)
2. Execute Phase 6 task reviews
3. Run final validation checklist

Final Validation Checklist:
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

Security audit:
- [ ] No plain text passwords
- [ ] Encryption secure
- [ ] No credential leaks in logs
- [ ] IMAP connection properly closed
- [ ] Error messages don't expose sensitive data

Performance check:
- [ ] Initial sync reasonable (< 2 min for 5000 emails)
- [ ] Polling interval appropriate (5 min default)
- [ ] No memory leaks
- [ ] Connection pooling effective

Success criteria (from 00-OVERVIEW-REVISED.md):
Technical Success:
- [ ] IMAP connections can be created via UI
- [ ] Emails received via IMAP polling
- [ ] Emails sent via SMTP
- [ ] AI summaries generated for IMAP messages
- [ ] Automatic drafts created
- [ ] Labels/folders work correctly
- [ ] All 26 MailManager methods implemented
- [ ] TypeScript compiles without errors

User Success:
- [ ] Users can add Gmail via IMAP
- [ ] Users can add Outlook via IMAP
- [ ] Users can add custom IMAP servers
- [ ] Email experience identical to OAuth connections
- [ ] AI features work seamlessly
- [ ] No data loss or corruption

Generate final audit report to: /home/code/workspaces/Zero/docs/reports/phase-6/phase-6-final-audit-report.md

Report structure:
# Phase 6 Final Audit Report

## Executive Summary
[Overall PASS/FAIL for entire IMAP implementation]

## Phase-by-Phase Review
[Summary of each phase audit]

## Final Validation Results
[Complete checklist results]

## Security Audit
[Security review findings]

## Performance Assessment
[Performance metrics]

## Success Criteria Verification
[All criteria from overview doc]

## Known Issues
[Any remaining issues]

## Production Readiness
[Recommendation: READY / NOT READY for production]

## Deployment Recommendations
[Staging → Production rollout plan]

## Approval
[Final sign-off]
```

### Phase 6 Git Commit

```bash
git add .
git commit -m "Phase 6: AI integration and testing complete

- Fixed runZeroWorkflow token validation for IMAP
- Verified ParsedMessage compliance
- Completed end-to-end workflow test
- Added IMAP-specific error handling
- Phase 6 final audit: PASS

🎉 IMAP implementation complete!

Reports: docs/reports/phase-6/

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"

git tag imap-implementation-complete
git tag v1.0.0-imap
```

---

## Post-Implementation

### Final Report Generation

**Agent**: `code-review-ai::architect-review`

**Execution**:
```
Use Task tool with subagent_type="code-review-ai::architect-review"
```

**Prompt**:
```
Generate final implementation summary report:

Compile from all phase reports:
1. Read all reports from docs/reports/phase-*/
2. Summarize implementation
3. Document final architecture
4. List all changes made
5. Create deployment guide

Generate to: /home/code/workspaces/Zero/docs/reports/IMAP-IMPLEMENTATION-SUMMARY.md

Include:
- Total time spent
- Files created (count and list)
- Files modified (count and list)
- Lines of code added
- Success criteria met
- Known limitations
- Future improvements
- Deployment instructions
```

---

## Orchestrator Completion

✅ **IMAP Implementation Complete**

**Deliverables**:
- 6 phases completed
- All tasks executed
- All audits passed
- All reports generated
- Git commits with tags
- Production-ready IMAP support

**Reports Generated**: `~40+ reports` in `/docs/reports/`

**Next Steps**:
1. Deploy to staging environment
2. Test with real IMAP accounts (Gmail, Outlook, custom)
3. Monitor for issues
4. Roll out to production
5. Update user documentation

---

## Troubleshooting

### If Orchestration Fails

1. **Check last completed task** in DEVELOPING-PROGRESS.md
2. **Read last task report** for error details
3. **Check phase audit report** for blockers
4. **Fix blocker** and resume from failed task
5. **Do not proceed** until audit passes

### If Audit Fails

1. **Read audit report** for issues
2. **Fix issues** in code
3. **Re-run failed tasks** to generate new reports
4. **Re-run audit**
5. **Only proceed** when audit passes

### Session Continuity

If session breaks:
1. Read DEVELOPING-PROGRESS.md for last status
2. Find last ✅ completed task
3. Read last task report
4. Resume from next ⏳ NOT STARTED or 🔄 IN PROGRESS task
5. Continue orchestration loop

---

## Notes

- **Do not skip phases** - sequential execution required
- **Do not skip audits** - quality gates are critical
- **Do not skip reports** - documentation is essential
- **Follow commit template** - maintains git history clarity
- **Update DEVELOPING-PROGRESS.md** - after every task

---

**Orchestrator ready for execution!** 🚀
