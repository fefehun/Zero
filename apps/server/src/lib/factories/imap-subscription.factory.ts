import {
  BaseSubscriptionFactory,
  type SubscriptionData,
  type UnsubscriptionData,
} from './base-subscription.factory';
import { EProviders } from '../../types';
import { env } from '../../env';
import { c } from '../utils';

/**
 * IMAP Subscription Factory
 *
 * Implements subscription management for IMAP email accounts using a polling mechanism.
 * Unlike webhook-based providers (Google, Microsoft), IMAP requires periodic polling
 * to check for new messages.
 *
 * Polling Flow:
 * 1. subscribe() - Initializes connection labels and sends 'start' action to imap_poll_queue
 * 2. Poll queue consumer processes messages and schedules recurring polls
 * 3. unsubscribe() - Sends 'stop' action to halt polling
 *
 * The queue-based approach enables:
 * - Distributed polling across workers
 * - Configurable poll intervals
 * - Graceful start/stop of polling
 * - Decoupled subscription from polling logic
 */
export class ImapSubscriptionFactory extends BaseSubscriptionFactory {
  readonly providerId = EProviders.imap;

  /**
   * Subscribe to IMAP polling for a connection
   *
   * Initiates polling mechanism by:
   * 1. Initializing connection labels (INBOX, SENT, etc.)
   * 2. Sending 'start' message to poll queue to begin polling cycle
   * 3. Marking connection as 'active' in subscribed_accounts KV
   *
   * @param data - Subscription data containing connectionId
   * @returns Response indicating success or error
   */
  public async subscribe(data: { body: SubscriptionData }): Promise<Response> {
    const { connectionId } = data.body;

    if (!connectionId) {
      return c.json({ error: 'connectionId is required' }, 400);
    }

    try {
      console.log(`[IMAP-SUBSCRIPTION] Starting subscription for connection: ${connectionId}`);

      // Initialize default labels for the connection (INBOX, SENT, TRASH, etc.)
      await this.initializeConnectionLabels(connectionId);
      console.log(`[IMAP-SUBSCRIPTION] Labels initialized for connection: ${connectionId}`);

      // Send 'start' action to poll queue to initiate polling cycle
      // The queue consumer will handle the actual polling and re-scheduling
      await env.imap_poll_queue.send({
        connectionId,
        action: 'start',
      });
      console.log(`[IMAP-SUBSCRIPTION] Sent 'start' action to poll queue for connection: ${connectionId}`);

      // Mark connection as active in subscribed accounts
      await env.subscribed_accounts.put(
        `${connectionId}__${EProviders.imap}`,
        'active',
      );
      console.log(`[IMAP-SUBSCRIPTION] Marked connection as active: ${connectionId}`);

      return new Response('IMAP polling enabled', { status: 200 });
    } catch (error) {
      console.error('[IMAP-SUBSCRIPTION] Error during subscription:', error);

      // Clean up on failure - remove from subscribed accounts if something went wrong
      try {
        await env.subscribed_accounts.delete(`${connectionId}__${EProviders.imap}`);
      } catch (cleanupError) {
        console.error('[IMAP-SUBSCRIPTION] Error during cleanup:', cleanupError);
      }

      return c.json(
        { error: 'Failed to enable IMAP polling', details: error instanceof Error ? error.message : 'Unknown error' },
        500
      );
    }
  }

  /**
   * Unsubscribe from IMAP polling for a connection
   *
   * Stops polling by:
   * 1. Sending 'stop' message to poll queue to halt polling cycle
   * 2. Removing connection from subscribed_accounts KV
   *
   * @param data - Unsubscription data containing connectionId
   * @returns Response indicating success or error
   */
  public async unsubscribe(data: { body: UnsubscriptionData }): Promise<Response> {
    const { connectionId, providerId } = data.body;

    if (!connectionId) {
      return c.json({ error: 'connectionId is required' }, 400);
    }

    try {
      console.log(`[IMAP-SUBSCRIPTION] Unsubscribing connection: ${connectionId}`);

      // Check if connection is currently subscribed
      const existingState = await env.subscribed_accounts.get(
        `${connectionId}__${providerId || EProviders.imap}`
      );

      if (!existingState || existingState === 'pending') {
        console.log(`[IMAP-SUBSCRIPTION] Connection not subscribed: ${connectionId}`);
        return c.json({ message: 'not subscribed' }, 200);
      }

      // Send 'stop' action to poll queue to halt polling
      await env.imap_poll_queue.send({
        connectionId,
        action: 'stop',
      });
      console.log(`[IMAP-SUBSCRIPTION] Sent 'stop' action to poll queue for connection: ${connectionId}`);

      // Remove from subscribed accounts
      await env.subscribed_accounts.delete(`${connectionId}__${EProviders.imap}`);
      console.log(`[IMAP-SUBSCRIPTION] Removed connection from subscribed accounts: ${connectionId}`);

      return new Response('IMAP polling disabled', { status: 200 });
    } catch (error) {
      console.error('[IMAP-SUBSCRIPTION] Error during unsubscription:', error);
      return c.json(
        { error: 'Failed to disable IMAP polling', details: error instanceof Error ? error.message : 'Unknown error' },
        500
      );
    }
  }

  /**
   * Verify token validity
   *
   * For IMAP, token verification is not applicable since IMAP uses
   * password-based authentication rather than OAuth tokens.
   *
   * The actual credential validation happens during IMAP connection
   * establishment in the ImapDriver.
   *
   * @returns Always true - token verification not needed for IMAP
   */
  public async verifyToken(_token: string): Promise<boolean> {
    // IMAP uses password-based authentication, not OAuth tokens
    // Token verification is not applicable for this provider
    // Actual authentication happens during IMAP connection in ImapDriver
    return true;
  }
}

// Export class for registry use
export { ImapSubscriptionFactory as default };
