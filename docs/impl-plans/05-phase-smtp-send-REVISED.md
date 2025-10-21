# Phase 5: SMTP Email Sending - REVISED

**Status**: Ready for Execution
**Estimated Time**: 1-2 hours
**Risk Level**: Low
**Dependencies**: Phase 4 Complete

---

## Overview

Implement email sending via SMTP using Nodemailer.

**Success Criteria**: Can send emails, create/send drafts

---

## TASK 5.1: Create SMTP Manager

**File**: `/apps/server/src/lib/driver/smtp-manager.ts` (NEW)

```typescript
import nodemailer from 'nodemailer';
import type { IOutgoingMessage } from '../../types';

export class SmtpManager {
  private transporter;

  constructor(config: { host: string; port: number; secure: boolean; user: string; pass: string }) {
    this.transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: { user: config.user, pass: config.pass },
    });
  }

  async sendEmail(message: IOutgoingMessage): Promise<string> {
    const info = await this.transporter.sendMail({
      from: message.from || message.replyTo,
      to: message.to.join(', '),
      subject: message.subject,
      html: message.html,
      inReplyTo: message.inReplyTo,
      references: message.references,
    });

    return info.messageId;
  }
}
```

---

## TASK 5.2: Implement create() in ImapMailManager

**File**: `/apps/server/src/lib/driver/imap.ts`

```typescript
async create(data: IOutgoingMessage): Promise<{id?: string}> {
  const { SmtpManager } = await import('./smtp-manager');
  const { decryptPassword } = await import('../encryption');

  // Load SMTP config from connection
  const password = await decryptPassword(
    this.config.encryptedPassword!,
    this.config.auth.userId,
  );

  const smtp = new SmtpManager({
    host: this.config.smtp!.host,
    port: this.config.smtp!.port,
    secure: this.config.smtp!.security === 'SSL',
    user: this.config.auth.email,
    pass: password,
  });

  const messageId = await smtp.sendEmail(data);
  return { id: messageId };
}
```

---

## TASK 5.3: Implement Draft Methods

Implement in ImapMailManager:
- `createDraft()` - IMAP APPEND to Drafts folder
- `getDraft()` - Fetch from Drafts
- `listDrafts()` - List Drafts folder
- `sendDraft()` - Send via SMTP + delete draft
- `deleteDraft()` - Mark deleted + EXPUNGE

See Hungarian plan `/docs/impl-plans/05-phase-smtp-send.md` for details.

---

## PHASE 5 COMPLETION CHECKLIST

- [ ] SmtpManager created
- [ ] `create()` implemented
- [ ] Draft methods implemented
- [ ] Test email sending works

---

## NEXT STEPS

➡️ **Proceed to Phase 6**: `06-phase-ai-integration-REVISED.md`
