import { createRateLimiterMiddleware, privateProcedure, publicProcedure, router } from '../trpc';
import { getActiveConnection, getZeroDB } from '../../lib/server-utils';
import { Ratelimit } from '@upstash/ratelimit';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { testImapConnection } from '../../lib/imap-connection';
import { encryptPassword } from '../../lib/encryption';
import { env } from '../../env';

export const connectionsRouter = router({
  list: privateProcedure
    .use(
      createRateLimiterMiddleware({
        limiter: Ratelimit.slidingWindow(120, '1m'),
        generatePrefix: ({ sessionUser }) => `ratelimit:get-connections-${sessionUser?.id}`,
      }),
    )
    .query(async ({ ctx }) => {
      const { sessionUser } = ctx;
      const db = await getZeroDB(sessionUser.id);
      const connections = await db.findManyConnections();

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

      return {
        connections: connections.map((connection) => {
          return {
            id: connection.id,
            email: connection.email,
            name: connection.name,
            picture: connection.picture,
            createdAt: connection.createdAt,
            providerId: connection.providerId,
          };
        }),
        disconnectedIds,
      };
    }),
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
  delete: privateProcedure
    .input(z.object({ connectionId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const { connectionId } = input;
      const user = ctx.sessionUser;
      const db = await getZeroDB(user.id);
      await db.deleteConnection(connectionId);

      const activeConnection = await getActiveConnection();
      if (connectionId === activeConnection.id) await db.updateUser({ defaultConnectionId: null });
    }),
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
  createImap: privateProcedure
    .input(
      z.object({
        email: z.string().email(),
        password: z.string().min(1, 'Password is required'),
        imapHost: z.string().min(1, 'IMAP host is required'),
        imapPort: z.number().int().positive('IMAP port must be a positive integer'),
        imapSecurity: z.enum(['SSL', 'STARTTLS', 'NONE']),
        smtpHost: z.string().min(1, 'SMTP host is required'),
        smtpPort: z.number().int().positive('SMTP port must be a positive integer'),
        smtpSecurity: z.enum(['SSL', 'STARTTLS', 'NONE']),
        authType: z.enum(['password', 'app_password']).default('password'),
        name: z.string().optional(),
        testConnection: z.boolean().optional().default(true),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const { sessionUser } = ctx;
      const db = await getZeroDB(sessionUser.id);

      try {
        // Step 1: Test IMAP connection before saving
        if (input.testConnection) {
          console.log('[createImap] Testing IMAP connection...');
          const isValid = await testImapConnection({
            host: input.imapHost,
            port: input.imapPort,
            security: input.imapSecurity,
            user: input.email,
            password: input.password,
          });

          if (!isValid) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: 'Failed to connect to IMAP server. Please check your credentials and settings.',
            });
          }
          console.log('[createImap] IMAP connection test successful');
        }

        // Step 2: Encrypt password using user-specific encryption
        console.log('[createImap] Encrypting password...');
        const encryptedPassword = await encryptPassword(input.password, sessionUser.id);

        // Step 3: Create connection record in database
        console.log('[createImap] Creating connection record...');
        const [connection] = await db.createConnection('imap', input.email, {
          name: input.name || input.email,
          picture: null,
          accessToken: null,
          refreshToken: null,
          scope: 'imap',
          expiresAt: new Date('2099-12-31'), // IMAP connections don't expire
          imapHost: input.imapHost,
          imapPort: input.imapPort,
          imapSecurity: input.imapSecurity,
          smtpHost: input.smtpHost,
          smtpPort: input.smtpPort,
          smtpSecurity: input.smtpSecurity,
          authType: input.authType,
          encryptedPassword,
          lastSyncUid: '{}', // Empty JSON object for initial sync state
        });

        console.log(`[createImap] Connection created with ID: ${connection.id}`);

        // Step 4: Trigger subscription (polling) if subscribe queue is configured
        // Note: This is for Phase 4 - Email Sync. Skip if not yet implemented.
        if (env.subscribe_queue) {
          try {
            await env.subscribe_queue.send({
              connectionId: connection.id,
              providerId: 'imap',
            });
            console.log(`[createImap] Subscription queued for connection ${connection.id}`);
          } catch (error) {
            console.warn('[createImap] Failed to queue subscription:', error);
            // Don't fail the entire operation if subscription queueing fails
          }
        }

        // Step 5: Return success with connection ID
        return {
          success: true,
          connectionId: connection.id,
          email: input.email,
          providerId: 'imap' as const,
        };
      } catch (error) {
        console.error('[createImap] Error creating IMAP connection:', error);

        // Handle specific error types
        if (error instanceof TRPCError) {
          throw error;
        }

        // Handle IMAP connection errors
        if (error && typeof error === 'object' && 'type' in error) {
          const imapError = error as { type: string; message: string };

          if (imapError.type === 'AUTH_FAILED' || imapError.type === 'INVALID_CREDENTIALS') {
            throw new TRPCError({
              code: 'UNAUTHORIZED',
              message: 'Invalid email or password. Please check your credentials.',
            });
          }

          if (imapError.type === 'CONNECTION_TIMEOUT') {
            throw new TRPCError({
              code: 'TIMEOUT',
              message: 'Connection to IMAP server timed out. Please check your host and port settings.',
            });
          }

          if (imapError.type === 'NETWORK_ERROR') {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: 'Could not connect to IMAP server. Please verify your host and port.',
            });
          }
        }

        // Handle encryption errors
        if (error instanceof Error && error.message.includes('Encryption failed')) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to encrypt password. Please try again.',
          });
        }

        // Handle database errors
        if (error instanceof Error && error.message.includes('unique constraint')) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'An IMAP connection with this email already exists.',
          });
        }

        // Generic error fallback
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error instanceof Error ? error.message : 'Failed to create IMAP connection',
        });
      }
    }),
});
