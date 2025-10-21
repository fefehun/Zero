# Database Schema Analysis

**Date**: 2025-10-20
**Status**: ✅ COMPLETED

---

## Executive Summary

The Zero project uses **PostgreSQL** with **Drizzle ORM**. The database schema is well-structured with proper indexes and foreign key constraints. The `connection` table is the **critical integration point** for IMAP support.

### Critical Findings

1. **`connection.providerId` is typed as `'google' | 'microsoft'`** - Must extend to include `'imap'`
2. **No IMAP-specific fields** in connection table (host, port, security, encrypted password)
3. **OAuth token fields are nullable** - Good for IMAP (won't use them)
4. **Unique constraint** on (userId, email) - One connection per email per user
5. **Cascade deletes** properly configured - Connection deletion cleans up related data

---

## Schema Overview

### Table Prefix
All tables use `mail0_` prefix via `pgTableCreator`

### Tables Analysis

#### 1. user
**Purpose**: User accounts

**Columns**:
- `id` (text, PK) - User identifier
- `name` (text, NOT NULL) - Display name
- `email` (text, NOT NULL, UNIQUE) - Primary email
- `emailVerified` (boolean, NOT NULL) - Verification status
- `image` (text) - Profile picture URL
- `createdAt` (timestamp, NOT NULL)
- `updatedAt` (timestamp, NOT NULL)
- `defaultConnectionId` (text) - Default email connection
- `customPrompt` (text) - User's custom AI prompt
- `phoneNumber` (text, UNIQUE) - Phone for 2FA
- `phoneNumberVerified` (boolean) - Phone verification status

**Indexes**: None explicit (only automatic on UNIQUE/PK)

**IMAP Relevance**: Low - No changes needed

---

#### 2. connection ⚠️ CRITICAL FOR IMAP
**Purpose**: Email account connections

**Current Schema**:
```typescript
{
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(user.id, { onDelete: 'cascade' }),
  email: text('email').notNull(),
  name: text('name'),
  picture: text('picture'),
  accessToken: text('access_token'),        // NULLABLE
  refreshToken: text('refresh_token'),      // NULLABLE
  scope: text('scope').notNull(),
  providerId: text('provider_id').$type<'google' | 'microsoft'>().notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').notNull(),
  updatedAt: timestamp('updated_at').notNull(),
}
```

**Indexes**:
- `connection_user_id_idx` on userId
- `connection_expires_at_idx` on expiresAt
- `connection_provider_id_idx` on providerId

**Constraints**:
- UNIQUE(userId, email) - One connection per email per user
- FK userId → user.id (CASCADE delete)

**Missing Fields for IMAP**:
```typescript
// NEED TO ADD:
imapHost: text('imap_host'),
imapPort: integer('imap_port'),
imapSecurity: text('imap_security').$type<'SSL' | 'STARTTLS' | 'NONE'>(),
smtpHost: text('smtp_host'),
smtpPort: integer('smtp_port'),
smtpSecurity: text('smtp_security').$type<'SSL' | 'STARTTLS' | 'NONE'>(),
authType: text('auth_type').$type<'oauth2' | 'app_password' | 'password'>().default('oauth2'),
encryptedPassword: text('encrypted_password'),
lastSyncUid: text('last_sync_uid'), // JSON: {INBOX: 123, Sent: 456, ...}
```

**Required Changes**:
1. Extend `providerId` type: `'google' | 'microsoft' | 'imap'`
2. Add IMAP/SMTP configuration fields
3. Make `accessToken`/`refreshToken` optional (already nullable - OK)
4. Migration to add new columns

**Data Type Considerations**:
- `imapPort`/`smtpPort` - integer (993, 587, etc.)
- `imapSecurity`/`smtpSecurity` - text enum
- `encryptedPassword` - text (will store Autumn-encrypted value)
- `lastSyncUid` - text (JSON serialized object)

---

#### 3. summary
**Purpose**: AI-generated email summaries

**Columns**:
- `messageId` (text, PK) - Email message ID
- `content` (text, NOT NULL) - Summary text
- `createdAt` (timestamp, NOT NULL)
- `updatedAt` (timestamp, NOT NULL)
- `connectionId` (text, NOT NULL) - FK to connection
- `saved` (boolean, NOT NULL, default: false) - User saved flag
- `tags` (text) - Generated tags
- `suggestedReply` (text) - AI-suggested reply

**Indexes**:
- `summary_connection_id_idx` on connectionId
- `summary_connection_id_saved_idx` on (connectionId, saved)
- `summary_saved_idx` on saved

**Constraints**:
- FK connectionId → connection.id (CASCADE delete)

**IMAP Relevance**: High - Will work automatically
- AI summaries reference connection
- IMAP messages will have summaries too
- No schema changes needed

---

#### 4. account
**Purpose**: Better Auth OAuth accounts

**Columns**:
- `id`, `accountId`, `providerId`, `userId`
- `accessToken`, `refreshToken`, `idToken`
- `accessTokenExpiresAt`, `refreshTokenExpiresAt`
- `scope`, `password`
- `createdAt`, `updatedAt`

**IMAP Relevance**: Low
- This is for Better Auth OAuth flow
- IMAP connections won't create account records
- Separate from `connection` table

---

#### 5. session
**Purpose**: User sessions

**IMAP Relevance**: None - No changes needed

---

#### 6. userHotkeys
**Purpose**: User keyboard shortcuts

**IMAP Relevance**: None - No changes needed

---

#### 7. verification
**Purpose**: Email/phone verification tokens

**IMAP Relevance**: None - No changes needed

---

#### 8. earlyAccess
**Purpose**: Early access user list

**IMAP Relevance**: None - No changes needed

---

#### 9. note
**Purpose**: User notes on email threads

**Columns**:
- `id`, `userId`, `threadId`, `content`, `color`
- `isPinned`, `order`
- `createdAt`, `updatedAt`

**IMAP Relevance**: Medium
- Notes reference threadId
- IMAP threads will support notes
- No changes needed

---

#### 10. userSettings
**Purpose**: User preferences

**Columns**:
- `id`, `userId`
- `settings` (jsonb) - User settings object
- `createdAt`, `updatedAt`

**IMAP Relevance**: Low - No changes needed

---

#### 11. writingStyleMatrix
**Purpose**: AI writing style learning

**Columns**:
- `connectionId` (PK, FK to connection)
- `numMessages`, `style` (jsonb)
- `updatedAt`

**IMAP Relevance**: High - Will work automatically
- Learns writing style per connection
- IMAP connections will have their own style matrix

---

#### 12. jwks, oauthApplication, oauthConsent, oauthAccessToken
**Purpose**: OAuth MCP server functionality

**IMAP Relevance**: None - No changes needed

---

#### 13. emailTemplate
**Purpose**: User email templates

**IMAP Relevance**: Low - No changes needed

---

## Migration Strategy

### Required Migration

**File**: Create new migration file

**Changes**:
```sql
-- Extend providerId type (Drizzle will handle)
ALTER TABLE mail0_connection ALTER COLUMN provider_id TYPE text;

-- Add IMAP columns
ALTER TABLE mail0_connection ADD COLUMN imap_host text;
ALTER TABLE mail0_connection ADD COLUMN imap_port integer;
ALTER TABLE mail0_connection ADD COLUMN imap_security text;
ALTER TABLE mail0_connection ADD COLUMN smtp_host text;
ALTER TABLE mail0_connection ADD COLUMN smtp_port integer;
ALTER TABLE mail0_connection ADD COLUMN smtp_security text;
ALTER TABLE mail0_connection ADD COLUMN auth_type text DEFAULT 'oauth2';
ALTER TABLE mail0_connection ADD COLUMN encrypted_password text;
ALTER TABLE mail0_connection ADD COLUMN last_sync_uid text;

-- Add indexes
CREATE INDEX connection_auth_type_idx ON mail0_connection(auth_type);
```

**Drizzle Commands**:
```bash
# Generate migration
pnpm db:generate

# Apply migration
pnpm db:migrate
# OR for dev:
pnpm db:push
```

---

## Foreign Key Relationships

### Cascade Deletion Flow

```
user (deleted)
  ├─> connection (CASCADE)
  │     ├─> summary (CASCADE)
  │     └─> writingStyleMatrix (CASCADE)
  ├─> session (CASCADE)
  ├─> note (CASCADE)
  └─> userSettings (CASCADE)
```

**IMAP Impact**:
- When user deleted → IMAP connections deleted
- When connection deleted → summaries deleted
- Proper cleanup - no orphaned data

---

## Unique Constraints

### connection table
- **UNIQUE(userId, email)** - One connection per email per user

**IMAP Consideration**:
- User can have one Gmail (OAuth) connection
- User can have same Gmail (IMAP) connection? **NO** - constraint prevents
- **PROBLEM**: User cannot have both OAuth AND IMAP for same email

**Solutions**:
1. **Remove unique constraint** - Allow multiple connections per email
   - Risk: Duplicates
   - Pro: Flexibility
2. **Keep constraint** - User chooses OAuth OR IMAP
   - Pro: Cleaner
   - Con: Less flexible
3. **Add to unique constraint**: UNIQUE(userId, email, providerId)
   - Pro: One connection per email per provider
   - Con: Migration complexity

**Recommendation**: Option 3 - UNIQUE(userId, email, providerId)

---

## Index Analysis

### Existing Indexes
- **connection_user_id_idx** - Fast user lookup ✓
- **connection_expires_at_idx** - Token expiry cleanup ✓
- **connection_provider_id_idx** - Provider filtering ✓

### Recommended New Indexes for IMAP
```typescript
index('connection_auth_type_idx').on(t.authType),
index('connection_imap_host_idx').on(t.imapHost),  // Optional
```

**Reasoning**:
- `auth_type` index - Filter IMAP vs OAuth connections
- `imap_host` index - Optional, only if querying by host

---

## Data Types Compatibility

### PostgreSQL → TypeScript Mapping

| Column | PostgreSQL | TypeScript | Notes |
|--------|-----------|------------|-------|
| imapHost | text | string | - |
| imapPort | integer | number | - |
| imapSecurity | text | 'SSL' \| 'STARTTLS' \| 'NONE' | Runtime validation |
| encryptedPassword | text | string | Base64 encrypted |
| lastSyncUid | text | string | JSON.stringify/parse |

---

## JSON Fields

### lastSyncUid Structure
```typescript
type LastSyncUid = {
  [folderName: string]: number;  // UID
};

// Example:
{
  "INBOX": 12345,
  "Sent": 6789,
  "Drafts": 42
}
```

**Storage**: JSON.stringify when saving, JSON.parse when reading

---

## Connection Creation Flow

### OAuth Flow (Existing)
1. User clicks "Connect Gmail"
2. OAuth redirect → Google
3. Callback with code
4. Better Auth creates `account` record
5. `connectionHandlerHook` creates `connection` record
6. Subscription queue triggered

### IMAP Flow (New - To Be Implemented)
1. User fills IMAP form (host, port, email, password)
2. Password encrypted with Autumn
3. Connection test (optional)
4. Create `connection` record directly
5. No `account` record created
6. Subscription factory creates polling job

**Key Difference**: IMAP bypasses Better Auth OAuth flow

---

## Connection Validation

### OAuth Connections
- `accessToken` NOT NULL check
- `refreshToken` NOT NULL check
- `expiresAt` in future

### IMAP Connections
- `imapHost` NOT NULL check
- `imapPort` NOT NULL check
- `encryptedPassword` NOT NULL check (if authType is password/app_password)
- `authType` valid enum value

**Validation Function Needed**:
```typescript
function validateConnection(conn: Connection) {
  if (conn.providerId === 'imap') {
    if (!conn.imapHost) throw new Error('IMAP host required');
    if (!conn.imapPort) throw new Error('IMAP port required');
    if ((conn.authType === 'password' || conn.authType === 'app_password')
        && !conn.encryptedPassword) {
      throw new Error('Password required');
    }
  } else {
    if (!conn.accessToken) throw new Error('Access token required');
    if (!conn.refreshToken) throw new Error('Refresh token required');
  }
}
```

---

## Schema Extension Plan

### Phase 1: Add Columns (Non-Breaking)
```typescript
export const connection = createTable(
  'connection',
  {
    // ... existing fields ...

    // NEW IMAP fields (all nullable initially)
    imapHost: text('imap_host'),
    imapPort: integer('imap_port'),
    imapSecurity: text('imap_security').$type<'SSL' | 'STARTTLS' | 'NONE'>(),
    smtpHost: text('smtp_host'),
    smtpPort: integer('smtp_port'),
    smtpSecurity: text('smtp_security').$type<'SSL' | 'STARTTLS' | 'NONE'>(),
    authType: text('auth_type').$type<'oauth2' | 'app_password' | 'password'>().default('oauth2'),
    encryptedPassword: text('encrypted_password'),
    lastSyncUid: text('last_sync_uid'),
  },
  // ... indexes and constraints ...
);
```

### Phase 2: Update Type (Breaking Change)
```typescript
providerId: text('provider_id').$type<'google' | 'microsoft' | 'imap'>().notNull(),
```

### Phase 3: Update Unique Constraint (Optional)
```typescript
// FROM:
unique().on(t.userId, t.email),

// TO:
unique().on(t.userId, t.email, t.providerId),
```

---

## Backward Compatibility

### Existing OAuth Connections
- `imapHost`, `imapPort`, etc. will be NULL
- `authType` defaults to 'oauth2'
- No impact on existing functionality

### New Code Handling
- Check `providerId` before accessing IMAP fields
- Check `authType` before assuming OAuth flow

---

## Testing Considerations

### Schema Tests
- Test unique constraint with IMAP connections
- Test cascade deletion
- Test NULL vs NOT NULL constraints
- Test default values

### Migration Tests
- Test migration on existing data
- Ensure no data loss
- Validate indexes created correctly

---

## Recommendations

### Immediate Actions
1. ✅ Add IMAP fields to connection schema
2. ✅ Extend providerId type to include 'imap'
3. ✅ Generate and test migration
4. ⚠️ Consider unique constraint change (userId, email, providerId)

### Future Enhancements
1. Connection status field (active, error, revoked)
2. Last sync timestamp
3. Error log field (for failed sync attempts)
4. Connection statistics (messages synced, errors, etc.)

---

## SQL Preview

```sql
-- View current connection schema
\d mail0_connection;

-- After migration
ALTER TABLE mail0_connection ADD COLUMN imap_host text;
ALTER TABLE mail0_connection ADD COLUMN imap_port integer;
ALTER TABLE mail0_connection ADD COLUMN imap_security text;
ALTER TABLE mail0_connection ADD COLUMN smtp_host text;
ALTER TABLE mail0_connection ADD COLUMN smtp_port integer;
ALTER TABLE mail0_connection ADD COLUMN smtp_security text;
ALTER TABLE mail0_connection ADD COLUMN auth_type text DEFAULT 'oauth2';
ALTER TABLE mail0_connection ADD COLUMN encrypted_password text;
ALTER TABLE mail0_connection ADD COLUMN last_sync_uid text;

-- Update provider type (Drizzle handles this via migration)
-- (Type validation happens in TypeScript, not DB constraint)

-- Optional: Update unique constraint
DROP INDEX IF EXISTS mail0_connection_user_id_email_unique;
CREATE UNIQUE INDEX mail0_connection_user_id_email_provider_unique
  ON mail0_connection(user_id, email, provider_id);
```

---

## Conclusion

The database schema is well-designed and requires **minimal changes** for IMAP support. The main modifications are:
1. Add IMAP-specific columns to `connection` table
2. Extend `providerId` type
3. Optionally update unique constraint

All changes are **backward compatible** with existing OAuth connections. The schema supports the IMAP implementation cleanly.

**Risk Level**: Low
**Complexity**: Low
**Impact**: Medium (affects core connection model)
