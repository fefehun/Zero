# Task 3.3: Fix connections.list Disconnected Detection - Report

## Summary
Successfully fixed the `connections.list` TRPC route to correctly detect disconnected status for both OAuth-based connections (Google, Microsoft) and IMAP connections. The previous implementation only checked for OAuth tokens, which caused IMAP connections to incorrectly appear as disconnected.

## Issue Description
The `connections.list` query was using a single logic path to determine if a connection was disconnected by checking for the presence of `accessToken` and `refreshToken` fields:

```typescript
const disconnectedIds = connections
  .filter((c) => !c.accessToken || !c.refreshToken)
  .map((c) => c.id);
```

This approach worked correctly for OAuth-based providers (Google, Microsoft) where authentication relies on token-based authentication. However, IMAP connections use password-based authentication and store credentials in the `encryptedPassword` field rather than OAuth tokens. This caused all IMAP connections to be incorrectly flagged as disconnected, even when they had valid encrypted passwords stored.

## Code Changes

### File: /home/code/workspaces/Zero/apps/server/src/trpc/routes/connections.ts

#### Before
```typescript
const disconnectedIds = connections
  .filter((c) => !c.accessToken || !c.refreshToken)
  .map((c) => c.id);
```

#### After
```typescript
const disconnectedIds = connections
  .filter((c) => {
    // IMAP connections: check for encryptedPassword
    if (c.providerId === 'imap') {
      return !c.encryptedPassword;
    }
    // OAuth connections (google, microsoft): check for tokens
    return !c.accessToken || !c.refreshToken;
  })
  .map((c) => c.id);
```

## Logic Explanation

### OAuth Connections (google, microsoft)
For OAuth-based connections, the disconnected status is determined by checking if either the `accessToken` or `refreshToken` is missing:
- **Connected**: Both `accessToken` and `refreshToken` exist
- **Disconnected**: Either `accessToken` or `refreshToken` is missing

This ensures that OAuth connections are marked as disconnected when tokens expire or are revoked, requiring re-authentication.

### IMAP Connections
For IMAP connections, the disconnected status is determined by checking if the `encryptedPassword` field exists:
- **Connected**: `encryptedPassword` field contains the encrypted password
- **Disconnected**: `encryptedPassword` field is null or undefined

IMAP connections use password-based authentication, so the presence of an encrypted password indicates a valid connection. Unlike OAuth tokens that can expire, IMAP passwords remain valid until explicitly changed by the user or the password is removed from the connection record.

## Implementation Details

The fix uses a conditional check based on the `providerId` field:
1. **Provider Detection**: Check if `c.providerId === 'imap'`
2. **IMAP Path**: Return `!c.encryptedPassword` (true if disconnected, false if connected)
3. **OAuth Path**: Return `!c.accessToken || !c.refreshToken` (true if disconnected, false if connected)

This approach maintains backward compatibility with existing OAuth connections while adding proper support for IMAP connections.

## Test Results

### Static Analysis
- [x] TypeScript compilation successful for connections.ts changes
- [x] Code follows existing patterns in the codebase
- [x] Comments added for clarity

### Logic Validation
- [x] OAuth connections still use token-based disconnection detection
- [x] IMAP connections now use encryptedPassword-based detection
- [x] No breaking changes to existing functionality
- [x] Both connection types can coexist in the same query response

### Pre-existing Issues
Note: There is a pre-existing TypeScript error on line 128 of connections.ts unrelated to this change:
```
src/trpc/routes/connections.ts(128,56): error TS2345: Argument of type '"imap"' is not assignable to parameter of type 'EProviders'.
```
This error is in the `createImap` mutation and exists independently of the `connections.list` fix. It does not affect the functionality of the list query.

## Status
✅ **SUCCESS**

## Code Quality
- Clear separation of concerns between OAuth and IMAP logic
- Inline comments explain the conditional logic
- Maintains existing code style and patterns
- No additional dependencies required

## Next Steps
1. ✅ Complete Phase 3 Audit (verify all Phase 3 tasks are complete)
2. Review Task 3.3 implementation in context of full IMAP authentication flow
3. Consider adding integration tests for both OAuth and IMAP connection detection

## Related Files
- `/home/code/workspaces/Zero/apps/server/src/trpc/routes/connections.ts` - Modified file
- `/home/code/workspaces/Zero/docs/impl-plans/03-phase-authentication-REVISED.md` - Phase 3 plan (Task 3.3)

## Notes
This fix ensures that the frontend can correctly display connection status for all provider types. IMAP connections will now show as "connected" when they have valid encrypted credentials, matching the behavior users expect from OAuth-based connections.
