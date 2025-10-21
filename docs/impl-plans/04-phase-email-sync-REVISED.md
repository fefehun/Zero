# Phase 4: Email Sync & Subscription - REVISED

**Status**: Ready for Execution
**Estimated Time**: 2-3 hours
**Risk Level**: Medium
**Dependencies**: Phase 3 Complete

---

## Overview

Implement IMAP subscription factory with polling mechanism.

**Success Criteria**: IMAP connections poll for new messages, trigger workflows

---

## TASK 4.1: Create ImapSubscriptionFactory

**File**: `/apps/server/src/lib/factories/imap-subscription.factory.ts` (NEW)

```typescript
import { BaseSubscriptionFactory } from './base-subscription.factory';
import { EProviders } from '../../types';
import { env } from '../../env';

export class ImapSubscriptionFactory extends BaseSubscriptionFactory {
  readonly providerId = EProviders.imap;

  async subscribe({ body }: { body: { connectionId: string } }) {
    const { connectionId } = body;
    await this.initializeConnectionLabels(connectionId);

    // Schedule polling
    await env.imap_poll_queue.send({
      connectionId,
      action: 'start',
    });

    await env.subscribed_accounts.put(
      `${connectionId}__${EProviders.imap}`,
      'active',
    );

    return new Response('IMAP polling enabled', { status: 200 });
  }

  async unsubscribe({ body }: { body: { connectionId: string } }) {
    await env.imap_poll_queue.send({
      connectionId: body.connectionId,
      action: 'stop',
    });

    await env.subscribed_accounts.delete(`${body.connectionId}__${EProviders.imap}`);

    return new Response('IMAP polling disabled', { status: 200 });
  }

  async verifyToken() {
    return true; // Not needed for polling
  }
}
```

---

## TASK 4.2: Register IMAP Factory

**File**: `/apps/server/src/lib/factories/subscription-factory.registry.ts`

```typescript
import { ImapSubscriptionFactory } from './imap-subscription.factory';

const imapFactory = new ImapSubscriptionFactory();
subscriptionFactoryRegistry.set(EProviders.imap, imapFactory);

export { imapFactory };
```

---

## TASK 4.3: Create Poll Queue Consumer

**File**: `/apps/server/src/workers/imap-poll-consumer.ts` (NEW)

```typescript
export default {
  async queue(batch: MessageBatch, env: Env) {
    for (const message of batch.messages) {
      const { connectionId, action } = message.body;

      if (action === 'poll') {
        // Poll IMAP
        await pollImap(connectionId, env);

        // Re-enqueue
        await env.imap_poll_queue.send(
          { connectionId, action: 'poll' },
          { delaySeconds: 300 }, // 5 min
        );
      }
    }
  }
};

async function pollImap(connectionId: string, env: Env) {
  // Load connection, create driver, fetch new messages
  // Trigger workflows for new threads
}
```

---

## TASK 4.4: Update wrangler.toml

Add queue configuration:
```toml
[[queues.consumers]]
queue = "imap-poll-queue"
max_batch_size = 10
```

---

## PHASE 4 COMPLETION CHECKLIST

- [ ] ImapSubscriptionFactory created
- [ ] Factory registered
- [ ] Poll queue consumer created
- [ ] wrangler.toml updated
- [ ] Test polling works

---

## NEXT STEPS

➡️ **Proceed to Phase 5**: `05-phase-smtp-send-REVISED.md`
