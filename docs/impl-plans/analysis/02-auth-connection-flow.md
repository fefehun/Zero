# Authentication & Connection Flow Analysis

**Date**: 2025-10-20
**Status**: ✅ COMPLETED

---

## Executive Summary

The current authentication system uses **Better Auth** with OAuth2 for Google and Microsoft. Connection creation is tightly coupled to the OAuth flow via the `connectionHandlerHook`. IMAP support requires a **completely separate connection creation path** that bypasses OAuth.

### Critical Findings

1. **connectionHandlerHook is OAuth-only** - IMAP needs separate creation endpoint
2. **connectionToDriver validates OAuth tokens** - Must be conditional based on providerId
3. **Subscribe queue is OAuth-specific** - IMAP needs different subscription mechanism
4. **getActiveConnection assumes valid tokens** - Needs IMAP-aware logic
5. **No manual connection creation endpoint** - Must create new TRPC route

---

## Current OAuth Flow

### Step-by-Step OAuth Connection Creation

#### 1. User Initiates OAuth
**Location**: Frontend → `/api/auth/login/google` or `/api/auth/login/microsoft`

**Better Auth Flow**:
1. User clicks "Connect Google" or "Connect Microsoft"
2. Redirect to OAuth provider
3. User grants permissions
4. Callback to `/api/auth/callback/{provider}`

#### 2. Better Auth Account Creation
**Location**: Better Auth internal → `databaseHooks.account.create.after`

**Trigger**: After Better Auth creates/updates account record

#### 3. connectionHandlerHook Execution
**Location**: `/apps/server/src/lib/auth.ts` (lines 91-158)

**Critical Code**:
```typescript
const connectionHandlerHook = async (account: Account) => {
  // 1. Validate OAuth tokens
  if (!account.accessToken || !account.refreshToken) {
    throw new APIError('EXPECTATION_FAILED', {
      message: 'Missing Access/Refresh Tokens',
    });
  }

  // 2. Create driver to fetch user info
  const driver = createDriver(account.providerId, {
    auth: {
      accessToken: account.accessToken,
      refreshToken: account.refreshToken,
      userId: account.userId,
      email: '',
    },
  });

  // 3. Fetch user info from provider
  const userInfo = await driver.getUserInfo().catch(async () => {
    if (account.accessToken) {
      await driver.revokeToken(account.accessToken);
      await resetConnection(account.id);
    }
    throw new Response(null, { status: 301, headers: { Location: '/' } });
  });

  // 4. Validate user info
  if (!userInfo?.address) {
    await Promise.allSettled(
      [account.accessToken, account.refreshToken]
        .filter(Boolean)
        .map((t) => driver.revokeToken(t as string)),
    );
    await resetConnection(account.id);
    throw new Response(null, { status: 303, headers: { Location: '/' } });
  }

  // 5. Prepare connection data
  const updatingInfo = {
    name: userInfo.name || 'Unknown',
    picture: userInfo.photo || '',
    accessToken: account.accessToken,
    refreshToken: account.refreshToken,
    scope: driver.getScope(),
    expiresAt: new Date(Date.now() + (account.accessTokenExpiresAt?.getTime() || 3600000)),
  };

  // 6. Create connection in database
  const db = await getZeroDB(account.userId);
  const [result] = await db.createConnection(
    account.providerId as EProviders,
    userInfo.address,
    updatingInfo,
  );

  // 7. Send welcome emails (production only)
  if (env.NODE_ENV === 'production') {
    await Effect.runPromise(
      scheduleCampaign({ address: userInfo.address, name: userInfo.name || 'there' }),
    );
  }

  // 8. Trigger subscription creation
  if (env.GOOGLE_S_ACCOUNT && env.GOOGLE_S_ACCOUNT !== '{}') {
    await env.subscribe_queue.send({
      connectionId: result.id,
      providerId: account.providerId,
    });
  }
};
```

**Registered As**:
```typescript
databaseHooks: {
  account: {
    create: { after: connectionHandlerHook },
    update: { after: connectionHandlerHook },
  },
}
```

---

## Connection Management

### getActiveConnection()
**Location**: `/apps/server/src/lib/server-utils.ts` (lines 546-574)

**Purpose**: Retrieve user's active email connection

**Logic**:
```typescript
export const getActiveConnection = async () => {
  const c = getContext<HonoContext>();
  const { sessionUser, auth } = c.var;
  if (!sessionUser) throw new Error('Session Not Found');

  const db = await getZeroDB(sessionUser.id);
  const userData = await db.findUser();

  // Try default connection first
  if (userData?.defaultConnectionId) {
    const activeConnection = await db.findUserConnection(userData.defaultConnectionId);
    if (activeConnection) return activeConnection;
  }

  // Fallback to first connection
  const firstConnection = await db.findFirstConnection();
  if (!firstConnection) {
    // No connections → revoke session
    try {
      if (auth) {
        await auth.api.revokeSession({ headers: c.req.raw.headers });
        await auth.api.signOut({ headers: c.req.raw.headers });
      }
    } catch (err) {
      console.warn(`[getActiveConnection] Session cleanup failed:`, err);
    }
    throw new Error('No connections found for user');
  }

  return firstConnection;
};
```

**Used In**:
- All TRPC mail routes
- All TRPC label routes
- Agent routes
- Chat routes

**Returns**: Full connection record with all fields

---

### connectionToDriver()
**Location**: `/apps/server/src/lib/server-utils.ts` (lines 576-589)

**Purpose**: Convert connection record to MailManager driver

**Critical Code**:
```typescript
export const connectionToDriver = (activeConnection: typeof connection.$inferSelect) => {
  // ❌ PROBLEM: Throws error for IMAP connections
  if (!activeConnection.accessToken || !activeConnection.refreshToken) {
    throw new Error(`Invalid connection ${JSON.stringify(activeConnection?.id)}`);
  }

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

**Problems for IMAP**:
1. ❌ Validates OAuth tokens (IMAP won't have these)
2. ❌ Synchronous (IMAP needs async to load connection details)
3. ❌ No connectionId passed to createDriver

**Required Fix**:
```typescript
export const connectionToDriver = async (activeConnection: typeof connection.$inferSelect) => {
  // Conditional validation based on provider
  if (activeConnection.providerId !== 'imap') {
    if (!activeConnection.accessToken || !activeConnection.refreshToken) {
      throw new Error(`Invalid connection ${JSON.stringify(activeConnection?.id)}`);
    }
  }

  return await createDriver(
    activeConnection.providerId,
    {
      auth: {
        userId: activeConnection.userId,
        accessToken: activeConnection.accessToken || '',
        refreshToken: activeConnection.refreshToken || '',
        email: activeConnection.email,
      },
    },
    activeConnection.id // NEW: Pass connectionId for IMAP
  );
};
```

---

### resetConnection()
**Location**: `/apps/server/src/lib/server-utils.ts` (lines 609-619)

**Purpose**: Clear OAuth tokens when connection fails

**Code**:
```typescript
export const resetConnection = async (connectionId: string) => {
  const { db, conn } = createDb(env.HYPERDRIVE.connectionString);
  await db
    .update(connection)
    .set({
      accessToken: null,
      refreshToken: null,
    })
    .where(eq(connection.id, connectionId));
  await conn.end();
};
```

**IMAP Relevance**: Low - IMAP connections don't use tokens

---

## TRPC Connection Routes

### Location
`/apps/server/src/trpc/routes/connections.ts`

### Available Routes

#### 1. connections.list
**Purpose**: List all user connections

**Code** (lines 8-36):
```typescript
list: privateProcedure
  .use(createRateLimiterMiddleware({
    limiter: Ratelimit.slidingWindow(120, '1m'),
    generatePrefix: ({ sessionUser }) => `ratelimit:get-connections-${sessionUser?.id}`,
  }))
  .query(async ({ ctx }) => {
    const { sessionUser } = ctx;
    const db = await getZeroDB(sessionUser.id);
    const connections = await db.findManyConnections();

    const disconnectedIds = connections
      .filter((c) => !c.accessToken || !c.refreshToken)
      .map((c) => c.id);

    return {
      connections: connections.map((connection) => ({
        id: connection.id,
        email: connection.email,
        name: connection.name,
        picture: connection.picture,
        createdAt: connection.createdAt,
        providerId: connection.providerId,
      })),
      disconnectedIds,
    };
  }),
```

**IMAP Impact**: IMAP connections will appear as "disconnected" because they lack OAuth tokens

**Fix Needed**: Conditional disconnected detection:
```typescript
const disconnectedIds = connections
  .filter((c) =>
    c.providerId !== 'imap' && (!c.accessToken || !c.refreshToken)
  )
  .map((c) => c.id);
```

#### 2. connections.setDefault
**Purpose**: Set default connection

**Code** (lines 38-47):
```typescript
setDefault: privateProcedure
  .input(z.object({ connectionId: z.string() }))
  .mutation(async ({ input, ctx }) => {
    const { connectionId } = input;
    const user = ctx.sessionUser;
    const db = await getZeroDB(user.id);
    const foundConnection = await db.findUserConnection(connectionId);
    if (!foundConnection) throw new TRPCError({ code: 'NOT_FOUND' });
    await db.updateUser({ defaultConnectionId: connectionId });
  }),
```

**IMAP Compatibility**: ✅ Works without changes

#### 3. connections.delete
**Purpose**: Delete connection

**Code** (lines 48-58):
```typescript
delete: privateProcedure
  .input(z.object({ connectionId: z.string() }))
  .mutation(async ({ input, ctx }) => {
    const { connectionId } = input;
    const user = ctx.sessionUser;
    const db = await getZeroDB(user.id);
    await db.deleteConnection(connectionId);

    const activeConnection = await getActiveConnection();
    if (connectionId === activeConnection.id) {
      await db.updateUser({ defaultConnectionId: null });
    }
  }),
```

**IMAP Considerations**:
- Need to also delete encrypted password from Autumn
- Need to stop IMAP polling subscription

**Required Updates**:
```typescript
// Before deleting
if (connectionRecord.providerId === 'imap' && connectionRecord.encryptedPassword) {
  // Delete encrypted password from Autumn
  const autumn = new Autumn({ secretKey: env.AUTUMN_SECRET_KEY });
  await autumn.delete(connectionRecord.encryptedPassword);
}

// Stop subscription
await disableImapSubscription(connectionId);
```

#### 4. connections.getDefault
**Purpose**: Get active connection

**Code** (lines 59-70):
```typescript
getDefault: publicProcedure.query(async ({ ctx }) => {
  if (!ctx.sessionUser) return null;
  const connection = await getActiveConnection();
  return {
    id: connection.id,
    email: connection.email,
    name: connection.name,
    picture: connection.picture,
    createdAt: connection.createdAt,
    providerId: connection.providerId,
  };
}),
```

**IMAP Compatibility**: ✅ Works without changes

---

## Auth Provider Configuration

### Location
`/apps/server/src/lib/auth-providers.ts`

### Current Providers
```typescript
export const authProviders = (env: Record<string, string>) => [
  {
    id: 'google',
    name: 'Google',
    enabled: !!env.GOOGLE_CLIENT_ID && !!env.GOOGLE_CLIENT_SECRET,
    required: true,
    envVarInfo: [
      { name: 'GOOGLE_CLIENT_ID', source: 'Google Cloud Console', defaultValue: '' },
      { name: 'GOOGLE_CLIENT_SECRET', source: 'Google Cloud Console', defaultValue: '' },
    ],
  },
  // Microsoft commented out
];

export const customProviders = [
  {
    id: 'passkey',
    name: 'Passkey',
    isCustom: true,
    customRedirectPath: '/settings/connections',
  },
];
```

**IMAP Consideration**: IMAP is not an OAuth provider, so it won't appear here

---

## Auth Routes

### Location
`/apps/server/src/routes/auth.ts`

### Available Endpoints

#### GET /providers
**Purpose**: Return list of available auth providers

**Response**:
```typescript
{
  allProviders: [
    {
      id: 'google' | 'microsoft' | 'passkey',
      name: string,
      enabled: boolean,
      required?: boolean,
      isCustom?: boolean,
      customRedirectPath?: string,
      envVarInfo?: [...],
      envVarStatus?: [...]
    }
  ],
  isProd: boolean
}
```

**IMAP Impact**: None - IMAP is not an OAuth provider

---

## Subscription Queue

### Location
`/apps/server/src/lib/auth.ts` (lines 152-157)

**Purpose**: Trigger subscription creation after OAuth connection

**Code**:
```typescript
if (env.GOOGLE_S_ACCOUNT && env.GOOGLE_S_ACCOUNT !== '{}') {
  await env.subscribe_queue.send({
    connectionId: result.id,
    providerId: account.providerId,
  });
}
```

**Queue Message**:
```typescript
{
  connectionId: string;
  providerId: 'google' | 'microsoft';
}
```

**Subscription Factory** (analyzed in Phase 0.5):
- Receives message from queue
- Creates push subscription (Gmail watch, Outlook webhook)
- Stores subscription ID

**IMAP Difference**:
- IMAP doesn't support push subscriptions
- Need polling mechanism instead
- Separate queue or different message type

---

## Required Changes for IMAP

### 1. New TRPC Route: connections.createImap

**Location**: `/apps/server/src/trpc/routes/connections.ts`

**Purpose**: Manual IMAP connection creation (bypass OAuth)

**Input Schema**:
```typescript
z.object({
  email: z.string().email(),
  name: z.string().optional(),
  imapHost: z.string(),
  imapPort: z.number().int().positive(),
  imapSecurity: z.enum(['SSL', 'STARTTLS', 'NONE']),
  smtpHost: z.string(),
  smtpPort: z.number().int().positive(),
  smtpSecurity: z.enum(['SSL', 'STARTTLS', 'NONE']),
  password: z.string(),
  testConnection: z.boolean().optional(), // Test before saving
})
```

**Implementation Steps**:
```typescript
createImap: privateProcedure
  .input(createImapSchema)
  .mutation(async ({ input, ctx }) => {
    const { sessionUser } = ctx;
    const db = await getZeroDB(sessionUser.id);

    // 1. Encrypt password with Autumn
    const autumn = new Autumn({ secretKey: env.AUTUMN_SECRET_KEY });
    const encryptedPassword = await autumn.encrypt(input.password, sessionUser.id);

    // 2. Optional: Test IMAP connection
    if (input.testConnection) {
      await testImapConnection({
        host: input.imapHost,
        port: input.imapPort,
        security: input.imapSecurity,
        email: input.email,
        password: input.password,
      });
    }

    // 3. Create connection record
    const [connection] = await db.createConnection('imap', input.email, {
      name: input.name || input.email,
      picture: null,
      accessToken: null,
      refreshToken: null,
      scope: 'imap',
      expiresAt: new Date('2099-12-31'), // No expiration for IMAP
      imapHost: input.imapHost,
      imapPort: input.imapPort,
      imapSecurity: input.imapSecurity,
      smtpHost: input.smtpHost,
      smtpPort: input.smtpPort,
      smtpSecurity: input.smtpSecurity,
      authType: 'password',
      encryptedPassword: encryptedPassword,
      lastSyncUid: '{}', // Empty JSON object
    });

    // 4. Trigger IMAP subscription (polling)
    await env.subscribe_queue.send({
      connectionId: connection.id,
      providerId: 'imap',
    });

    return { success: true, connectionId: connection.id };
  }),
```

### 2. Update connectionToDriver (Async + Conditional)

**Current Location**: `/apps/server/src/lib/server-utils.ts` (lines 576-589)

**Changes**:
```typescript
// BEFORE: Synchronous, validates OAuth tokens
export const connectionToDriver = (activeConnection: typeof connection.$inferSelect) => {
  if (!activeConnection.accessToken || !activeConnection.refreshToken) {
    throw new Error(`Invalid connection ${JSON.stringify(activeConnection?.id)}`);
  }
  return createDriver(activeConnection.providerId, { ... });
};

// AFTER: Async, conditional validation
export const connectionToDriver = async (activeConnection: typeof connection.$inferSelect) => {
  // Skip OAuth validation for IMAP
  if (activeConnection.providerId !== 'imap') {
    if (!activeConnection.accessToken || !activeConnection.refreshToken) {
      throw new Error(`Invalid OAuth connection ${activeConnection.id}`);
    }
  }

  // Pass connectionId for IMAP
  return await createDriver(
    activeConnection.providerId,
    {
      auth: {
        userId: activeConnection.userId,
        accessToken: activeConnection.accessToken || '',
        refreshToken: activeConnection.refreshToken || '',
        email: activeConnection.email,
      },
    },
    activeConnection.id // NEW parameter
  );
};
```

**Impact**: ALL call sites must be updated (6+ files)

### 3. Update connections.list (Fix Disconnected Detection)

**Current Logic**:
```typescript
const disconnectedIds = connections
  .filter((c) => !c.accessToken || !c.refreshToken)
  .map((c) => c.id);
```

**Fixed Logic**:
```typescript
const disconnectedIds = connections
  .filter((c) => {
    // IMAP connections are valid without OAuth tokens
    if (c.providerId === 'imap') {
      return !c.encryptedPassword;
    }
    // OAuth connections need tokens
    return !c.accessToken || !c.refreshToken;
  })
  .map((c) => c.id);
```

### 4. Update connections.delete (Cleanup IMAP Resources)

**Add Before Delete**:
```typescript
// Load connection
const connectionRecord = await db.findUserConnection(connectionId);
if (!connectionRecord) throw new TRPCError({ code: 'NOT_FOUND' });

// IMAP-specific cleanup
if (connectionRecord.providerId === 'imap') {
  // Delete encrypted password from Autumn
  if (connectionRecord.encryptedPassword) {
    const autumn = new Autumn({ secretKey: env.AUTUMN_SECRET_KEY });
    try {
      await autumn.delete(connectionRecord.encryptedPassword);
    } catch (error) {
      console.error('Failed to delete encrypted password:', error);
    }
  }

  // Stop polling subscription
  await disableImapSubscription(connectionId);
}

// Delete connection
await db.deleteConnection(connectionId);
```

### 5. Create IMAP Test Connection Utility

**Location**: `/apps/server/src/lib/imap-test-connection.ts` (new file)

**Purpose**: Validate IMAP credentials before saving

```typescript
import Imap from 'imap';

export interface ImapTestConfig {
  host: string;
  port: number;
  security: 'SSL' | 'STARTTLS' | 'NONE';
  email: string;
  password: string;
}

export const testImapConnection = async (config: ImapTestConfig): Promise<boolean> => {
  return new Promise((resolve, reject) => {
    const imap = new Imap({
      user: config.email,
      password: config.password,
      host: config.host,
      port: config.port,
      tls: config.security === 'SSL',
      tlsOptions: { rejectUnauthorized: false },
    });

    const timeout = setTimeout(() => {
      imap.end();
      reject(new Error('IMAP connection timeout'));
    }, 10000); // 10 second timeout

    imap.once('ready', () => {
      clearTimeout(timeout);
      imap.end();
      resolve(true);
    });

    imap.once('error', (err) => {
      clearTimeout(timeout);
      reject(new Error(`IMAP connection failed: ${err.message}`));
    });

    try {
      imap.connect();
    } catch (err) {
      clearTimeout(timeout);
      reject(err);
    }
  });
};
```

---

## ZeroDB Methods Used

### Connection CRUD Operations

**findManyConnections()**:
- Returns all connections for user
- Used in connections.list

**findUserConnection(connectionId)**:
- Returns single connection by ID
- Used in connections.setDefault, connections.delete

**findFirstConnection()**:
- Returns first connection (fallback)
- Used in getActiveConnection

**createConnection(providerId, email, data)**:
- Creates new connection record
- Returns [connection]
- Used in connectionHandlerHook, future connections.createImap

**deleteConnection(connectionId)**:
- Deletes connection (cascade deletes summaries, etc.)
- Used in connections.delete

**updateUser(data)**:
- Updates user record (e.g., defaultConnectionId)
- Used in connections.setDefault, connections.delete

**findUser()**:
- Returns user record
- Used in getActiveConnection

**findUserSettings()**:
- Returns user settings
- Used in sign-up hook

**insertUserSettings(settings)**:
- Creates user settings
- Used in sign-up hook

---

## Encryption with Autumn

### Current Usage
**Location**: `/apps/server/src/lib/auth.ts` (lines 208-214)

**Purpose**: Delete Autumn customer when user deletes account

```typescript
const autumn = new Autumn({ secretKey: env.AUTUMN_SECRET_KEY });
try {
  await autumn.customers.delete(user.id);
} catch (error) {
  console.error('Failed to delete Autumn customer:', error);
}
```

### IMAP Password Encryption

**Encrypt on Create**:
```typescript
const autumn = new Autumn({ secretKey: env.AUTUMN_SECRET_KEY });
const encryptedPassword = await autumn.encrypt(plainPassword, userId);
// Store encryptedPassword in connection.encryptedPassword
```

**Decrypt on Use**:
```typescript
const autumn = new Autumn({ secretKey: env.AUTUMN_SECRET_KEY });
const plainPassword = await autumn.decrypt(connection.encryptedPassword, userId);
// Use plainPassword for IMAP connection
```

**Delete on Connection Delete**:
```typescript
const autumn = new Autumn({ secretKey: env.AUTUMN_SECRET_KEY });
await autumn.delete(connection.encryptedPassword);
```

---

## User Account Deletion Flow

### beforeDelete Hook
**Location**: `/apps/server/src/lib/auth.ts` (lines 204-248)

**Steps**:
1. Get all user connections
2. Delete Autumn customer (encrypted passwords)
3. Disable brain function for all connections
4. Revoke all OAuth tokens via driver.revokeToken()
5. Delete user (CASCADE deletes connections, summaries, etc.)

**IMAP Consideration**:
- driver.revokeToken() will fail/no-op for IMAP connections
- Need conditional logic:
```typescript
if (connection.providerId === 'imap') {
  // No token revocation needed
  await disableImapSubscription(connection.id);
} else {
  await driver.revokeToken(connection.refreshToken);
}
```

---

## Session Management

### Better Auth Configuration
**Location**: `/apps/server/src/lib/auth.ts` (lines 365-372)

**Session Settings**:
```typescript
session: {
  cookieCache: {
    enabled: true,
    maxAge: 60 * 60 * 24 * 30, // 30 days
  },
  expiresIn: 60 * 60 * 24 * 30, // 30 days
  updateAge: 60 * 60 * 24 * 3, // 3 days
},
```

**IMAP Relevance**: Low - Session management is user-level, not connection-level

---

## OAuth Provider Configuration

### Better Auth Social Providers
**Location**: `/apps/server/src/lib/auth.ts` (line 373)

**Code**:
```typescript
socialProviders: getSocialProviders(env as unknown as Record<string, string>),
```

### getSocialProviders Implementation
**Location**: `/apps/server/src/lib/auth-providers.ts`

**Returns**:
```typescript
{
  google: {
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
    redirectURI: `${env.VITE_PUBLIC_BACKEND_URL}/api/auth/callback/google`,
    scope: [
      'https://mail.google.com/',
      'https://www.googleapis.com/auth/gmail.modify',
      'https://www.googleapis.com/auth/userinfo.profile',
      'https://www.googleapis.com/auth/userinfo.email',
    ],
  },
}
```

**IMAP Consideration**: IMAP bypasses this entirely

---

## Error Handling

### OAuth Connection Failures
**Location**: `/apps/server/src/lib/auth.ts` (lines 108-128)

**Scenarios**:
1. **getUserInfo() fails** → Revoke tokens, reset connection, redirect
2. **No user address** → Revoke tokens, reset connection, redirect

**Flow**:
```typescript
const userInfo = await driver.getUserInfo().catch(async () => {
  if (account.accessToken) {
    await driver.revokeToken(account.accessToken);
    await resetConnection(account.id);
  }
  throw new Response(null, { status: 301, headers: { Location: '/' } });
});
```

**IMAP Error Handling**:
- IMAP connection test fails → Return error to user immediately
- Don't create connection record
- Don't store encrypted password

---

## Migration Strategy

### Phase 1: Add IMAP Creation Route (Non-Breaking)
1. Add connections.createImap TRPC route
2. Add testImapConnection utility
3. Test IMAP connection creation independently

### Phase 2: Update connectionToDriver (Breaking)
1. Make connectionToDriver async
2. Add conditional token validation
3. Update all call sites (6+ files)
4. Test OAuth connections still work

### Phase 3: Update Connection Management
1. Fix connections.list disconnected detection
2. Add IMAP cleanup to connections.delete
3. Test connection deletion for both OAuth and IMAP

### Phase 4: Update User Deletion
1. Add IMAP-specific cleanup to beforeDelete hook
2. Test user deletion with IMAP connections

---

## Call Sites Analysis

### Files Using connectionToDriver
(From grep in Phase 0.1)

1. `/apps/server/src/routes/chat.ts` - ❌ Needs async update
2. `/apps/server/src/workflows/sync-threads-coordinator-workflow.ts` - ❌ Needs async update
3. `/apps/server/src/workflows/sync-threads-workflow.ts` - ❌ Needs async update
4. `/apps/server/src/routes/agent/index.ts` - ❌ Needs async update
5. `/apps/server/src/routes/agent/sync-worker.ts` - ❌ Needs async update
6. `/apps/server/src/lib/server-utils.ts` - Definition location

**Estimated Update Scope**: 5 files + connectionToDriver definition

---

## Testing Considerations

### OAuth Connection Tests
- Test existing OAuth flow still works
- Test token refresh
- Test connection deletion
- Test user deletion

### IMAP Connection Tests
- Test IMAP connection creation
- Test IMAP connection test failure
- Test IMAP connection deletion
- Test password encryption/decryption
- Test invalid credentials
- Test mixed OAuth + IMAP connections per user

---

## Recommendations

### Immediate Actions
1. ✅ Create connections.createImap TRPC route
2. ✅ Create testImapConnection utility
3. ✅ Add password encryption/decryption helpers
4. ⚠️ Update connectionToDriver to be async with conditional validation

### Future Enhancements
1. Connection health monitoring (IMAP connection status)
2. Password rotation for IMAP connections
3. OAuth2 support for IMAP (Gmail, Outlook via IMAP)
4. Connection testing endpoint (test without saving)

---

## Conclusion

The authentication and connection flow is **tightly coupled to OAuth** via Better Auth's hook system. IMAP support requires:
1. **Separate connection creation endpoint** (connections.createImap)
2. **Conditional validation** in connectionToDriver
3. **Async refactoring** of connectionToDriver and all call sites
4. **IMAP-specific cleanup** in deletion flows

**Risk Level**: Medium (breaking changes to connectionToDriver)
**Complexity**: Medium (async refactoring + new TRPC route)
**Impact**: High (affects all driver instantiation)

**Next Steps**:
1. Complete Phase 0.4: Brain/AI Pipeline Analysis
2. Complete Phase 0.5: Subscription Factory Pattern Analysis
3. Design IMAP polling subscription mechanism
4. Create revised implementation plan
