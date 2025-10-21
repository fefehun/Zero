import type { MailManager, ManagerConfig } from './types';
import { OutlookMailManager } from './microsoft';
import { GoogleMailManager } from './google';
import { ImapMailManager } from './imap';

const supportedProviders = {
  google: GoogleMailManager,
  microsoft: OutlookMailManager,
  imap: ImapMailManager,
};

export const createDriver = async (
  provider: keyof typeof supportedProviders | (string & {}),
  config: ManagerConfig,
  connectionId?: string,
): Promise<MailManager> => {
  const Provider = supportedProviders[provider as keyof typeof supportedProviders];
  if (!Provider) throw new Error('Provider not supported');
  const manager = new Provider(config);
  // Future: async initialization if needed
  return manager;
};
