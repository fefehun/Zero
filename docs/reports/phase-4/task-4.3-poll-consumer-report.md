# Task 4.3: Create IMAP Poll Queue Consumer - Report

## Summary
Successfully implemented IMAP polling infrastructure by adding queue consumer logic directly into the main.ts queue handler and creating a dedicated pollImap method. The implementation enables periodic polling of IMAP accounts for new messages and triggers workflows for new threads.

## Implementation
Modified `/home/code/workspaces/Zero/apps/server/src/main.ts` to add:

1. **Queue Consumer Handler** - Added `imap-poll-queue` case to existing queue() method
2. **Poll Logic Method** - Created private `pollImap()` method with full implementation

### Architecture Decision
Rather than creating a separate `imap-poll-consumer.ts` file, the consumer was integrated into the existing queue handler in main.ts, following the established pattern used by other queues (subscribe-queue, thread-queue, send-email-queue).

## Code Changes

### Queue Consumer Handler (lines 1094-1142)
```typescript
case batch.queue.startsWith('imap-poll-queue'): {
  await Promise.all(
    batch.messages.map(async (msg: any) => {
      const { connectionId, action } = msg.body;

      try {
        if (action === 'start') {
          console.log(`[IMAP_POLL] Starting polling for connection: ${connectionId}`);
          // Send first poll message with initial delay
          await env.imap_poll_queue.send(
            { connectionId, action: 'poll' },
            { delaySeconds: 10 } // Initial poll after 10 seconds
          );
        } else if (action === 'poll') {
          console.log(`[IMAP_POLL] Polling connection: ${connectionId}`);

          // Check if connection is still subscribed
          const subscriptionState = await env.subscribed_accounts.get(
            `${connectionId}__${EProviders.imap}`
          );

          if (subscriptionState !== 'active') {
            console.log(`[IMAP_POLL] Connection ${connectionId} is not active, stopping poll`);
            return;
          }

          // Poll IMAP for new messages
          try {
            await this.pollImap(connectionId);
          } catch (error) {
            console.error(`[IMAP_POLL] Error polling connection ${connectionId}:`, error);
          }

          // Re-enqueue for next poll (5 minutes)
          await env.imap_poll_queue.send(
            { connectionId, action: 'poll' },
            { delaySeconds: 300 } // 5 minutes
          );
        } else if (action === 'stop') {
          console.log(`[IMAP_POLL] Stopping polling for connection: ${connectionId}`);
          // Do nothing, polling will stop
        }
      } catch (error) {
        console.error(`[IMAP_POLL] Error processing message for connection ${connectionId}:`, error);
      }
    }),
  );
  break;
}
```

### Poll Implementation Method (lines 1298-1422)
```typescript
/**
 * Poll IMAP connection for new messages
 *
 * This method:
 * 1. Loads the connection from database
 * 2. Creates an IMAP driver using connectionToDriver
 * 3. Fetches new messages since last sync (using lastSyncUid)
 * 4. Triggers thread workflow for each new thread
 * 5. Updates lastSyncUid in database
 */
private async pollImap(connectionId: string) {
  const tracer = initTracing();
  const span = tracer.startSpan('imap_poll', {
    attributes: {
      'connection.id': connectionId,
      'provider.id': EProviders.imap,
    },
  });

  try {
    console.log(`[IMAP_POLL] Polling connection: ${connectionId}`);

    // 1. Load connection from database
    const { db, conn } = createDb(this.env.HYPERDRIVE.connectionString);
    let foundConnection;

    try {
      const [connectionRecord] = await db
        .select()
        .from(connection)
        .where(eq(connection.id, connectionId));

      if (!connectionRecord) {
        console.error(`[IMAP_POLL] Connection not found: ${connectionId}`);
        span.setStatus({ code: 2, message: 'Connection not found' });
        return;
      }

      if (connectionRecord.providerId !== EProviders.imap) {
        console.error(`[IMAP_POLL] Connection is not IMAP: ${connectionId}`);
        span.setStatus({ code: 2, message: 'Not an IMAP connection' });
        return;
      }

      foundConnection = connectionRecord;
      console.log(`[IMAP_POLL] Found connection: ${connectionId}`);
    } finally {
      await conn.end();
    }

    // 2. Create driver using connectionToDriver
    const { connectionToDriver } = await import('./lib/server-utils');
    const driver = await connectionToDriver(foundConnection);

    // 3. Fetch new messages from INBOX
    const lastSyncUid = foundConnection.lastSyncUid || '0';
    console.log(`[IMAP_POLL] Last sync UID: ${lastSyncUid}`);

    // List messages in INBOX (get threads since last sync)
    const response = await driver.list({
      folder: 'INBOX',
      pageToken: lastSyncUid === '0' ? undefined : parseInt(lastSyncUid),
      maxResults: 50, // Limit to 50 new threads per poll
    });

    console.log(`[IMAP_POLL] Found ${response.threads.length} new threads`);
    span.setAttribute('threads.count', response.threads.length);

    // 4. Trigger thread workflow for each new thread
    if (response.threads.length > 0) {
      const workflowRunner = env.WORKFLOW_RUNNER.get(env.WORKFLOW_RUNNER.newUniqueId());

      for (const thread of response.threads) {
        try {
          console.log(`[IMAP_POLL] Triggering workflow for thread: ${thread.id}`);

          await workflowRunner.runThreadWorkflowWithoutEffect({
            connectionId,
            threadId: thread.id,
            providerId: EProviders.imap,
          });

          console.log(`[IMAP_POLL] Workflow triggered for thread: ${thread.id}`);
        } catch (error) {
          console.error(`[IMAP_POLL] Error triggering workflow for thread ${thread.id}:`, error);
          span.recordException(error as Error);
        }
      }

      // 5. Update lastSyncUid in database
      const maxUid = Math.max(
        ...response.threads
          .map(t => t.$raw && typeof t.$raw === 'object' && 'uid' in t.$raw ? (t.$raw as any).uid : 0)
          .filter(uid => typeof uid === 'number' && uid > 0)
      );

      if (maxUid > 0) {
        const { db: updateDb, conn: updateConn } = createDb(this.env.HYPERDRIVE.connectionString);
        try {
          await updateDb
            .update(connection)
            .set({ lastSyncUid: maxUid.toString() })
            .where(eq(connection.id, connectionId));

          console.log(`[IMAP_POLL] Updated lastSyncUid to: ${maxUid}`);
          span.setAttribute('last_sync_uid', maxUid.toString());
        } finally {
          await updateConn.end();
        }
      }
    }

    span.setStatus({ code: 1, message: 'Success' });
    console.log(`[IMAP_POLL] Poll completed for connection: ${connectionId}`);
  } catch (error) {
    console.error(`[IMAP_POLL] Error polling connection ${connectionId}:`, error);
    span.recordException(error as Error);
    span.setStatus({ code: 2, message: (error as Error).message });
    throw error;
  } finally {
    span.end();
  }
}
```

## Key Features

### Action Handling
- **start**: Initiates polling with 10-second initial delay
- **poll**: Executes polling logic and re-enqueues with 5-minute delay
- **stop**: Halts polling by not re-enqueueing

### Polling Logic
1. **Connection Validation**: Verifies connection exists and is IMAP
2. **State Check**: Confirms subscription is still active before polling
3. **Driver Creation**: Uses existing connectionToDriver utility
4. **Incremental Sync**: Uses lastSyncUid for efficient polling
5. **Workflow Triggering**: Processes each new thread through WorkflowRunner
6. **State Persistence**: Updates lastSyncUid after successful poll

### Error Handling
- Graceful degradation if connection not found
- Provider type validation
- Per-thread error handling during workflow triggering
- Full error logging with tracing integration

### Observability
- OpenTelemetry tracing integration
- Comprehensive console logging with [IMAP_POLL] prefix
- Span attributes for connection, provider, thread count, and lastSyncUid
- Exception recording in spans

## Verification

### How to Verify
1. **Queue Handler**: Confirm `imap-poll-queue` case exists in queue() method
2. **Poll Method**: Verify pollImap() method is present and private
3. **Subscription Flow**: Test ImapSubscriptionFactory sends 'start' action
4. **Polling Cycle**: Monitor logs for 5-minute recurring polls
5. **Workflow Triggering**: Verify new IMAP threads trigger workflows
6. **State Updates**: Check database lastSyncUid updates after polls

### Testing Steps
```bash
# 1. Subscribe an IMAP account
POST /api/subscribe
{
  "connectionId": "test-imap-connection",
  "providerId": "imap"
}

# 2. Monitor logs for polling activity
# Expected: [IMAP_POLL] Starting polling for connection
# Expected: [IMAP_POLL] Polling connection (every 5 minutes)

# 3. Send test email to IMAP account
# Expected: [IMAP_POLL] Found X new threads
# Expected: [IMAP_POLL] Triggering workflow for thread

# 4. Verify database
SELECT lastSyncUid FROM connection WHERE id = 'test-imap-connection';
# Expected: Updated UID value
```

## Status
SUCCESS

## Next Steps
Task 4.4: Update wrangler.jsonc and env.ts with queue configuration
