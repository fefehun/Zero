# Claude Code Configuration

This directory contains Claude Code configuration for the Zero project.

## Files

### `settings.json` (Project-level)
- Agent marketplace configuration (wshobson/agents)
- Enabled plugins for IMAP implementation
- Shared across all team members

### `settings.local.json` (User-level)
- Permissions configuration
- User-specific settings
- Not committed to git (in .gitignore)

## Configuration Overview

### Permissions

Full autonomous development permissions with security safeguards:
- ✅ File operations (Read, Write, Edit, Glob, Grep)
- ✅ Git operations (add, commit, tag, status, diff)
- ✅ Package management (pnpm, npm)
- ✅ Agent orchestration (Task, TodoWrite)
- ❌ Environment file modifications (.env)
- ❌ Secrets directory access
- ⚠️ Deployment operations require approval (git push, publish)

### Agent Plugins

5 plugins installed from wshobson/agents marketplace:
1. full-stack-orchestration (deployment-engineer, performance-engineer, security-auditor, test-automator)
2. javascript-typescript (javascript-pro, typescript-pro)
3. backend-development (backend-architect, graphql-architect, tdd-orchestrator)
4. database-design (database-architect, sql-pro)
5. code-review-ai (architect-review)

These provide specialized agents for IMAP implementation orchestration.

## Usage

Claude Code automatically loads these configurations when working in this repository.

No manual setup required - configurations are ready for IMAP implementation orchestration.

## Documentation

See `/docs/CLAUDE-CODE-PERMISSIONS.md` for detailed permissions documentation.

## Orchestration

This configuration enables the multi-agent workflow orchestrator:
- **Workflow**: `/docs/impl-plans/IMAP-IMPLEMENTATION-ORCHESTRATOR.md`
- **Progress**: `/docs/impl-plans/DEVELOPING-PROGRESS.md`

## Security

- `.env` files are write-protected
- `secrets/` directories are protected
- Destructive operations are blocked
- Deployment requires user approval

---

**Status**: ✅ Configured for autonomous IMAP implementation
