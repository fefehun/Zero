# Task 4.1: Create ImapSubscriptionFactory - Report

**Date**: 2025-10-21
**Task**: Implement IMAP Subscription Factory with polling mechanism
**Status**: ✅ SUCCESS

---

## Summary

Successfully created the `ImapSubscriptionFactory` class that extends `BaseSubscriptionFactory` to manage IMAP email account subscriptions using a queue-based polling mechanism. This factory provides a clean interface for starting and stopping IMAP polling, following the established pattern used by Google and Microsoft subscription factories.

Unlike webhook-based providers (Google, Microsoft), IMAP requires periodic polling to check for new messages. The factory delegates polling logic to a queue consumer, enabling distributed, scalable, and configurable polling behavior.

---

## Implementation

### File Created

**Path**: `/home/code/workspaces/Zero/apps/server/src/lib/factories/imap-subscription.factory.ts`

**Location**: `apps/server/src/lib/factories/imap-subscription.factory.ts` (relative)

**Size**: ~5KB with comprehensive documentation

---

## Methods Implemented

### 1. subscribe({ body }: { body: SubscriptionData })

**Purpose**: Initiates IMAP polling for a connection

**Flow**:
1. **Validate connectionId** - Returns 400 error if missing
2. **Initialize connection labels** - Calls `this.initializeConnectionLabels(connectionId)` to set up default labels (INBOX, SENT, TRASH, etc.) in KV store
3. **Send 'start' message to poll queue** - Sends message to `env.imap_poll_queue` with action='start'
4. **Mark as active** - Stores connection in `env.subscribed_accounts` KV with value 'active'
5. **Return success** - Returns HTTP 200 response

**Error Handling**:
- Validates required connectionId parameter
- Wraps all operations in try-catch
- Performs cleanup on failure (removes from subscribed_accounts)
- Returns detailed error messages in JSON format
- Logs all operations and errors with `[IMAP-SUBSCRIPTION]` prefix

**Key Code**:
```typescript
await this.initializeConnectionLabels(connectionId);

await env.imap_poll_queue.send({
  connectionId,
  action: 'start',
});

await env.subscribed_accounts.put(
  `${connectionId}__${EProviders.imap}`,
  'active',
);

return new Response('IMAP polling enabled', { status: 200 });
```

---

### 2. unsubscribe({ body }: { body: UnsubscriptionData })

**Purpose**: Stops IMAP polling for a connection

**Flow**:
1. **Validate connectionId** - Returns 400 error if missing
2. **Check subscription status** - Queries `env.subscribed_accounts` to verify connection is subscribed
3. **Return early if not subscribed** - Returns 200 with message if not found or pending
4. **Send 'stop' message to poll queue** - Sends message to `env.imap_poll_queue` with action='stop'
5. **Remove from KV** - Deletes entry from `env.subscribed_accounts`
6. **Return success** - Returns HTTP 200 response

**Error Handling**:
- Validates required connectionId parameter
- Checks if connection is actually subscribed before proceeding
- Gracefully handles "not subscribed" case
- Returns detailed error messages on failure
- Comprehensive logging for debugging

**Key Code**:
```typescript
const existingState = await env.subscribed_accounts.get(
  `${connectionId}__${providerId || EProviders.imap}`
);

if (!existingState || existingState === 'pending') {
  return c.json({ message: 'not subscribed' }, 200);
}

await env.imap_poll_queue.send({
  connectionId,
  action: 'stop',
});

await env.subscribed_accounts.delete(`${connectionId}__${EProviders.imap}`);
```

---

### 3. verifyToken(_token: string)

**Purpose**: Verify token validity (not applicable for IMAP)

**Implementation**: Returns `true` immediately

**Rationale**:
- IMAP uses password-based authentication, not OAuth tokens
- Token verification is not applicable for this provider
- Actual credential validation happens during IMAP connection establishment in `ImapDriver`
- Method signature must be implemented to satisfy `BaseSubscriptionFactory` interface
- This approach follows the principle of least surprise - method exists but is a no-op

**Key Code**:
```typescript
public async verifyToken(_token: string): Promise<boolean> {
  // IMAP uses password-based authentication, not OAuth tokens
  // Actual authentication happens during IMAP connection in ImapDriver
  return true;
}
```

---

## Polling Mechanism

### Architecture

The factory uses a **queue-based polling architecture** to decouple subscription management from polling logic:

```
ImapSubscriptionFactory
    |
    | (sends 'start' message)
    v
imap_poll_queue (Cloudflare Queue)
    |
    | (consumed by)
    v
Poll Queue Consumer (Task 4.3)
    |
    | (polls IMAP server)
    v
ImapDriver.fetchNewMessages()
    |
    | (triggers)
    v
Thread Sync Workflows
```

### Queue Messages

**Start Polling**:
```typescript
{
  connectionId: "conn_123",
  action: "start"
}
```

**Stop Polling**:
```typescript
{
  connectionId: "conn_123",
  action: "stop"
}
```

**Poll Action** (sent by consumer for recurring polls):
```typescript
{
  connectionId: "conn_123",
  action: "poll"
}
```

### Benefits of Queue-Based Approach

1. **Decoupling**: Subscription logic is separate from polling logic
2. **Scalability**: Cloudflare Queues can distribute polling across workers
3. **Reliability**: Queue guarantees at-least-once delivery
4. **Configurability**: Poll intervals can be adjusted in consumer without changing factory
5. **Observability**: Queue metrics provide visibility into polling health
6. **Resource Management**: Prevents overwhelming IMAP servers with concurrent connections

### Polling Interval

The actual polling interval is configured in the **poll queue consumer** (Task 4.3), not in this factory. The planned interval is:
- **5 minutes** (300 seconds) between polls
- Configurable via `delaySeconds` parameter in queue message

---

## Integration with Existing Factories

### Consistency with BaseSubscriptionFactory Pattern

The implementation follows the exact same pattern as existing factories:

**1. Class Structure**:
- Extends `BaseSubscriptionFactory`
- Defines `readonly providerId = EProviders.imap`
- Implements all three required methods: `subscribe`, `unsubscribe`, `verifyToken`

**2. Type Safety**:
- Uses `SubscriptionData` type for subscribe method
- Uses `UnsubscriptionData` type for unsubscribe method
- Returns `Promise<Response>` for all methods

**3. Error Handling Pattern** (matches GoogleSubscriptionFactory):
- Validates required parameters
- Wraps operations in try-catch blocks
- Uses `c.json()` for JSON error responses
- Performs cleanup on failure
- Comprehensive logging with provider-specific prefix

**4. KV Storage Pattern**:
- Uses `subscribed_accounts` KV with key format: `${connectionId}__${providerId}`
- Uses `connection_labels` KV (via `initializeConnectionLabels()`)
- Checks subscription status before unsubscribing (matches Google pattern)

**5. Response Format**:
- Returns `new Response()` for success cases
- Uses `c.json()` for error cases
- Consistent HTTP status codes (200, 400, 500)

### Comparison with Other Factories

**GoogleSubscriptionFactory**:
- Webhook-based (Google Pub/Sub)
- Complex setup (topics, subscriptions, IAM policies)
- Real-time notifications
- Token verification via Google OAuth endpoint

**ImapSubscriptionFactory**:
- Poll-based (Cloudflare Queue)
- Simple setup (queue message)
- Periodic polling (5-minute intervals)
- No token verification (password-based auth)

**OutlookSubscriptionFactory**:
- Placeholder implementation (not yet complete)
- Will use webhook-based approach (Microsoft Graph webhooks)

---

## Error Handling

### Strategy

The factory implements **defensive error handling** with multiple layers of protection:

#### 1. Input Validation
```typescript
if (!connectionId) {
  return c.json({ error: 'connectionId is required' }, 400);
}
```

#### 2. Try-Catch Wrapping
All critical operations are wrapped in try-catch blocks to prevent unhandled exceptions.

#### 3. Graceful Degradation
```typescript
const existingState = await env.subscribed_accounts.get(...);
if (!existingState || existingState === 'pending') {
  return c.json({ message: 'not subscribed' }, 200);
}
```

#### 4. Cleanup on Failure
```typescript
catch (error) {
  try {
    await env.subscribed_accounts.delete(`${connectionId}__${EProviders.imap}`);
  } catch (cleanupError) {
    console.error('[IMAP-SUBSCRIPTION] Error during cleanup:', cleanupError);
  }
}
```

#### 5. Detailed Error Messages
```typescript
return c.json(
  {
    error: 'Failed to enable IMAP polling',
    details: error instanceof Error ? error.message : 'Unknown error'
  },
  500
);
```

#### 6. Comprehensive Logging
Every operation is logged with:
- `[IMAP-SUBSCRIPTION]` prefix for easy filtering
- Connection ID for traceability
- Success/failure status
- Error details for debugging

### Error Scenarios Handled

| Scenario | Handling |
|----------|----------|
| Missing connectionId | Return 400 error |
| Queue send failure | Catch error, cleanup, return 500 |
| KV storage failure | Catch error, log, return 500 |
| Already unsubscribed | Return 200 with message |
| Cleanup failure | Log error, continue (don't throw) |

---

## Status

✅ **SUCCESS**

**Completion Criteria Met**:
- [x] File created at correct path
- [x] Extends BaseSubscriptionFactory
- [x] Implements subscribe() method with polling schedule
- [x] Implements unsubscribe() method with cleanup
- [x] Implements verifyToken() method (returns true)
- [x] Proper TypeScript types used
- [x] Error handling implemented
- [x] Comprehensive documentation added
- [x] Follows existing factory patterns
- [x] Logging for observability

---

## Dependencies

### Environment Variables Required

The factory expects the following to be added to `ZeroEnv` type (will be done in Task 4.4):

```typescript
imap_poll_queue: Queue;
```

### KV Namespaces Used

Already present in environment:
- `subscribed_accounts`: Stores active IMAP subscriptions
- `connection_labels`: Stores email folder labels for connections

### Queue Integration

Requires **imap-poll-queue** to be:
1. Defined in `wrangler.toml` (Task 4.4)
2. Consumer implemented (Task 4.3)

---

## Code Quality

### TypeScript Best Practices

- ✅ Proper type imports from base factory
- ✅ Type safety for all parameters and return values
- ✅ Readonly property for providerId
- ✅ Access modifiers (public) for clarity
- ✅ Underscore prefix for unused parameter (_token)

### Documentation

- ✅ Class-level JSDoc explaining polling architecture
- ✅ Method-level JSDoc for all public methods
- ✅ Inline comments explaining key logic
- ✅ Flow diagrams in comments
- ✅ Rationale for design decisions

### Code Organization

- ✅ Clear separation of concerns
- ✅ Single responsibility per method
- ✅ Consistent error handling pattern
- ✅ Logical flow (validate → execute → cleanup)
- ✅ No code duplication

---

## Testing Considerations

### Manual Testing Checklist

Once queue consumer is implemented (Task 4.3):

1. **Subscribe Flow**:
   - [ ] Call subscribe() with valid connectionId
   - [ ] Verify 'start' message sent to queue
   - [ ] Verify connection in subscribed_accounts KV
   - [ ] Verify labels initialized in connection_labels KV

2. **Unsubscribe Flow**:
   - [ ] Call unsubscribe() with subscribed connectionId
   - [ ] Verify 'stop' message sent to queue
   - [ ] Verify connection removed from subscribed_accounts KV
   - [ ] Call unsubscribe() again and verify graceful handling

3. **Error Cases**:
   - [ ] Call subscribe() without connectionId
   - [ ] Call unsubscribe() without connectionId
   - [ ] Call unsubscribe() for non-subscribed connection

### Integration Testing

After Phase 4 completion:
- [ ] Subscribe IMAP account and verify polling starts
- [ ] Send test email and verify it's detected within 5 minutes
- [ ] Unsubscribe and verify polling stops
- [ ] Verify no errors in logs during subscribe/unsubscribe cycle

---

## Next Steps

### Immediate Next Task

✅ **Proceed to Task 4.2: Register IMAP Factory**

**Action Required**: Update subscription factory registry to include ImapSubscriptionFactory

**File**: `/home/code/workspaces/Zero/apps/server/src/lib/factories/subscription-factory.registry.ts`

**Changes**:
```typescript
import { ImapSubscriptionFactory } from './imap-subscription.factory';

const imapFactory = new ImapSubscriptionFactory();
subscriptionFactoryRegistry.set(EProviders.imap, imapFactory);

export { imapFactory };
```

### Subsequent Tasks

1. **Task 4.3**: Create poll queue consumer to handle 'start', 'stop', 'poll' actions
2. **Task 4.4**: Update wrangler.toml with queue configuration
3. **Task 4.5**: Add `imap_poll_queue` to ZeroEnv type definition

---

## Technical Notes

### Why Queue-Based Polling?

**Alternative Approaches Considered**:

1. **Cron-based polling** (Scheduled Workers):
   - ❌ Limited to 1-minute minimum interval
   - ❌ Difficult to manage per-connection schedules
   - ❌ No easy way to start/stop polling for individual connections

2. **Durable Objects with alarms**:
   - ❌ More complex state management
   - ❌ Requires DO for each connection
   - ❌ More expensive at scale

3. **Queue-based polling** (Chosen):
   - ✅ Flexible intervals (any duration via delaySeconds)
   - ✅ Easy start/stop per connection
   - ✅ Built-in retry and dead-letter queue
   - ✅ Scales automatically
   - ✅ Simple state management (KV)

### Polling Frequency Considerations

**5-minute interval chosen because**:
- Balance between responsiveness and resource usage
- Typical IMAP server rate limits are ~60 requests/hour
- Most users don't require instant email delivery
- Can be adjusted in consumer without changing factory

**Future Optimizations**:
- Smart polling based on user activity
- Adaptive intervals (faster during business hours)
- IMAP IDLE for real-time notifications (requires persistent connection)

---

## Conclusion

The ImapSubscriptionFactory successfully implements a clean, maintainable, and scalable approach to IMAP email polling. It follows established patterns, includes comprehensive error handling, and integrates seamlessly with the existing subscription architecture.

The queue-based design provides flexibility for future enhancements while keeping the initial implementation simple and reliable.

---

**Report Generated**: 2025-10-21
**Implementation Time**: ~30 minutes
**Files Created**: 1
**Lines of Code**: ~165 (including documentation)
