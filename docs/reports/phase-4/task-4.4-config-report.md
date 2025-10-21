# Task 4.4: Configure IMAP Poll Queue Infrastructure - Report

## Summary
Successfully configured Cloudflare Queues infrastructure for IMAP polling across all environments (local, staging, production) by updating wrangler.jsonc and env.ts. The configuration enables distributed, reliable message processing with retry logic and dead-letter queue support.

## Implementation
Modified two key configuration files:
1. `/home/code/workspaces/Zero/apps/server/wrangler.jsonc` - Queue definitions for all environments
2. `/home/code/workspaces/Zero/apps/server/src/env.ts` - TypeScript type bindings

## Code Changes

### 1. wrangler.jsonc - Local Environment

#### Producer Configuration (lines 99-101)
```jsonc
{
  "queue": "imap-poll-queue",
  "binding": "imap_poll_queue",
}
```

#### Consumer Configuration (lines 114-119)
```jsonc
{
  "queue": "imap-poll-queue",
  "max_batch_size": 10,
  "max_batch_timeout": 30,
  "max_retries": 3,
  "dead_letter_queue": "imap-poll-dlq",
}
```

### 2. wrangler.jsonc - Staging Environment

#### Producer Configuration (lines 337-339)
```jsonc
{
  "queue": "imap-poll-queue-staging",
  "binding": "imap_poll_queue",
}
```

#### Consumer Configuration (lines 352-357)
```jsonc
{
  "queue": "imap-poll-queue-staging",
  "max_batch_size": 10,
  "max_batch_timeout": 30,
  "max_retries": 3,
  "dead_letter_queue": "imap-poll-dlq-staging",
}
```

### 3. wrangler.jsonc - Production Environment

#### Producer Configuration (lines 576-578)
```jsonc
{
  "queue": "imap-poll-queue-prod",
  "binding": "imap_poll_queue",
}
```

#### Consumer Configuration (lines 591-596)
```jsonc
{
  "queue": "imap-poll-queue-prod",
  "max_batch_size": 10,
  "max_batch_timeout": 30,
  "max_retries": 3,
  "dead_letter_queue": "imap-poll-dlq-prod",
}
```

### 4. env.ts - Type Binding (line 27)
```typescript
export type ZeroEnv = {
  // ... other bindings
  subscribe_queue: Queue;
  imap_poll_queue: Queue;  // Added
  AI: Ai;
  // ... rest of bindings
};
```

## Configuration Details

### Queue Parameters

| Parameter | Value | Purpose |
|-----------|-------|---------|
| max_batch_size | 10 | Process up to 10 poll messages at once |
| max_batch_timeout | 30 | Wait max 30 seconds to fill batch |
| max_retries | 3 | Retry failed messages up to 3 times |
| dead_letter_queue | imap-poll-dlq(-env) | Failed messages after retries |

### Environment-Specific Queue Names

| Environment | Queue Name | DLQ Name |
|-------------|------------|----------|
| Local | imap-poll-queue | imap-poll-dlq |
| Staging | imap-poll-queue-staging | imap-poll-dlq-staging |
| Production | imap-poll-queue-prod | imap-poll-dlq-prod |

### Binding Consistency
All environments use the same binding name `imap_poll_queue`, ensuring code portability across environments.

## Queue Message Flow

```
ImapSubscriptionFactory.subscribe()
  |
  v
env.imap_poll_queue.send({ connectionId, action: 'start' })
  |
  v
Queue Consumer (main.ts)
  |-- action: 'start' --> Send poll with 10s delay
  |-- action: 'poll' --> Execute pollImap() --> Re-enqueue with 300s delay
  |-- action: 'stop' --> Stop polling (no re-enqueue)
  |
  v (on failure after 3 retries)
Dead Letter Queue (imap-poll-dlq)
```

## Retry Strategy

### Retry Behavior
1. **First Failure**: Automatic retry #1
2. **Second Failure**: Automatic retry #2
3. **Third Failure**: Automatic retry #3
4. **Fourth Failure**: Message moved to DLQ

### Error Scenarios
- **Transient Errors**: Connection timeouts, temporary IMAP server issues
- **Permanent Errors**: Invalid credentials, deleted connections
- **DLQ Monitoring**: Failed messages in DLQ require manual investigation

## Verification

### How to Verify Configuration

#### 1. Wrangler Validation
```bash
cd /home/code/workspaces/Zero/apps/server
npx wrangler deploy --dry-run --env local
npx wrangler deploy --dry-run --env staging
npx wrangler deploy --dry-run --env production
```

Expected: No configuration errors

#### 2. TypeScript Compilation
```bash
cd /home/code/workspaces/Zero/apps/server
npm run build
```

Expected: No type errors related to env.imap_poll_queue

#### 3. Queue Creation (on deploy)
```bash
# After deployment, verify queues exist
npx wrangler queues list

# Expected output should include:
# - imap-poll-queue (or -staging/-prod)
# - imap-poll-dlq (or -staging/-prod)
```

#### 4. Runtime Testing
```bash
# Subscribe an IMAP account
curl -X POST https://your-domain/api/subscribe \
  -H "Content-Type: application/json" \
  -d '{"connectionId": "test-id", "providerId": "imap"}'

# Check queue metrics
npx wrangler queues consumer get imap-poll-queue --env local
```

### Integration Testing
1. **Producer Test**: Verify ImapSubscriptionFactory can send messages
2. **Consumer Test**: Confirm main.ts processes messages
3. **Retry Test**: Simulate failures and verify retry attempts
4. **DLQ Test**: Verify messages reach DLQ after max retries

## Status
SUCCESS

## Next Steps
1. Deploy to local environment and test end-to-end polling
2. Monitor queue metrics and DLQ for issues
3. Proceed to Phase 4 Task 4.5: Implement IMAP-specific thread workflow handling
4. Consider implementing DLQ monitoring and alerting

## Notes
- Queue names follow existing naming convention (environment suffix)
- Batch size of 10 balances throughput with resource usage
- 5-minute poll interval configured in consumer logic (300s delay)
- Dead letter queues enable monitoring and debugging of persistent failures
