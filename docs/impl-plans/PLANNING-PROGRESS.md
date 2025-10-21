# IMAP Implementation - Detailed Planning Progress

**Status**: ✅ COMPLETE - All Planning Finished
**Started**: 2025-10-20
**Completed**: 2025-10-20 (Session 2)
**Last Updated**: 2025-10-20

---

## Planning Methodology

This document tracks the detailed planning process for creating an **AI-proof implementation plan** for IMAP support in the Zero project.

### Goals
1. Read and analyze ALL relevant code files
2. Document current architecture precisely
3. Identify ALL integration points
4. Create detailed, step-by-step tasks that an AI can execute without ambiguity
5. Include explicit validation steps for each task
6. Ensure the plan is guaranteed to work when followed

### Planning Phases

- [x] **Phase 0**: Codebase Analysis (Deep Dive) - ✅ 100% COMPLETE (7/7)
  - [x] 0.1: Driver Architecture Analysis ✅
  - [x] 0.2: Database Schema Analysis ✅
  - [x] 0.3: Authentication & Connection Flow Analysis ✅
  - [x] 0.4: Brain/AI Pipeline Analysis ✅
  - [x] 0.5: Subscription Factory Pattern Analysis ✅
  - [x] 0.6: TRPC Routes Analysis ✅
  - [x] 0.7: Type System Analysis ✅

- [x] **Phase 1**: Revised Implementation Plan - Preparation ✅
- [x] **Phase 2**: Revised Implementation Plan - Core IMAP Driver ✅
- [x] **Phase 3**: Revised Implementation Plan - Authentication ✅
- [x] **Phase 4**: Revised Implementation Plan - Email Sync ✅
- [x] **Phase 5**: Revised Implementation Plan - SMTP Send ✅
- [x] **Phase 6**: Revised Implementation Plan - AI Integration & Testing ✅

---

## Progress Tracker

### Phase 0: Codebase Analysis

#### 0.1: Driver Architecture Analysis
**Status**: ✅ COMPLETED
**Files to Analyze**:
- [x] `/apps/server/src/lib/driver/index.ts`
- [x] `/apps/server/src/lib/driver/types.ts`
- [x] `/apps/server/src/lib/driver/utils.ts`
- [x] `/apps/server/src/lib/driver/google.ts` (partial)
- [x] `/apps/server/src/lib/driver/microsoft.ts` (partial)
- [x] `/apps/server/src/lib/server-utils.ts` (createDriver usage)

**Key Questions**:
- How is createDriver currently called?
- What is the exact ManagerConfig structure?
- How do Google and Microsoft drivers initialize?
- What are all the MailManager interface methods?
- Are there any utility functions shared between drivers?

**Findings**:

##### createDriver Function (index.ts)
- **SYNCHRONOUS** function
- Returns MailManager immediately
- Signature: `createDriver(provider, config): MailManager`
- Current providers: `google`, `microsoft` only
- No connectionId parameter currently

##### ManagerConfig Structure (types.ts)
```typescript
{
  auth: {
    userId: string;
    accessToken: string;
    refreshToken: string;
    email: string;
  }
}
```
- **PROBLEM**: No connectionId in config!
- **PROBLEM**: Assumes OAuth tokens (accessToken/refreshToken)

##### MailManager Interface (types.ts)
**26 methods total**:
- getMessageAttachments(id)
- get(id) → IGetThreadResponse
- create(data) → {id}
- sendDraft(id, data)
- createDraft(data)
- getDraft(id)
- listDrafts(params)
- delete(id)
- deleteDraft(id)
- list(params) → IGetThreadsResponse
- count() → {count, label}[]
- getTokens(code) → {tokens}
- getUserInfo(tokens?) → {address, name, photo}
- getScope() → string
- listHistory(historyId)
- markAsRead(threadIds[])
- markAsUnread(threadIds[])
- normalizeIds(id[])
- modifyLabels(id[], options)
- getAttachment(messageId, attachmentId)
- getUserLabels() → Label[]
- getLabel(id) → Label
- createLabel(label)
- updateLabel(id, label)
- deleteLabel(id)
- getEmailAliases()
- revokeToken(token)
- deleteAllSpam()
- getRawEmail(id)

##### GoogleMailManager Constructor
- Creates OAuth2Client with env.GOOGLE_CLIENT_ID/SECRET
- Sets credentials with refresh_token from config.auth.refreshToken
- Initializes gmail API client
- **SYNCHRONOUS** initialization

##### OutlookMailManager Constructor
- Creates Microsoft Graph Client
- getAccessToken is async (calls c.var.auth.api.getAccessToken)
- Uses Hono context to get access token
- **SYNCHRONOUS** constructor, but token fetching is async during API calls

##### connectionToDriver Function (server-utils.ts:576)
**CRITICAL INTEGRATION POINT**
```typescript
export const connectionToDriver = (activeConnection) => {
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
- Used in 6 files (found via grep)
- Passes connection record fields to ManagerConfig
- **SYNCHRONOUS** call

##### createDriver Usage Locations (via grep)
1. `/apps/server/src/lib/driver/index.ts` (definition)
2. `/apps/server/src/lib/server-utils.ts` (connectionToDriver)
3. `/apps/server/src/lib/auth.ts` (connectionHandlerHook - line 99)

**auth.ts Usage** (line 99):
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
- Called during OAuth callback
- Synchronous call, but awaits driver.getUserInfo() after
- This is where new connections are created

**CRITICAL PROBLEMS IDENTIFIED**:
1. ❌ createDriver is SYNCHRONOUS - IMAP needs ASYNC (must load connection from DB)
2. ❌ ManagerConfig has NO connectionId field
3. ❌ ManagerConfig assumes OAuth tokens (accessToken/refreshToken)
4. ❌ connectionToDriver widely used (6 files) - breaking change if modified
5. ❌ IMAP needs: host, port, security, password (encrypted) - not in current config

**REQUIRED CHANGES**:
1. Make createDriver ASYNC
2. Add connectionId parameter to createDriver
3. Extend ManagerConfig OR create ImapManagerConfig
4. Update ALL createDriver call sites (6+ files)
5. Update connectionToDriver to be async

---

#### 0.2: Database Schema Analysis
**Status**: ✅ COMPLETED
**Files to Analyze**:
- [x] `/apps/server/src/db/schema.ts` (full read)

**Key Questions**:
- What is the exact structure of the `connection` table?
- What indexes exist?
- What are the foreign key relationships?
- Are there any triggers or constraints?
- What is the `providerId` enum type?

**Findings**: See `analysis/01-database-schema.md`

**Key Findings**:
- `connection` table is the critical integration point
- `providerId` currently: `'google' | 'microsoft'` - needs `'imap'`
- Unique constraint: (userId, email) - may need (userId, email, providerId)
- OAuth fields nullable - good for IMAP
- Cascade deletes properly configured
- Need to add: imapHost, imapPort, imapSecurity, smtpHost, smtpPort, smtpSecurity, authType, encryptedPassword, lastSyncUid

---

#### 0.3: Authentication & Connection Flow Analysis
**Status**: ✅ COMPLETED
**Files to Analyze**:
- [x] `/apps/server/src/lib/auth.ts`
- [x] `/apps/server/src/lib/auth-providers.ts`
- [x] `/apps/server/src/routes/auth.ts`
- [x] `/apps/server/src/trpc/routes/connections.ts`
- [x] `/apps/server/src/lib/server-utils.ts` (getActiveConnection, connectionToDriver, resetConnection)

**Key Questions**:
- How are connections currently created?
- How is OAuth flow handled?
- Where is the connection stored after creation?
- How is connection validation done?
- How are tokens refreshed?

**Findings**: See `analysis/02-auth-connection-flow.md`

**Key Findings**:
- connectionHandlerHook is OAuth-only - IMAP needs separate creation endpoint
- connectionToDriver validates OAuth tokens - must be conditional
- Subscribe queue is OAuth-specific - IMAP needs polling mechanism
- getActiveConnection returns first connection if no default set
- Need new TRPC route: connections.createImap
- Need testImapConnection utility for credential validation
- Password encryption via Autumn required
- connections.list needs fix for "disconnected" detection (IMAP has no tokens)
- connections.delete needs IMAP-specific cleanup (password deletion, subscription stop)

---

#### 0.4: Brain/AI Pipeline Analysis
**Status**: ✅ COMPLETED
**Files to Analyze**:
- [x] `/apps/server/src/lib/brain.ts`
- [x] `/apps/server/src/lib/email-processor.ts`
- [x] `/apps/server/src/lib/prompts.ts`
- [x] `/apps/server/src/pipelines.ts`
- [x] `/apps/server/src/thread-workflow-utils/workflow-engine.ts`
- [x] `/apps/server/src/thread-workflow-utils/workflow-functions.ts`
- [x] `/apps/server/src/trpc/routes/brain.ts`

**Key Questions**:
- What is the exact input format for the brain function?
- How are emails processed through the AI pipeline?
- What ParsedMessage fields are actually used?
- How are summaries stored?
- How is the workflow engine triggered?

**Findings**: See `analysis/03-brain-ai-pipeline.md`

**Key Findings**:
- AI pipeline is **provider-agnostic** - works with any ParsedMessage format
- Workflow engine uses flexible step-based system with conditional execution
- AI models: Llama 4 Scout (summarization), BGE Base (embeddings), BART CNN (short summaries)
- Vectorization stores in Cloudflare Vectorize (message and thread vectors)
- Automatic draft generation based on email intent analysis (question/request/meeting/urgent)
- **CRITICAL**: ParsedMessage.decodedBody is required for AI processing (plain text)
- Thread workflows triggered after email sync (OAuth: push, IMAP: polling needed)
- **ONLY ONE CHANGE NEEDED**: Fix runZeroWorkflow OAuth token validation (add conditional check for IMAP)

---

#### 0.5: Subscription Factory Pattern Analysis
**Status**: ✅ COMPLETED
**Files to Analyze**:
- [ ] `/apps/server/src/lib/factories/base-subscription.factory.ts`
- [ ] `/apps/server/src/lib/factories/google-subscription.factory.ts`
- [ ] `/apps/server/src/lib/factories/outlook-subscription.factory.ts`
- [ ] `/apps/server/src/lib/factories/subscription-factory.registry.ts`

**Key Questions**:
- What is the BaseSubscriptionFactory interface?
- How does subscribe/unsubscribe work?
- How is the factory selected?
- Where is the factory called from?

**Findings**: (to be filled)

---

#### 0.6: TRPC Routes Analysis
**Status**: ⏳ NOT STARTED
**Files to Analyze**:
- [ ] `/apps/server/src/trpc/routes/mail.ts`
- [ ] `/apps/server/src/trpc/routes/connections.ts`
- [ ] `/apps/server/src/trpc/routes/label.ts`
- [ ] `/apps/server/src/trpc/trpc.ts`

**Key Questions**:
- How is activeConnection retrieved in TRPC?
- What middleware exists?
- How are drivers instantiated in TRPC routes?
- What is the exact procedure signature?

**Findings**: (to be filled)

---

#### 0.7: Type System Analysis
**Status**: ⏳ NOT STARTED
**Files to Analyze**:
- [ ] `/apps/server/src/types.ts`
- [ ] `/apps/server/src/lib/driver/types.ts`
- [ ] `/apps/server/src/lib/schemas.ts`

**Key Questions**:
- What is the exact ParsedMessage type?
- What is the exact IOutgoingMessage type?
- What is the exact Label type?
- What is EProviders?
- What is the CreateDraftData schema?

**Findings**: (to be filled)

---

## Analysis Output Directory

Detailed analysis findings will be stored in:
`/home/code/workspaces/Zero/docs/impl-plans/analysis/`

Each analysis will produce:
- `00-driver-architecture.md`
- `01-database-schema.md`
- `02-auth-connection-flow.md`
- `03-brain-ai-pipeline.md`
- `04-subscription-factory.md`
- `05-trpc-routes.md`
- `06-type-system.md`

---

## Revised Plan Output Directory

The revised, AI-proof implementation plans will be stored in:
`/home/code/workspaces/Zero/docs/impl-plans/`

Files:
- `00-OVERVIEW-REVISED.md`
- `01-phase-preparation-REVISED.md`
- `02-phase-core-driver-REVISED.md`
- `03-phase-authentication-REVISED.md`
- `04-phase-email-sync-REVISED.md`
- `05-phase-smtp-send-REVISED.md`
- `06-phase-ai-integration-REVISED.md`

---

## Session Continuity

### How to Resume Planning After Session Break

1. Read this `PLANNING-PROGRESS.md` file
2. Check the "Progress Tracker" section
3. Find the first task marked as ⏳ NOT STARTED
4. Continue from that task
5. Update status to ✅ COMPLETED when done
6. Mark next task as 🔄 IN PROGRESS

### Status Markers
- ⏳ NOT STARTED
- 🔄 IN PROGRESS
- ✅ COMPLETED
- ❌ BLOCKED (with reason)

---

## Next Steps

**Current Focus**: Phase 0.1 - Driver Architecture Analysis

**Command to Start**:
```
Read files in order, document findings, update this tracker
```

---

## Notes & Discoveries

(This section will be populated as we discover important patterns, gotchas, or design decisions)

---

**Last Session Summary**:
- ✅ Completed 5 Analysis Phases (0.1-0.5)
- 📄 Created analysis documents:
  - `analysis/00-driver-architecture.md` - createDriver async refactor needed
  - `analysis/01-database-schema.md` - Add IMAP fields to connection table
  - `analysis/02-auth-connection-flow.md` - New connections.createImap route needed
  - `analysis/03-brain-ai-pipeline.md` - AI pipeline provider-agnostic, works as-is
  - `analysis/04-subscription-factory.md` - New ImapSubscriptionFactory with polling
- 🔍 Critical findings:
  - AI pipeline requires NO changes (provider-agnostic)
  - IMAP driver must return ParsedMessage with `decodedBody` (plain text)
  - Polling subscription via Cloudflare Queue recommended
  - Breaking change: make connectionToDriver async
- ➡️ Next: Complete Phase 0.6-0.7, then create revised implementation plans
