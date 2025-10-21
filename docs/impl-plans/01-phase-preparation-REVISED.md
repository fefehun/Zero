# Phase 1: Preparation - REVISED (AI-PROOF)

**Status**: Ready for Execution
**Estimated Time**: 30-45 minutes
**Risk Level**: Low
**Dependencies**: None

---

## Overview

This phase prepares the Zero project for IMAP support by:
1. Installing required NPM dependencies
2. Creating database migration for IMAP fields
3. Updating TypeScript types
4. Setting up password encryption
5. Verifying the build succeeds

**Success Criteria**: Build succeeds, all types compile, migration ready

---

## PRECONDITIONS

- [ ] You have cloned the Zero repository
- [ ] You are in `/home/code/workspaces/Zero` directory
- [ ] Node.js and pnpm are installed
- [ ] PostgreSQL database is accessible

**Validation**:
```bash
cd /home/code/workspaces/Zero
pwd  # Should output: /home/code/workspaces/Zero
pnpm --version  # Should show pnpm version
```

---

## TASK 1.1: Install IMAP Dependencies

### Purpose
Install Node.js libraries for IMAP, SMTP, and MIME parsing.

### Steps

#### 1.1.1 Install imap library
**Action**: Install `imap` package for IMAP protocol

```bash
cd /home/code/workspaces/Zero/apps/server
pnpm add imap
pnpm add -D @types/imap
```

**Expected Output**: Package installed successfully

#### 1.1.2 Install mailparser library
**Action**: Install `mailparser` for MIME message parsing

```bash
cd /home/code/workspaces/Zero/apps/server
pnpm add mailparser
```

**Expected Output**: Package installed successfully

#### 1.1.3 Install nodemailer (if not already installed)
**Action**: Check if nodemailer exists, install if needed

```bash
cd /home/code/workspaces/Zero/apps/server
pnpm list nodemailer
# If not found, install:
pnpm add nodemailer
pnpm add -D @types/nodemailer
```

### VALIDATION
```bash
cd /home/code/workspaces/Zero/apps/server
pnpm list imap mailparser nodemailer
```

**Expected**: All three packages listed

**Checkpoint**: ✅ Dependencies installed

---

## TASK 1.2: Update Type Definitions

### Purpose
Add 'imap' to provider enum and extend types for IMAP

### Steps

#### 1.2.1 Add 'imap' to EProviders enum

**File**: `/home/code/workspaces/Zero/apps/server/src/types.ts`

**Action**: Find the `EProviders` enum definition and add `'imap'`

**Search for**:
```typescript
export enum EProviders {
  google = 'google',
  microsoft = 'microsoft',
}
```

**Replace with**:
```typescript
export enum EProviders {
  google = 'google',
  microsoft = 'microsoft',
  imap = 'imap',
}
```

**Why**: Allows TypeScript to recognize 'imap' as valid provider

#### 1.2.2 Make ManagerConfig OAuth fields optional

**File**: `/home/code/workspaces/Zero/apps/server/src/lib/driver/types.ts`

**Action**: Find `ManagerConfig` type and make accessToken/refreshToken optional

**Search for**:
```typescript
export type ManagerConfig = {
  auth: {
    userId: string;
    accessToken: string;
    refreshToken: string;
    email: string;
  };
};
```

**Replace with**:
```typescript
export type ManagerConfig = {
  auth: {
    userId: string;
    accessToken?: string;  // Optional for IMAP
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

**Why**: IMAP doesn't use OAuth tokens, needs different config

### VALIDATION
```bash
cd /home/code/workspaces/Zero/apps/server
pnpm run typecheck
```

**Expected**: No type errors

**Checkpoint**: ✅ Types updated

---

## TASK 1.3: Create Database Migration

### Purpose
Add IMAP-specific columns to `connection` table

### Steps

#### 1.3.1 Update database schema file

**File**: `/home/code/workspaces/Zero/apps/server/src/db/schema.ts`

**Action**: Find the `connection` table definition and add IMAP fields

**Search for the `connection` table** (around line 118):
```typescript
export const connection = createTable(
  'connection',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    // ... existing fields ...
    providerId: text('provider_id').$type<'google' | 'microsoft'>().notNull(),
    // ... more fields ...
  },
  // ... indexes ...
);
```

**Add IMAP fields after `expiresAt` and before `createdAt`**:
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
    providerId: text('provider_id').$type<'google' | 'microsoft' | 'imap'>().notNull(),  // ⚠️ ADD 'imap'
    expiresAt: timestamp('expires_at').notNull(),

    // NEW IMAP FIELDS - Add here
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
    // NEW INDEX
    index('connection_auth_type_idx').on(t.authType),
  ],
);
```

**Why**: Stores IMAP server settings per connection

#### 1.3.2 Generate Drizzle migration

**Action**: Generate migration SQL from schema changes

```bash
cd /home/code/workspaces/Zero/apps/server
pnpm db:generate
```

**Expected Output**: New migration file created in `drizzle/` directory

**Migration file name example**: `0001_add_imap_fields.sql`

#### 1.3.3 Review generated migration

**Action**: Open the generated migration file and verify it contains:
- ALTER TABLE statements adding new columns
- CREATE INDEX for auth_type

**Expected SQL**:
```sql
ALTER TABLE "mail0_connection" ADD COLUMN "imap_host" text;
ALTER TABLE "mail0_connection" ADD COLUMN "imap_port" integer;
ALTER TABLE "mail0_connection" ADD COLUMN "imap_security" text;
ALTER TABLE "mail0_connection" ADD COLUMN "smtp_host" text;
ALTER TABLE "mail0_connection" ADD COLUMN "smtp_port" integer;
ALTER TABLE "mail0_connection" ADD COLUMN "smtp_security" text;
ALTER TABLE "mail0_connection" ADD COLUMN "auth_type" text DEFAULT 'oauth2';
ALTER TABLE "mail0_connection" ADD COLUMN "encrypted_password" text;
ALTER TABLE "mail0_connection" ADD COLUMN "last_sync_uid" text;
CREATE INDEX "connection_auth_type_idx" ON "mail0_connection" ("auth_type");
```

#### 1.3.4 Apply migration (DO NOT RUN IN PRODUCTION YET)

**Action**: For development/testing only

```bash
cd /home/code/workspaces/Zero/apps/server
pnpm db:push  # Development only
# OR
pnpm db:migrate  # Production-safe
```

**Warning**: Only run in development environment. Production migrations require approval.

### VALIDATION
```bash
cd /home/code/workspaces/Zero/apps/server
pnpm run typecheck
```

**Expected**: Schema types regenerated, no errors

**Checkpoint**: ✅ Database migration created

---

## TASK 1.4: Setup Password Encryption Utilities

### Purpose
Create helper functions for encrypting/decrypting IMAP passwords using Autumn

### Steps

#### 1.4.1 Create encryption utilities file

**File**: `/home/code/workspaces/Zero/apps/server/src/lib/encryption.ts` (NEW FILE)

**Action**: Create file with encryption helper functions

**Content**:
```typescript
import { Autumn } from 'autumn-js';
import { env } from '../env';

/**
 * Encrypt a password for storage
 * @param plainPassword - Plain text password
 * @param userId - User ID (used as context)
 * @returns Encrypted password string
 */
export async function encryptPassword(
  plainPassword: string,
  userId: string,
): Promise<string> {
  const autumn = new Autumn({ secretKey: env.AUTUMN_SECRET_KEY });
  const encrypted = await autumn.encrypt(plainPassword, userId);
  return encrypted;
}

/**
 * Decrypt a stored password
 * @param encryptedPassword - Encrypted password string
 * @param userId - User ID (used as context)
 * @returns Plain text password
 */
export async function decryptPassword(
  encryptedPassword: string,
  userId: string,
): Promise<string> {
  const autumn = new Autumn({ secretKey: env.AUTUMN_SECRET_KEY });
  const decrypted = await autumn.decrypt(encryptedPassword, userId);
  return decrypted;
}

/**
 * Delete encrypted password from Autumn storage
 * @param encryptedPassword - Encrypted password string
 */
export async function deleteEncryptedPassword(
  encryptedPassword: string,
): Promise<void> {
  const autumn = new Autumn({ secretKey: env.AUTUMN_SECRET_KEY });
  try {
    await autumn.delete(encryptedPassword);
  } catch (error) {
    console.error('Failed to delete encrypted password:', error);
    // Non-fatal - password will remain in Autumn but connection is deleted
  }
}
```

**Why**: Centralized encryption logic for IMAP passwords

### VALIDATION
```bash
cd /home/code/workspaces/Zero/apps/server
pnpm run typecheck
```

**Expected**: No type errors

**Checkpoint**: ✅ Encryption utilities created

---

## TASK 1.5: Verify Build

### Purpose
Ensure all changes compile successfully

### Steps

#### 1.5.1 Run TypeScript type check

```bash
cd /home/code/workspaces/Zero/apps/server
pnpm run typecheck
```

**Expected**: No type errors

#### 1.5.2 Run full build

```bash
cd /home/code/workspaces/Zero
pnpm build
```

**Expected**: Build succeeds for all packages

#### 1.5.3 Verify no runtime errors

```bash
cd /home/code/workspaces/Zero/apps/server
pnpm run dev
```

**Expected**: Server starts without errors (Ctrl+C to stop)

### VALIDATION

**All checks must pass**:
- ✅ TypeScript compiles without errors
- ✅ Build succeeds
- ✅ Dev server starts

**Checkpoint**: ✅ Build verified

---

## PHASE 1 COMPLETION CHECKLIST

Before proceeding to Phase 2, verify ALL items:

- [ ] Dependencies installed (imap, mailparser, nodemailer)
- [ ] `EProviders` enum includes 'imap'
- [ ] `ManagerConfig` updated with optional OAuth fields and IMAP config
- [ ] `connection` table schema extended with IMAP fields
- [ ] Database migration generated (not necessarily applied)
- [ ] `encryption.ts` utilities created
- [ ] TypeScript type check passes
- [ ] Full build succeeds
- [ ] No runtime errors on dev server start

**Final Validation Command**:
```bash
cd /home/code/workspaces/Zero
pnpm build && cd apps/server && pnpm run typecheck
```

**Expected**: Both commands succeed with exit code 0

---

## ROLLBACK PROCEDURE (If Something Goes Wrong)

### Rollback Steps

1. **Revert schema changes**:
   ```bash
   git checkout apps/server/src/db/schema.ts
   ```

2. **Revert type changes**:
   ```bash
   git checkout apps/server/src/types.ts
   git checkout apps/server/src/lib/driver/types.ts
   ```

3. **Remove encryption file**:
   ```bash
   rm apps/server/src/lib/encryption.ts
   ```

4. **Uninstall dependencies** (optional):
   ```bash
   cd apps/server
   pnpm remove imap mailparser
   ```

5. **Rebuild**:
   ```bash
   cd /home/code/workspaces/Zero
   pnpm build
   ```

---

## TROUBLESHOOTING

### Issue: Type errors in schema.ts
**Solution**: Ensure Drizzle is up to date: `pnpm add drizzle-orm@latest -w`

### Issue: Migration generation fails
**Solution**: Check database connection string in `.env`

### Issue: Autumn encryption import error
**Solution**: Verify `autumn-js` is installed: `pnpm add autumn-js -w`

---

## NEXT STEPS

Once Phase 1 is complete:
➡️ **Proceed to Phase 2**: `02-phase-core-driver-REVISED.md`

**Phase 2 will implement**: IMAP driver class, IMAP connection utilities, MIME parsing, threading algorithm
