# Subscription Factory Pattern Analysis

**Date**: 2025-10-20
**Status**: ✅ COMPLETED

---

## Executive Summary

The subscription system uses a **factory pattern** to manage email change notifications per provider. Google uses **Gmail Push Notifications** via Google Cloud Pub/Sub, triggering workflows when emails arrive. IMAP will require a **polling-based subscription** factory that periodically checks for new messages.

### Critical Findings

1. **Base abstract factory** - Defines subscribe/unsubscribe interface
2. **Provider registry** - Maps provider ID to factory instance
3. **Google uses Pub/Sub** - Real-time push notifications via Cloud Pub/Sub
4. **IMAP needs polling** - No push support, requires scheduled checks
5. **Subscription initialization** - Creates connection labels on first subscribe
6. **Currently only Google** - Microsoft (Outlook) factory commented out

---

## Factory Pattern Architecture

### BaseSubscriptionFactory

**Location**: `/apps/server/src/lib/factories/base-subscription.factory.ts`

**Purpose**: Abstract base class for all subscription factories

```typescript
export abstract class BaseSubscriptionFactory {
  abstract readonly providerId: EProviders;

  abstract subscribe(data: { body: SubscriptionData }): Promise<Response>;

  abstract unsubscribe(data: { body: UnsubscriptionData }): Promise<Response>;

  abstract verifyToken(token: string): Promise<boolean>;

  protected async getConnectionFromDb(connectionId: string) {
    const { db, conn } = createDb(env.HYPERDRIVE.connectionString);
    const connectionData = await db.query.connection.findFirst({
      where: eq(connection.id, connectionId),
    });
    await conn.end();
    return connectionData;
  }

  protected async initializeConnectionLabels(connectionId: string): Promise<void> {
    const existingLabels = await env.connection_labels.get(connectionId);
    if (!existingLabels?.trim().length) {
      await env.connection_labels.put(connectionId, JSON.stringify(defaultLabels));
    }
  }
}
```

**Key Methods**:
- `subscribe()` - Enable email change notifications
- `unsubscribe()` - Disable notifications
- `verifyToken()` - Validate webhook/push notification authenticity
- `getConnectionFromDb()` - Load connection record
- `initializeConnectionLabels()` - Setup default AI labels

**IMAP Impact**: ✅ Will extend this class

---

## Google Subscription Factory

**Location**: `/apps/server/src/lib/factories/google-subscription.factory.ts`

### Architecture

**Push Notification Flow**:
```
Gmail → Pub/Sub Topic → Pub/Sub Subscription → Cloudflare Worker → Workflow Runner
```

### Key Components

#### 1. Service Account Management

**Purpose**: Authenticate with Google Cloud APIs

```typescript
export const getServiceAccount = (): GoogleServiceAccount => {
  const serviceAccountJson = env.GOOGLE_S_ACCOUNT;
  if (!serviceAccountJson || serviceAccountJson === '{}') {
    throw new Error('GOOGLE_S_ACCOUNT environment variable is required');
  }
  return JSON.parse(serviceAccountJson) as GoogleServiceAccount;
};
```

**Service Account Structure**:
```typescript
{
  type: string;
  project_id: string;
  private_key_id: string;
  private_key: string;
  client_email: string;
  client_id: string;
}
```

**IMAP Impact**: ❌ Not needed - IMAP doesn't use Google Cloud

#### 2. Access Token Management

**Purpose**: Get OAuth token for Google Cloud API calls

```typescript
private async getAccessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);

  // Return cached token if still valid (with 5 minute buffer)
  if (this.accessToken && this.tokenExpiry > now + 300) {
    return this.accessToken;
  }

  // Create JWT assertion
  const payload = {
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/cloud-platform',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  };

  const signedJWT = await jwt.sign(payload, serviceAccount.private_key, {
    algorithm: 'RS256',
  });

  // Exchange JWT for access token
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    body: JSON.stringify({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: signedJWT,
    }),
  });

  const data = await response.json();
  this.accessToken = data.access_token;
  this.tokenExpiry = now + 3600;

  return this.accessToken;
}
```

**IMAP Impact**: ❌ Not needed - IMAP uses connection credentials

#### 3. Pub/Sub Topic Setup

**Purpose**: Create Cloud Pub/Sub topic for Gmail push notifications

```typescript
private async setupPubSubTopic(topicName: string): Promise<void> {
  const baseUrl = `https://pubsub.googleapis.com/v1/projects/${project_id}`;
  const topicUrl = `${baseUrl}/topics/${topicName}`;

  // Create topic if doesn't exist
  if (!(await this.resourceExists(topicUrl))) {
    await this.makeAuthenticatedRequest(topicUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Set IAM policy (allow gmail-api-push@system.gserviceaccount.com to publish)
  await this.setTopicIamPolicy(topicName);
}
```

**IMAP Impact**: ❌ Not applicable - IMAP uses polling

#### 4. Pub/Sub Subscription Creation

**Purpose**: Create push subscription pointing to Cloudflare Worker

```typescript
private async createPubSubSubscription(
  subscriptionName: string,
  pushEndpoint: string,
): Promise<void> {
  const url = `https://pubsub.googleapis.com/v1/projects/${project_id}/subscriptions/${subscriptionName}`;

  const requestBody = {
    topic: `projects/${project_id}/topics/${subscriptionName}`,
    pushConfig: {
      oidcToken: {
        serviceAccountEmail: serviceAccount.client_email,
      },
      pushEndpoint, // Cloudflare Worker URL
      noWrapper: {
        writeMetadata: true,
      },
    },
  };

  await this.makeAuthenticatedRequest(url, {
    method: 'PUT',
    body: JSON.stringify(requestBody),
  });
}
```

**IMAP Impact**: ❌ Not applicable

#### 5. Gmail Watch Setup

**Purpose**: Tell Gmail to send notifications to Pub/Sub topic

```typescript
private async setupGmailWatch(
  connectionData: typeof connection.$inferSelect,
  topicName: string,
): Promise<void> {
  // Create OAuth2 client with user's refresh token
  const auth = new OAuth2Client({
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
  });

  auth.setCredentials({
    refresh_token: connectionData.refreshToken,
    scope: 'https://www.googleapis.com/auth/gmail.readonly',
  });

  // Refresh access token
  const { credentials } = await auth.refreshAccessToken();

  // Setup watch via Gmail API
  const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/watch', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      labelIds: ['INBOX'],
      topicName: `projects/${project_id}/topics/${topicName}`,
    }),
  });
}
```

**IMAP Impact**: ❌ Not applicable - IMAP has no watch API

### subscribe() Method

**Purpose**: Enable push notifications for Gmail connection

**Flow**:
1. Load connection from database
2. Initialize connection labels (default AI labels)
3. Generate topic name: `notifications__${connectionId}`
4. Setup Pub/Sub topic
5. Create Pub/Sub subscription pointing to Cloudflare Worker
6. Setup Gmail watch for INBOX
7. Store subscription state

**IMAP Equivalent**: Poll scheduling

### unsubscribe() Method

**Purpose**: Disable push notifications

**Flow**:
1. Load connection from database
2. Stop Gmail watch
3. Delete Pub/Sub subscription
4. Clear subscription state

**IMAP Equivalent**: Cancel polling job

### verifyToken() Method

**Purpose**: Validate incoming push notification authenticity

**IMAP Impact**: ❌ Not needed - polling is internal

---

## Factory Registry

**Location**: `/apps/server/src/lib/factories/subscription-factory.registry.ts`

### Purpose

Map provider IDs to factory instances

**Code**:
```typescript
const subscriptionFactoryRegistry = new Map<EProviders, BaseSubscriptionFactory>();

// Register Google factory
const googleFactory = new GoogleSubscriptionFactory();
subscriptionFactoryRegistry.set(EProviders.google, googleFactory);

export function getSubscriptionFactory(provider: EProviders): BaseSubscriptionFactory {
  const factory = subscriptionFactoryRegistry.get(provider);
  if (!factory) {
    throw new Error(`No subscription factory registered for provider: ${provider}`);
  }
  return factory;
}
```

**Usage**:
```typescript
const factory = getSubscriptionFactory(connection.providerId);
await factory.subscribe({ body: { connectionId: connection.id } });
```

**IMAP Integration**:
```typescript
// Register IMAP factory
import { ImapSubscriptionFactory } from './imap-subscription.factory';
const imapFactory = new ImapSubscriptionFactory();
subscriptionFactoryRegistry.set(EProviders.imap, imapFactory);
```

---

## IMAP Subscription Factory Design

### ImapSubscriptionFactory

**Location**: `/apps/server/src/lib/factories/imap-subscription.factory.ts` (to be created)

**Purpose**: Poll IMAP servers for new messages

**Implementation Approach**:

```typescript
export class ImapSubscriptionFactory extends BaseSubscriptionFactory {
  readonly providerId = EProviders.imap;
  private defaultPollInterval = 5 * 60 * 1000; // 5 minutes

  async subscribe(data: { body: SubscriptionData }): Promise<Response> {
    const { connectionId } = data.body;
    const connectionData = await this.getConnectionFromDb(connectionId);

    if (!connectionData) {
      return new Response('Connection not found', { status: 404 });
    }

    // Initialize connection labels
    await this.initializeConnectionLabels(connectionId);

    // Schedule polling job via Cloudflare Durable Object or Queue
    await env.imap_poll_scheduler.send({
      connectionId,
      pollInterval: this.defaultPollInterval,
      action: 'start',
    });

    // Store subscription state
    await env.subscribed_accounts.put(
      `${connectionId}__${EProviders.imap}`,
      'active',
    );

    return new Response('IMAP polling enabled', { status: 200 });
  }

  async unsubscribe(data: { body: UnsubscriptionData }): Promise<Response> {
    const { connectionId } = data.body;

    // Cancel polling job
    await env.imap_poll_scheduler.send({
      connectionId,
      action: 'stop',
    });

    // Clear subscription state
    await env.subscribed_accounts.delete(`${connectionId}__${EProviders.imap}`);

    return new Response('IMAP polling disabled', { status: 200 });
  }

  async verifyToken(token: string): Promise<boolean> {
    // Not needed for polling-based subscription
    return true;
  }

  // Poll method (called by scheduler)
  async poll(connectionId: string): Promise<void> {
    const connectionData = await this.getConnectionFromDb(connectionId);
    if (!connectionData) {
      console.error(`Connection ${connectionId} not found during poll`);
      return;
    }

    // Create IMAP driver
    const driver = await connectionToDriver(connectionData);

    // Get last sync UIDs
    const lastSyncUid = JSON.parse(connectionData.lastSyncUid || '{}');

    // Poll each folder
    const folders = ['INBOX', 'Sent', 'Drafts'];
    for (const folder of folders) {
      try {
        const lastUid = lastSyncUid[folder] || 0;

        // Fetch new messages
        const newMessages = await driver.list({
          folder,
          sinceUid: lastUid,
          maxResults: 50,
        });

        // Group by thread
        const threadIds = [...new Set(newMessages.threads.map(t => t.id))];

        // Trigger workflows for each thread
        for (const threadId of threadIds) {
          await this.triggerThreadWorkflow(connectionId, threadId, connectionData);
        }

        // Update last UID
        if (newMessages.threads.length > 0) {
          const maxUid = Math.max(
            ...newMessages.threads.map(t => parseInt(t.id.split('-')[1] || '0'))
          );
          lastSyncUid[folder] = maxUid;
        }
      } catch (error) {
        console.error(`Error polling folder ${folder}:`, error);
      }
    }

    // Save updated lastSyncUid
    const { db, conn } = createDb(env.HYPERDRIVE.connectionString);
    await db
      .update(connection)
      .set({ lastSyncUid: JSON.stringify(lastSyncUid) })
      .where(eq(connection.id, connectionId));
    await conn.end();
  }

  private async triggerThreadWorkflow(
    connectionId: string,
    threadId: string,
    foundConnection: any,
  ): Promise<void> {
    // Trigger workflow runner
    const workflowRunner = env.WORKFLOW_RUNNER.get(
      env.WORKFLOW_RUNNER.idFromName(connectionId),
    );

    await workflowRunner.runThreadWorkflow({
      connectionId,
      threadId,
      providerId: EProviders.imap,
    });
  }
}
```

---

## Polling Scheduler Design

### Options

#### Option 1: Cloudflare Durable Object
**Pros**: State persistence, built-in alarm API
**Cons**: More complex

**Implementation**:
```typescript
export class ImapPollScheduler extends DurableObject {
  private alarms = new Map<string, AlarmConfig>();

  async schedulePolling(connectionId: string, interval: number) {
    const nextPoll = Date.now() + interval;
    await this.state.storage.put(`alarm:${connectionId}`, nextPoll);
    await this.ctx.storage.setAlarm(nextPoll);
  }

  async alarm() {
    // Get all scheduled polls
    const alarms = await this.state.storage.list({ prefix: 'alarm:' });
    for (const [key, timestamp] of alarms) {
      if (timestamp <= Date.now()) {
        const connectionId = key.replace('alarm:', '');
        await imapFactory.poll(connectionId);
        // Reschedule
        await this.schedulePolling(connectionId, defaultInterval);
      }
    }
  }
}
```

#### Option 2: Cloudflare Queue
**Pros**: Simpler, built-in retry
**Cons**: Less precise timing

**Implementation**:
```typescript
// In consumer worker
export default {
  async queue(batch: MessageBatch) {
    for (const message of batch.messages) {
      const { connectionId, action } = message.body;
      if (action === 'poll') {
        await imapFactory.poll(connectionId);
        // Re-enqueue for next poll
        await env.imap_poll_queue.send(
          { connectionId, action: 'poll' },
          { delaySeconds: 300 }, // 5 minutes
        );
      }
    }
  }
};
```

#### Option 3: Cloudflare Cron
**Pros**: Simplest
**Cons**: Fixed interval for all connections

**Implementation**:
```typescript
// In cron trigger
export default {
  async scheduled(event: ScheduledEvent, env: Env) {
    // Get all active IMAP connections
    const activeConnections = await env.subscribed_accounts.list({
      prefix: '__imap',
    });

    for (const { name } of activeConnections.keys) {
      const connectionId = name.split('__')[0];
      await imapFactory.poll(connectionId);
    }
  }
};
```

**Recommendation**: **Option 2 (Cloudflare Queue)** for flexibility and simplicity

---

## Required Changes for IMAP

### 1. Create ImapSubscriptionFactory

**File**: `/apps/server/src/lib/factories/imap-subscription.factory.ts`

**Actions**:
- Extend BaseSubscriptionFactory
- Implement subscribe/unsubscribe with queue-based polling
- Implement poll() method
- Add triggerThreadWorkflow() helper

### 2. Register IMAP Factory

**File**: `/apps/server/src/lib/factories/subscription-factory.registry.ts`

**Action**: Add IMAP factory registration
```typescript
import { ImapSubscriptionFactory } from './imap-subscription.factory';
const imapFactory = new ImapSubscriptionFactory();
subscriptionFactoryRegistry.set(EProviders.imap, imapFactory);
```

### 3. Create Poll Queue Consumer

**File**: `/apps/server/src/workers/imap-poll-consumer.ts` (new)

**Purpose**: Process polling queue messages

### 4. Update wrangler.toml

**Action**: Add queue configuration
```toml
[[queues.consumers]]
queue = "imap-poll-queue"
max_batch_size = 10
max_batch_timeout = 30
max_retries = 3
dead_letter_queue = "imap-poll-dlq"
```

---

## Testing Considerations

### Subscription Tests
- Test subscribe creates polling job
- Test unsubscribe cancels polling job
- Test poll fetches new messages
- Test poll triggers workflows
- Test lastSyncUid updates correctly

### Integration Tests
- Test IMAP connection polling
- Test workflow triggering from poll
- Test error handling (connection failure, IMAP timeout)
- Test queue retry behavior

---

## Recommendations

### Immediate Actions
1. ✅ Create ImapSubscriptionFactory class
2. ✅ Register factory in registry
3. ✅ Implement queue-based polling
4. ✅ Add poll consumer worker

### Future Enhancements
1. Configurable poll interval per connection
2. Smart polling (adaptive interval based on activity)
3. IMAP IDLE support for near-real-time (where supported)
4. Connection health monitoring
5. Poll queue prioritization (active users first)

---

## Conclusion

The subscription factory pattern is **well-designed** and **easily extensible**. Adding IMAP support requires:
1. New ImapSubscriptionFactory (~150 lines)
2. Poll queue consumer (~50 lines)
3. Factory registration (1 line)

**No changes needed to**:
- BaseSubscriptionFactory
- Factory registry pattern
- Existing Google factory

**Risk Level**: Low
**Complexity**: Low (new code, no modifications)
**Impact**: None on existing providers

**Next Steps**:
1. Complete Phase 0.6: TRPC Routes Analysis
2. Complete Phase 0.7: Type System Analysis
3. Create revised implementation plans
