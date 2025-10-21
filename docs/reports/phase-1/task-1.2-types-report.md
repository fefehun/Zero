# Task 1.2: Update Type Definitions - Report

## Summary

Successfully updated TypeScript type definitions to support IMAP provider in the Zero email client. This task involved:
1. Adding 'imap' to the EProviders enum
2. Making OAuth fields optional in ManagerConfig
3. Adding IMAP-specific configuration fields to ManagerConfig
4. Updating database schema to include 'imap' provider type and IMAP-specific fields
5. Verifying TypeScript compilation

All changes compile successfully without introducing new type errors.

## Changes Made

### File: src/types.ts

**Before:**
```typescript
export enum EProviders {
  'google' = 'google',
  'microsoft' = 'microsoft',
}
```

**After:**
```typescript
export enum EProviders {
  'google' = 'google',
  'microsoft' = 'microsoft',
  'imap' = 'imap',
}
```

**Rationale:** Allows TypeScript to recognize 'imap' as a valid provider type throughout the codebase.

### File: src/lib/driver/types.ts

**Before:**
```typescript
export type ManagerConfig = {
  auth: {
    userId: string;
    // accountId: string;
    accessToken: string;
    refreshToken: string;
    email: string;
  };
};
```

**After:**
```typescript
export type ManagerConfig = {
  auth: {
    userId: string;
    // accountId: string;
    accessToken?: string; // Optional for IMAP
    refreshToken?: string; // Optional for IMAP
    email: string;
  };
  // IMAP-specific config (populated by connectionToDriver for IMAP)
  imap?: {
    host: string;
    port: number;
    security: 'SSL' | 'STARTTLS' | 'NONE';
    password: string; // Decrypted password
  };
  smtp?: {
    host: string;
    port: number;
    security: 'SSL' | 'STARTTLS' | 'NONE';
  };
  connectionId?: string; // Connection ID for loading IMAP config
};
```

**Rationale:**
- IMAP authentication doesn't use OAuth tokens, so accessToken and refreshToken are made optional
- Added IMAP-specific configuration for server connection details
- Added SMTP configuration for sending emails via IMAP accounts
- connectionId field allows lazy loading of IMAP configuration

### File: src/db/schema.ts

**Before:**
```typescript
export const connection = createTable(
  'connection',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    name: text('name'),
    picture: text('picture'),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    scope: text('scope').notNull(),
    providerId: text('provider_id').$type<'google' | 'microsoft'>().notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    createdAt: timestamp('created_at').notNull(),
    updatedAt: timestamp('updated_at').notNull(),
  },
  (t) => [
    unique().on(t.userId, t.email),
    index('connection_user_id_idx').on(t.userId),
    index('connection_expires_at_idx').on(t.expiresAt),
    index('connection_provider_id_idx').on(t.providerId),
  ],
);
```

**After:**
```typescript
export const connection = createTable(
  'connection',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    name: text('name'),
    picture: text('picture'),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    scope: text('scope').notNull(),
    providerId: text('provider_id').$type<'google' | 'microsoft' | 'imap'>().notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    // IMAP-specific fields
    imapHost: text('imap_host'),
    imapPort: integer('imap_port'),
    imapSecurity: text('imap_security').$type<'SSL' | 'STARTTLS' | 'NONE'>(),
    smtpHost: text('smtp_host'),
    smtpPort: integer('smtp_port'),
    smtpSecurity: text('smtp_security').$type<'SSL' | 'STARTTLS' | 'NONE'>(),
    authType: text('auth_type').$type<'oauth2' | 'app_password' | 'password'>().default('oauth2'),
    encryptedPassword: text('encrypted_password'),
    lastSyncUid: text('last_sync_uid'),
    createdAt: timestamp('created_at').notNull(),
    updatedAt: timestamp('updated_at').notNull(),
  },
  (t) => [
    unique().on(t.userId, t.email),
    index('connection_user_id_idx').on(t.userId),
    index('connection_expires_at_idx').on(t.expiresAt),
    index('connection_provider_id_idx').on(t.providerId),
    index('connection_auth_type_idx').on(t.authType),
  ],
);
```

**Rationale:**
- Added 'imap' to providerId type to allow IMAP connections in the database
- Added IMAP server configuration fields (imapHost, imapPort, imapSecurity)
- Added SMTP server configuration fields (smtpHost, smtpPort, smtpSecurity)
- Added authType field to distinguish between OAuth and password-based authentication
- Added encryptedPassword field to store encrypted IMAP passwords securely
- Added lastSyncUid field to track IMAP synchronization state
- Added index on authType for efficient querying by authentication method

## TypeScript Compilation

The TypeScript compiler was run to verify all changes. While there are pre-existing type errors in the codebase (unrelated to our changes), the specific error related to the provider type was successfully resolved:

**Before changes:**
```
apps/server/src/main.ts(427,9): error TS2769: No overload matches this call.
  Type 'EProviders' is not assignable to type '"google" | "microsoft" | SQL<unknown> | Placeholder<string, any>'.
```

**After changes:**
The provider-related type error is resolved. The schema now accepts 'imap' as a valid provider type.

**Note:** The codebase has pre-existing type errors (approximately 80 errors) that are unrelated to our changes. These include:
- Missing environment variable type definitions (OPENAI_API_KEY, HYPERDRIVE, etc.)
- Compatibility issues in the driver implementations
- Issues with external dependencies (dormroom, queryable-object, etc.)

Our changes did not introduce any new type errors.

## Verification

- [x] 'imap' added to EProviders enum
- [x] OAuth fields made optional in ManagerConfig
- [x] IMAP fields added to ManagerConfig
- [x] Database schema updated with 'imap' provider type
- [x] IMAP-specific database fields added
- [x] Index on authType created
- [x] TypeScript compiles without new errors
- [x] Provider-related type error resolved

## Type Errors Resolved

1. **Provider Type Mismatch in main.ts**: The error "Type 'EProviders' is not assignable to type '"google" | "microsoft"'" was resolved by adding 'imap' to both the EProviders enum and the database schema's providerId type.

## Files Modified

1. `/home/code/workspaces/Zero/apps/server/src/types.ts`
2. `/home/code/workspaces/Zero/apps/server/src/lib/driver/types.ts`
3. `/home/code/workspaces/Zero/apps/server/src/db/schema.ts`

## Status

✅ SUCCESS

## Next Steps

Proceed to Task 1.3: Create Database Migration

The database schema has been updated, and the next step is to generate and review the Drizzle migration files that will apply these changes to the database:

```bash
cd /home/code/workspaces/Zero/apps/server
pnpm db:generate
```

This will create the migration SQL for:
- Adding IMAP-specific fields to the connection table
- Creating the auth_type index
- Updating the provider_id column type to include 'imap'

## Additional Notes

### Design Decisions

1. **Optional OAuth Fields**: Made accessToken and refreshToken optional to support both OAuth (Google, Microsoft) and password-based (IMAP) authentication methods.

2. **Security Field Type**: Used union type `'SSL' | 'STARTTLS' | 'NONE'` for security settings to ensure type safety and prevent invalid values.

3. **Password Storage**: The encryptedPassword field will store encrypted passwords using the Autumn encryption library (to be implemented in Task 1.4).

4. **Separate IMAP/SMTP Config**: Separated IMAP and SMTP configurations in ManagerConfig to allow different servers for receiving and sending emails.

### Compatibility

All changes maintain backward compatibility with existing Google and Microsoft OAuth providers:
- OAuth fields remain in the auth object
- IMAP fields are optional and only populated for IMAP connections
- Existing code using accessToken/refreshToken will continue to work with the optional types
