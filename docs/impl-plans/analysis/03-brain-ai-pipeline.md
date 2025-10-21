# Brain/AI Pipeline Analysis

**Date**: 2025-10-20
**Status**: ✅ COMPLETED

---

## Executive Summary

The Zero project's AI pipeline is **highly sophisticated** and **provider-agnostic**. It processes emails through a multi-stage workflow system that:
1. Vectorizes individual messages with AI summaries
2. Generates thread-level summaries
3. Analyzes email intent
4. Automatically generates draft responses

The pipeline is **decoupled from the email provider** and works with standardized ParsedMessage objects. **IMAP support requires NO changes to the AI pipeline** - only the IMAP driver must produce compatible ParsedMessage objects.

### Critical Findings

1. **AI pipeline is provider-agnostic** - Works with any provider that returns ParsedMessage
2. **Workflow engine is flexible** - Steps can be enabled/disabled per connection
3. **Vectorization uses Cloudflare AI** - `@cf/meta/llama-4-scout-17b-16e-instruct` and `@cf/baai/bge-base-en-v1.5`
4. **Thread workflows run asynchronously** - Triggered after email sync
5. **Summary storage in Vectorize** - Cloudflare's vector database
6. **Automatic draft generation** - Based on email intent analysis
7. **No IMAP-specific changes needed** - Just ensure ParsedMessage format compliance

---

## AI Pipeline Architecture

### High-Level Flow

```
┌─────────────────────┐
│  Email Arrives      │
│  (IMAP/OAuth)       │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  Sync Workflow      │
│  (Provider-specific)│
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  Thread Workflow    │
│  (Provider-agnostic)│
└──────────┬──────────┘
           │
           ├──► Vectorize Messages
           │    (Individual summaries)
           │
           ├──► Generate Thread Summary
           │    (Overall summary)
           │
           ├──► Analyze Intent
           │    (Question/Request/Meeting/Urgent)
           │
           └──► Generate Automatic Draft
                (If response needed)
```

---

## Core Components

### 1. Brain Functions (brain.ts)

**Location**: `/apps/server/src/lib/brain.ts`

#### enableBrainFunction()
**Purpose**: Subscribe connection to email change notifications

**Code**:
```typescript
export const enableBrainFunction = async (connection: {
  id: string;
  providerId: EProviders;
}) => {
  try {
    const subscriptionFactory = getSubscriptionFactory(connection.providerId);
    await subscriptionFactory.subscribe({ body: { connectionId: connection.id } });
  } catch (error) {
    console.error(`Failed to enable brain function: ${error}`);
    await resetConnection(connection.id);
  }
};
```

**IMAP Consideration**: Will need IMAP-specific subscription factory (polling instead of push)

#### disableBrainFunction()
**Purpose**: Unsubscribe connection from email notifications

**Code**:
```typescript
export const disableBrainFunction = async (connection: {
  id: string;
  providerId: EProviders;
}) => {
  try {
    const subscriptionFactory = getSubscriptionFactory(connection.providerId);
    await subscriptionFactory.unsubscribe({
      body: { connectionId: connection.id, providerId: connection.providerId },
    });
  } catch (error) {
    console.error(`Failed to disable brain function: ${error}`);
  }
};
```

**IMAP Consideration**: Stop polling subscription

#### getPrompts()
**Purpose**: Load AI prompts for connection

**Code**:
```typescript
export const getPrompts = async ({ connectionId }: { connectionId: string }) => {
  const prompts: Record<EPrompts, string> = {
    [EPrompts.SummarizeMessage]: '',
    [EPrompts.ReSummarizeThread]: '',
    [EPrompts.SummarizeThread]: '',
    [EPrompts.Chat]: '',
    [EPrompts.Compose]: '',
  };
  const fallbackPrompts = {
    [EPrompts.SummarizeMessage]: SummarizeMessage,
    [EPrompts.ReSummarizeThread]: ReSummarizeThread,
    [EPrompts.SummarizeThread]: SummarizeThread,
    [EPrompts.Chat]: AiChatPrompt(),
    [EPrompts.Compose]: StyledEmailAssistantSystemPrompt(),
  };
  for (const promptType of Object.values(EPrompts)) {
    const promptName = getPromptName(connectionId, promptType);
    const prompt = await getPrompt(promptName, fallbackPrompts[promptType]);
    prompts[promptType] = prompt;
  }
  return prompts;
};
```

**Prompt Types**:
- `SummarizeMessage` - Individual message summarization
- `SummarizeThread` - Thread-level summarization
- `ReSummarizeThread` - Re-summarize existing thread with new messages
- `Chat` - AI chat assistant
- `Compose` - Styled email composition with writing style analysis

**IMAP Compatibility**: ✅ Works without changes - connection-specific prompts

---

### 2. Workflow Engine (workflow-engine.ts)

**Location**: `/apps/server/src/thread-workflow-utils/workflow-engine.ts`

**Purpose**: Flexible step-based workflow execution system

#### WorkflowContext
```typescript
export type WorkflowContext = {
  connectionId: string;
  threadId: string;
  thread: IGetThreadResponse;
  foundConnection: typeof connection.$inferSelect;
  results?: Map<string, unknown>;
  env?: unknown;
};
```

**Key Fields**:
- `thread` - Provider-agnostic thread data (IGetThreadResponse)
- `results` - Shared data between workflow steps
- `foundConnection` - Database connection record

**IMAP Impact**: ✅ No changes needed - connectionId and thread are provider-agnostic

#### WorkflowStep
```typescript
export type WorkflowStep = {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  condition?: (context: WorkflowContext) => boolean | Promise<boolean>;
  action: (context: WorkflowContext) => Promise<unknown>;
  errorHandling?: 'continue' | 'fail';
  maxRetries?: number;
};
```

**Features**:
- **Conditional execution** - Steps can be skipped based on conditions
- **Error handling** - Continue on error or fail entire workflow
- **Retry logic** - Configurable max retries per step

**IMAP Impact**: ✅ No changes needed

#### executeWorkflow()
**Purpose**: Run workflow with tracing

**Key Logic**:
1. Iterate through workflow steps
2. Check if step is enabled
3. Evaluate condition (if any)
4. Execute action
5. Store result in shared context
6. Handle errors per step config
7. Add tracing/observability

**IMAP Impact**: ✅ Works without changes

---

### 3. Workflow Functions (workflow-functions.ts)

**Location**: `/apps/server/src/thread-workflow-utils/workflow-functions.ts`

#### analyzeEmailIntent
**Purpose**: Determine email type (question, request, meeting, urgent)

**Code**:
```typescript
const analyzeEmailIntent = (message: ParsedMessage) => {
  const content = (message.decodedBody || message.body || '').toLowerCase();
  const subject = (message.subject || '').toLowerCase();

  return {
    isQuestion:
      /\?/.test(content) ||
      /\b(what|when|where|how|why|can you|could you|would you)\b/.test(content),
    isRequest: /\b(please|request|need|require|can you|could you|would you mind)\b/.test(content),
    isMeeting: /\b(meeting|schedule|calendar|appointment|call|zoom|teams|meet)\b/.test(
      content + ' ' + subject,
    ),
    isUrgent: /\b(urgent|asap|immediate|priority|rush)\b/.test(content + ' ' + subject),
  };
};
```

**Input**: Single `ParsedMessage`
**Output**: Intent flags

**IMAP Impact**: ✅ No changes - works with any ParsedMessage

#### validateResponseNeeded
**Purpose**: Check if automatic draft should be generated

**Logic**:
```typescript
const requiresResponse =
  intentResult.isQuestion ||
  intentResult.isRequest ||
  intentResult.isMeeting ||
  intentResult.isUrgent;
```

**IMAP Impact**: ✅ No changes

#### generateAutomaticDraft
**Purpose**: Create AI-generated draft reply

**Code**:
```typescript
const generateAutomaticDraft = async (
  connectionId: string,
  thread: IGetThreadResponse,
  foundConnection: typeof connection.$inferSelect,
): Promise<string | null> => {
  const latestMessage = thread.messages[thread.messages.length - 1];
  const emailAnalysis = analyzeEmailIntent(latestMessage);

  let prompt = 'Generate a professional reply...';
  if (emailAnalysis.isQuestion) {
    prompt = 'This email contains questions. Generate a helpful response...';
  } else if (emailAnalysis.isRequest) {
    prompt = 'This email contains a request. Generate a response...';
  }
  // ... more prompt customization

  const draftContent = await composeEmail({
    prompt,
    threadMessages: thread.messages.map((message) => ({ ... })),
    username: foundConnection.name || foundConnection.email,
    connectionId,
  });

  return draftContent.replace(/\n/g, '<br>');
};
```

**IMAP Impact**: ✅ No changes - uses thread.messages (provider-agnostic)

#### shouldGenerateDraft
**Purpose**: Determine if draft should be created

**Checks**:
1. Thread has messages
2. Latest message is NOT from user
3. NOT from no-reply addresses
4. NOT automated email (newsletter, notification)
5. Message is less than 7 days old
6. No draft already exists in thread

**IMAP Impact**: ✅ No changes

#### vectorizeMessages
**Purpose**: Generate AI summaries and embeddings for individual messages

**Flow**:
1. Convert message to XML prompt
2. Load `SummarizeMessage` prompt
3. Call Cloudflare AI: `@cf/meta/llama-4-scout-17b-16e-instruct`
4. Generate embedding vector from summary
5. Return vectorized message

**Code**:
```typescript
const vectorizeSingleMessage = (message: ParsedMessage) => {
  const prompt = await messageToXML(message);
  const SummarizeMessagePrompt = await getPrompt(
    getPromptName(message.connectionId ?? '', EPrompts.SummarizeMessage),
    SummarizeMessage,
  );

  const messages = [
    { role: 'system', content: SummarizeMessagePrompt },
    { role: 'user', content: prompt },
  ];

  const response = await env.AI.run('@cf/meta/llama-4-scout-17b-16e-instruct', {
    messages,
  });

  const summary = 'response' in response ? response.response : response;
  const embeddingVector = await getEmbeddingVector(summary);

  return {
    id: message.id,
    metadata: {
      connection: message.connectionId ?? '',
      thread: message.threadId ?? '',
      summary,
    },
    values: embeddingVector,
  };
};
```

**IMAP Impact**: ✅ No changes - works with ParsedMessage

#### upsertEmbeddings
**Purpose**: Store message vectors in Cloudflare Vectorize

**Code**:
```typescript
await env.VECTORIZE_MESSAGE.upsert(vectorizeResult.embeddings);
```

**IMAP Impact**: ✅ No changes

#### generateThreadSummary
**Purpose**: Create overall thread summary

**Logic**:
1. Check if existing summary exists
2. Compare newest message ID with last processed message
3. If new messages → re-summarize with context
4. If no changes → return existing summary

**Code**:
```typescript
const generateThreadSummary = async (context) => {
  const existingSummary = summaryResult?.existingSummary;
  const newestMessage = context.thread.messages[context.thread.messages.length - 1];

  if (existingSummary && existingSummary.lastMsg === newestMessage?.id) {
    console.log('No new messages since last processing, skipping AI processing');
    return { summary: existingSummary.summary };
  }

  if (existingSummary) {
    const summary = await summarizeThread(
      context.connectionId,
      context.thread.messages,
      existingSummary.summary, // Previous summary as context
    );
    return { summary };
  } else {
    const summary = await summarizeThread(
      context.connectionId,
      context.thread.messages,
      undefined, // No previous summary
    );
    return { summary };
  }
};
```

**IMAP Impact**: ✅ No changes

#### upsertThreadSummary
**Purpose**: Store thread summary vector

**Code**:
```typescript
const embeddingVector = await getEmbeddingVector(summaryResult.summary);
const newestMessage = context.thread.messages[context.thread.messages.length - 1];

await env.VECTORIZE.upsert([
  {
    id: context.threadId.toString(),
    metadata: {
      connection: context.connectionId,
      summary: summaryResult.summary,
      lastMsg: newestMessage?.id,
    },
    values: embeddingVector,
  },
]);
```

**IMAP Impact**: ✅ No changes

---

### 4. Workflow Pipeline (pipelines.ts)

**Location**: `/apps/server/src/pipelines.ts`

#### WorkflowRunner (Durable Object)
**Purpose**: Execute workflows in response to email changes

**Key Methods**:

##### runMainWorkflow()
**Trigger**: Pub/Sub message from provider
**Parameters**:
```typescript
{
  providerId: string;
  historyId: string;
  subscriptionName: string;
}
```

**Flow**:
1. Validate subscription name
2. Extract connectionId from subscription
3. Check provider (currently only Google)
4. Load previous historyId from KV
5. Call `runZeroWorkflow()` with historyId range

**IMAP Consideration**:
- IMAP doesn't use Pub/Sub
- Need separate entry point for IMAP polling results

##### runZeroWorkflow()
**Purpose**: Process history changes and trigger thread workflows

**Flow**:
1. Acquire lock on historyId (prevent duplicate processing)
2. Load connection from database
3. Validate OAuth tokens (accessToken/refreshToken)
4. Call Gmail API to get history changes
5. Extract thread IDs
6. Trigger `runThreadWorkflow()` for each thread
7. Store new historyId

**Code** (lines 266-284):
```typescript
const foundConnection = yield* Effect.tryPromise({
  try: async () => {
    const [foundConnection] = await db
      .select()
      .from(connection)
      .where(eq(connection.id, connectionId.toString()));
    await conn.end();
    if (!foundConnection) {
      throw new Error(`Connection not found ${connectionId}`);
    }
    if (!foundConnection.accessToken || !foundConnection.refreshToken) {
      throw new Error(`Connection is not authorized ${connectionId}`);
    }
    return foundConnection;
  },
  catch: (error) => ({ _tag: 'DatabaseError' as const, error }),
});
```

**IMAP Problem**: ❌ Validates OAuth tokens (IMAP connections don't have these)

**Fix Needed**:
```typescript
// Conditional token validation
if (foundConnection.providerId !== 'imap') {
  if (!foundConnection.accessToken || !foundConnection.refreshToken) {
    throw new Error(`Connection is not authorized ${connectionId}`);
  }
}
```

##### runThreadWorkflow()
**Purpose**: Process individual thread through AI pipeline

**Flow** (inferred from code):
1. Load thread data via driver.get(threadId)
2. Create WorkflowContext
3. Execute default workflows:
   - find-messages-to-vectorize
   - vectorize-messages
   - upsert-embeddings
   - check-existing-summary
   - generate-thread-summary
   - upsert-thread-summary
   - analyze-email-intent
   - validate-response-needed
   - generate-automatic-draft (conditional)
   - create-draft (conditional)

**IMAP Impact**: ✅ Works if driver.get() returns IGetThreadResponse

---

### 5. Default Workflows

**Location**: `/apps/server/src/thread-workflow-utils/workflow-engine.ts` (lines 162+)

#### createDefaultWorkflows()
**Purpose**: Define standard workflow chains

**Workflow Definitions** (inferred):

```typescript
const vectorizationWorkflow = {
  name: 'message-vectorization',
  description: 'Vectorize and summarize messages',
  steps: [
    {
      id: 'find-messages-to-vectorize',
      name: 'Find Messages to Vectorize',
      enabled: true,
      action: workflowFunctions.findMessagesToVectorize,
    },
    {
      id: 'vectorize-messages',
      name: 'Vectorize Messages',
      enabled: true,
      action: workflowFunctions.vectorizeMessages,
    },
    {
      id: 'upsert-embeddings',
      name: 'Upsert Embeddings',
      enabled: true,
      action: workflowFunctions.upsertEmbeddings,
    },
  ],
};

const summarizationWorkflow = {
  name: 'thread-summarization',
  description: 'Generate thread summary',
  steps: [
    {
      id: 'check-existing-summary',
      name: 'Check Existing Summary',
      enabled: true,
      action: workflowFunctions.checkExistingSummary,
    },
    {
      id: 'generate-thread-summary',
      name: 'Generate Thread Summary',
      enabled: true,
      action: workflowFunctions.generateThreadSummary,
    },
    {
      id: 'upsert-thread-summary',
      name: 'Upsert Thread Summary',
      enabled: true,
      action: workflowFunctions.upsertThreadSummary,
    },
  ],
};

const draftGenerationWorkflow = {
  name: 'auto-draft-generation',
  description: 'Generate automatic draft replies',
  steps: [
    {
      id: 'analyze-email-intent',
      name: 'Analyze Email Intent',
      enabled: true,
      action: workflowFunctions.analyzeEmailIntent,
    },
    {
      id: 'validate-response-needed',
      name: 'Validate Response Needed',
      enabled: true,
      action: workflowFunctions.validateResponseNeeded,
      condition: async (context) => {
        const intentResult = context.results?.get('analyze-email-intent');
        return !!intentResult;
      },
    },
    {
      id: 'generate-draft-content',
      name: 'Generate Draft Content',
      enabled: true,
      action: workflowFunctions.generateAutomaticDraft,
      condition: async (context) => {
        const validateResult = context.results?.get('validate-response-needed');
        return validateResult?.requiresResponse === true;
      },
    },
    {
      id: 'create-draft',
      name: 'Create Draft',
      enabled: true,
      action: workflowFunctions.createDraft,
      condition: async (context) => {
        return !!context.results?.get('generate-draft-content')?.draftContent;
      },
    },
  ],
};
```

**IMAP Impact**: ✅ All workflows are provider-agnostic

---

### 6. TRPC Brain Routes

**Location**: `/apps/server/src/trpc/routes/brain.ts`

#### brain.enableBrain
**Purpose**: Enable AI processing for connection

**Code**:
```typescript
enableBrain: activeConnectionProcedure.mutation(async ({ ctx }) => {
  const connection = ctx.activeConnection as { id: string; providerId: EProviders };
  await setSubscribedState(connection.id, connection.providerId);
  await env.subscribe_queue.send({
    connectionId: connection.id,
    providerId: connection.providerId,
  } as ISubscribeBatch);
  return true;
});
```

**IMAP Impact**: Will send message to subscribe_queue - subscription factory must handle 'imap' provider

#### brain.disableBrain
**Purpose**: Disable AI processing

**IMAP Impact**: ✅ Calls disableBrainFunction() - needs IMAP subscription factory

#### brain.generateSummary
**Purpose**: Get thread summary from vector database

**Code**:
```typescript
generateSummary: activeConnectionProcedure
  .input(z.object({ threadId: z.string() }))
  .query(async ({ input, ctx }) => {
    const { threadId } = input;
    const response = await env.VECTORIZE.getByIds([threadId]);
    if (response.length && response?.[0]?.metadata?.['summary']) {
      const result = response[0].metadata as { summary: string; connection: string };
      if (result.connection !== ctx.activeConnection.id) return null;
      const shortResponse = await env.AI.run('@cf/facebook/bart-large-cnn', {
        input_text: result.summary,
      });
      return {
        data: {
          short: shortResponse.summary,
        },
      };
    }
    return null;
  }),
```

**IMAP Impact**: ✅ No changes - threadId is provider-agnostic

#### brain.getPrompts
**Purpose**: Load AI prompts for connection

**IMAP Impact**: ✅ No changes

#### brain.updatePrompt
**Purpose**: Update custom AI prompt

**IMAP Impact**: ✅ No changes

#### brain.getLabels / brain.updateLabels
**Purpose**: Manage custom labels for AI categorization

**IMAP Impact**: ✅ No changes

---

## AI Models Used

### 1. Llama 4 Scout (Message Summarization)
**Model**: `@cf/meta/llama-4-scout-17b-16e-instruct`
**Purpose**: Generate message summaries
**Input**: System prompt + message XML
**Output**: Text summary

### 2. BGE Base (Embeddings)
**Model**: `@cf/baai/bge-base-en-v1.5`
**Purpose**: Generate embedding vectors
**Input**: Text summary
**Output**: 768-dimension vector

### 3. BART Large CNN (Short Summaries)
**Model**: `@cf/facebook/bart-large-cnn`
**Purpose**: Condense long summaries
**Input**: Long summary
**Output**: Short summary

**IMAP Impact**: ✅ No changes - models are provider-agnostic

---

## Data Structures

### ParsedMessage (Required by AI Pipeline)

**Location**: `/apps/server/src/types.ts`

**Key Fields Used by AI**:
```typescript
{
  id: string;
  threadId: string;
  connectionId: string;
  subject: string;
  decodedBody: string;  // ⚠️ CRITICAL - Used for AI processing
  body: string;         // Fallback if decodedBody not available
  sender: { name: string; email: string };
  to: { name: string; email: string }[];
  cc: { name: string; email: string }[];
  receivedOn: string;   // ISO date string
  tags: { id: string; name: string }[];
}
```

**IMAP Driver Requirements**:
1. ✅ Must populate `decodedBody` with plain text content
2. ✅ Must populate `sender`, `to`, `cc` with email addresses
3. ✅ Must set `connectionId` and `threadId`
4. ✅ Must include `receivedOn` timestamp
5. ✅ Must map IMAP tags to `tags` array

### IGetThreadResponse (Required by Workflows)

**Location**: `/apps/server/src/lib/driver/types.ts`

**Structure**:
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

**IMAP Driver Requirements**:
1. ✅ Return all messages in thread (sorted oldest → newest)
2. ✅ Set `latest` to last message
3. ✅ Calculate `hasUnread` based on IMAP `\Seen` flag
4. ✅ Set `totalReplies` to message count
5. ✅ Map IMAP folders to `labels`
6. ✅ Set `isLatestDraft` if last message is in Drafts folder

---

## Storage & Vectorization

### Cloudflare Vectorize
**Purpose**: Store message and thread embeddings

**Namespaces**:
- `VECTORIZE_MESSAGE` - Individual message vectors
- `VECTORIZE` - Thread summary vectors

**Vector Structure**:
```typescript
{
  id: string,  // messageId or threadId
  metadata: {
    connection: string,
    thread?: string,
    summary: string,
    lastMsg?: string,  // For thread vectors
  },
  values: number[],  // 768-dimension vector
}
```

**IMAP Impact**: ✅ No changes - works with any provider

### KV Storage
**Purpose**: Store various states

**Keys Used**:
- `gmail_history_id` - Last processed history ID (Gmail-specific)
- `gmail_processing_threads` - Lock keys to prevent duplicate processing
- `subscribed_accounts` - Track subscription state
- `connection_labels` - Custom labels per connection
- `prompts_storage` - Custom AI prompts

**IMAP Impact**:
- ❌ `gmail_history_id` not applicable - use `imap_last_sync_uid` instead
- ✅ Other KV keys work for IMAP

---

## Workflow Triggering

### OAuth Providers (Google, Microsoft)
**Trigger**: Push notification from provider
**Flow**:
1. Provider sends webhook/Pub/Sub message
2. `runMainWorkflow()` called with historyId
3. `runZeroWorkflow()` fetches changed threads
4. `runThreadWorkflow()` for each thread

### IMAP (To Be Implemented)
**Trigger**: Polling timer
**Flow**:
1. IMAP subscription factory polls every N minutes
2. Fetch new messages since last UID
3. Group messages by thread
4. For each thread:
   - Call driver.get(threadId) to get full thread
   - Create WorkflowContext
   - Call `workflowEngine.executeWorkflowChain()`

**Required Implementation**:
```typescript
// In IMAP subscription factory
async poll() {
  const newMessages = await imapDriver.list({ /* since lastUid */ });
  const threadIds = [...new Set(newMessages.threads.map(t => t.id))];

  for (const threadId of threadIds) {
    // Trigger workflow
    const thread = await imapDriver.get(threadId);
    const context = {
      connectionId: this.connectionId,
      threadId,
      thread,
      foundConnection,
    };
    await workflowEngine.executeWorkflowChain(
      ['message-vectorization', 'thread-summarization', 'auto-draft-generation'],
      context,
    );
  }
}
```

---

## Required Changes for IMAP

### 1. Fix runZeroWorkflow Token Validation

**Location**: `/apps/server/src/pipelines.ts` (lines 266-284)

**Current Code**:
```typescript
if (!foundConnection.accessToken || !foundConnection.refreshToken) {
  throw new Error(`Connection is not authorized ${connectionId}`);
}
```

**Fixed Code**:
```typescript
// Skip OAuth validation for IMAP
if (foundConnection.providerId !== 'imap') {
  if (!foundConnection.accessToken || !foundConnection.refreshToken) {
    throw new Error(`Connection is not authorized ${connectionId}`);
  }
}
```

**Impact**: Allows IMAP connections to pass authorization check

### 2. IMAP Workflow Trigger (New)

**Location**: `/apps/server/src/lib/factories/imap-subscription.factory.ts` (to be created)

**Purpose**: Poll IMAP and trigger workflows

**Implementation**:
```typescript
export class ImapSubscriptionFactory extends BaseSubscriptionFactory {
  private pollInterval: number = 5 * 60 * 1000; // 5 minutes

  async subscribe({ body }: { body: { connectionId: string } }) {
    const { connectionId } = body;

    // Schedule polling via Cloudflare Cron or Queue
    await env.imap_poll_queue.send({
      connectionId,
      pollInterval: this.pollInterval,
    });
  }

  async unsubscribe({ body }: { body: { connectionId: string } }) {
    // Stop polling
    await env.imap_poll_queue.cancel({ connectionId: body.connectionId });
  }

  async poll(connectionId: string) {
    // Load connection and driver
    const db = await getZeroDB(/* userId from connectionId */);
    const connection = await db.findUserConnection(connectionId);
    const driver = await connectionToDriver(connection);

    // Get last sync UID
    const lastSyncUid = JSON.parse(connection.lastSyncUid || '{}');

    // Fetch new messages per folder
    for (const folder of ['INBOX', 'Sent']) {
      const lastUid = lastSyncUid[folder] || 0;
      const newMessages = await driver.list({
        /* fetch messages with UID > lastUid */
      });

      // Group by thread
      const threadIds = [...new Set(newMessages.threads.map(t => t.id))];

      // Trigger workflows
      for (const threadId of threadIds) {
        await this.triggerThreadWorkflow(connectionId, threadId, connection);
      }

      // Update last sync UID
      lastSyncUid[folder] = /* new max UID */;
    }

    // Save last sync UID
    await db.updateConnection(connectionId, {
      lastSyncUid: JSON.stringify(lastSyncUid),
    });
  }

  private async triggerThreadWorkflow(
    connectionId: string,
    threadId: string,
    foundConnection: any,
  ) {
    const driver = await connectionToDriver(foundConnection);
    const thread = await driver.get(threadId);

    const context = {
      connectionId,
      threadId,
      thread,
      foundConnection,
    };

    // Execute workflows
    const workflowEngine = new WorkflowEngine();
    const workflows = createDefaultWorkflows();
    workflows.forEach(w => workflowEngine.registerWorkflow(w));

    await workflowEngine.executeWorkflowChain(
      ['message-vectorization', 'thread-summarization', 'auto-draft-generation'],
      context,
    );
  }
}
```

### 3. IMAP Driver ParsedMessage Compliance

**Requirement**: IMAP driver must return ParsedMessage with correct format

**Critical Fields**:
- `decodedBody` - Plain text content (use mailparser to decode MIME)
- `sender`, `to`, `cc` - Email addresses
- `receivedOn` - ISO date string
- `threadId` - Computed from Message-ID/In-Reply-To/References headers

**Example**:
```typescript
// In ImapMailManager.get()
const messages = await this.fetchMessagesFromBox(imap, range);
const parsedMessages: ParsedMessage[] = messages.map((msg) => ({
  id: msg.id,
  threadId: msg.threadId, // Computed via threading algorithm
  connectionId: this.connectionId,
  subject: msg.payload.headers.find(h => h.name === 'Subject')?.value || '',
  decodedBody: msg.decodedBody, // ⚠️ CRITICAL - Must decode MIME
  body: msg.payload.body.data,
  sender: {
    name: msg.payload.headers.find(h => h.name === 'From')?.value || '',
    email: extractEmail(msg.payload.headers.find(h => h.name === 'From')?.value || ''),
  },
  to: parseRecipients(msg.payload.headers.find(h => h.name === 'To')?.value),
  cc: parseRecipients(msg.payload.headers.find(h => h.name === 'Cc')?.value),
  receivedOn: new Date(msg.internalDate).toISOString(),
  tags: msg.flags.map(flag => ({ id: flag, name: flag })),
  // ... other fields
}));

return {
  messages: parsedMessages,
  latest: parsedMessages[parsedMessages.length - 1],
  hasUnread: parsedMessages.some(m => m.tags.some(t => t.name !== '\\Seen')),
  totalReplies: parsedMessages.length,
  labels: [{ id: 'INBOX', name: 'INBOX' }],
  isLatestDraft: false,
};
```

---

## Testing Considerations

### AI Pipeline Tests
- Test workflow execution with IMAP messages
- Test message vectorization with IMAP ParsedMessage
- Test thread summarization with IMAP threads
- Test automatic draft generation for IMAP threads

### Data Format Tests
- Verify ParsedMessage format from IMAP driver
- Verify IGetThreadResponse format from IMAP driver
- Test decodedBody contains plain text (not MIME)
- Test threading algorithm groups messages correctly

### Integration Tests
- Test IMAP polling trigger
- Test workflow execution after IMAP sync
- Test vector storage and retrieval
- Test draft creation via IMAP driver

---

## Recommendations

### Immediate Actions
1. ✅ Fix runZeroWorkflow OAuth token validation (conditional check)
2. ✅ Create IMAP subscription factory with polling
3. ✅ Ensure IMAP driver returns ParsedMessage with decodedBody
4. ✅ Test threading algorithm with IMAP messages

### Future Enhancements
1. Configurable polling interval per connection
2. Smart polling (increase interval when no new messages)
3. IMAP IDLE support for near-real-time notifications
4. Per-folder workflow configuration
5. Custom workflow definitions per user

---

## Conclusion

The AI pipeline is **remarkably well-designed** and **highly decoupled** from email providers. The workflow engine provides flexibility, the AI models are powerful, and the vector storage is efficient.

**IMAP Integration Complexity**: **LOW**

The only requirements are:
1. Fix token validation in runZeroWorkflow (1 conditional check)
2. Create IMAP subscription factory with polling (~100 lines)
3. Ensure IMAP driver returns compliant ParsedMessage objects

**No changes needed to**:
- Workflow engine
- Workflow functions
- AI models
- Vector storage
- TRPC routes
- Prompt system

**Risk Level**: Low
**Complexity**: Low (mostly new code, minimal modifications)
**Impact**: None on existing OAuth providers

**Next Steps**:
1. Complete Phase 0.5: Subscription Factory Pattern Analysis
2. Complete Phase 0.6: TRPC Routes Analysis
3. Complete Phase 0.7: Type System Analysis
4. Create revised implementation plans
