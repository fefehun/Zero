# Claude Code Permissions Configuration

**Created**: 2025-10-21
**Location**: `/home/code/workspaces/Zero/.claude/settings.local.json`

---

## Purpose

This configuration grants Claude Code the necessary permissions to execute the IMAP implementation orchestration workflow autonomously.

---

## Permissions Granted

### File Operations

**Allowed**:
- ✅ `Read(**)` - Read any file in the project
- ✅ `Write(**)` - Create new files anywhere in project
- ✅ `Edit(**)` - Modify existing files
- ✅ `Glob(**)` - Search for files by pattern
- ✅ `Grep(**)` - Search file contents

**Denied**:
- ❌ `Write(**/.env)` - Cannot overwrite environment files
- ❌ `Edit(**/.env)` - Cannot modify environment files
- ❌ `Write(**/secrets/**)` - Cannot write to secrets directories
- ❌ `Edit(**/secrets/**)` - Cannot modify secrets

**Rationale**: Agents need full file access for code generation but must not modify sensitive configuration.

---

### Tool Operations

**Allowed**:
- ✅ `Task(**)` - Launch specialized agents (orchestration)
- ✅ `TodoWrite(**)` - Update DEVELOPING-PROGRESS.md tracker

**Rationale**: Core orchestration capabilities for multi-agent workflow.

---

### Bash Commands

**Allowed Without Prompt**:
- ✅ `git:*` - All git operations (add, commit, tag, status, diff, log)
- ✅ `pnpm:*` - All pnpm operations (add, install, build, typecheck, db:*)
- ✅ `npm:*` - All npm operations
- ✅ `node:*` - Run Node.js scripts
- ✅ `mkdir:*` - Create directories
- ✅ `curl:*` - Fetch remote resources
- ✅ `ls:*` - List directory contents
- ✅ `cat:*` - Display file contents
- ✅ `echo:*` - Print output
- ✅ `rm:*` - Remove files (with safeguards)
- ✅ `cp:*` - Copy files
- ✅ `mv:*` - Move files
- ✅ `find:*` - Find files
- ✅ `grep:*` - Search content
- ✅ `cd:*` - Change directory
- ✅ `pwd:*` - Print working directory
- ✅ `head:*` - Display file head
- ✅ `tail:*` - Display file tail

**Denied**:
- ❌ `rm -rf /:*` - Cannot delete root
- ❌ `rm -rf /*:*` - Cannot delete root contents

**Requires User Confirmation**:
- ⚠️ `git push:*` - Push to remote requires approval
- ⚠️ `pnpm publish:*` - Package publish requires approval
- ⚠️ `npm publish:*` - Package publish requires approval

**Rationale**: Enable autonomous development workflow while protecting against destructive operations and unauthorized deployments.

---

## Security Safeguards

### 1. Environment Protection
- `.env` files cannot be modified
- Prevents accidental credential exposure
- User must manually update environment variables

### 2. Secrets Protection
- `secrets/` directories write-protected
- Prevents credential storage in code
- User manages all sensitive data

### 3. Deployment Control
- Git push requires user approval
- Package publish requires user approval
- Prevents unauthorized releases

### 4. Destructive Operation Prevention
- Root deletion blocked
- System paths protected
- File operations scoped to project

---

## Required User Actions

The following operations still require manual user intervention:

### 1. Environment Configuration
```bash
# User must create/update .env file with:
# - DATABASE_URL
# - AUTUMN_SECRET_KEY
# - CLOUDFLARE_* variables
# - IMAP test credentials
```

### 2. Remote Git Operations
```bash
# User must approve:
git push origin main
git push --tags
```

### 3. Cloudflare Setup
- User must configure Cloudflare account
- User must set up Queue, Vectorize, Durable Objects
- User must update wrangler.toml with account IDs

### 4. Database Migrations (first time)
- User should review migration SQL before applying
- User confirms database connection safety

---

## Orchestration Workflow Compatibility

This permissions configuration fully supports the IMAP Implementation Orchestrator workflow:

### Phase 1: Preparation
- ✅ Install dependencies (`pnpm add`)
- ✅ Update type definitions (`Edit`)
- ✅ Create database migration (`Write`, `pnpm db:generate`)
- ✅ Create encryption utilities (`Write`)
- ✅ Verify build (`pnpm build`)

### Phase 2: Core IMAP Driver
- ✅ Create IMAP utilities (`Write`)
- ✅ Implement ImapMailManager (`Write`)
- ✅ Register driver (`Edit`)
- ✅ Async refactor (`Edit`)

### Phase 3: Authentication
- ✅ Create TRPC routes (`Edit`)
- ✅ Update call sites (`Edit`)
- ✅ Fix connection detection (`Edit`)

### Phase 4: Email Sync
- ✅ Create subscription factory (`Write`)
- ✅ Create queue consumer (`Write`)
- ✅ Update wrangler.toml (`Edit`)

### Phase 5: SMTP Send
- ✅ Create SMTP manager (`Write`)
- ✅ Implement email sending (`Edit`)
- ✅ Implement drafts (`Edit`)

### Phase 6: AI Integration
- ✅ Fix workflow validation (`Edit`)
- ✅ Test end-to-end (`Bash`, `Task`)
- ✅ Update error handling (`Edit`)

### All Phases
- ✅ Generate reports (`Write` to `docs/reports/`)
- ✅ Run audits (`Task` with code-reviewer agent)
- ✅ Git commits (`git add`, `git commit`, `git tag`)
- ✅ Update progress tracker (`TodoWrite`)

---

## Modifications

If additional permissions are needed during implementation:

1. **Add to allow list**: Edit `.claude/settings.local.json`
2. **Document change**: Update this file
3. **Commit**: `git add .claude/ docs/ && git commit -m "Update Claude Code permissions"`

---

## Verification

Test permissions configuration:

```bash
# Read file (should work)
cat .claude/settings.local.json

# Write test file (should work)
echo "test" > /tmp/test.txt

# Edit .env (should be denied)
# Will prompt user or fail

# Git commit (should work)
git status

# Git push (should ask for confirmation)
# git push  # Will prompt user
```

---

## Rollback

To restore default permissions:

```bash
# Backup current config
cp .claude/settings.local.json .claude/settings.local.json.backup

# Restore to minimal permissions
cat > .claude/settings.local.json <<'EOF'
{
  "permissions": {
    "allow": [],
    "deny": [],
    "ask": []
  }
}
EOF
```

---

## Agent Marketplace Configuration

**Location**: `.claude/settings.json`

### Installed Marketplace

- **wshobson/agents** - Multi-agent orchestration system
  - Source: GitHub repository `wshobson/agents`
  - 85 specialized agents
  - 15 workflow orchestrators
  - 47 agent skills

### Enabled Plugins

Installed plugins for IMAP implementation:

1. **full-stack-orchestration** - Multi-agent workflows
   - deployment-engineer (haiku)
   - performance-engineer (sonnet)
   - security-auditor (sonnet)
   - test-automator (sonnet)

2. **javascript-typescript** - TypeScript/Node.js development
   - javascript-pro (sonnet)
   - typescript-pro (sonnet)

3. **backend-development** - Backend architecture
   - backend-architect (sonnet)
   - graphql-architect (sonnet)
   - tdd-orchestrator (sonnet)

4. **database-design** - Database schema and migrations
   - database-architect (sonnet)
   - sql-pro (haiku)

5. **code-review-ai** - Code review
   - architect-review (sonnet)

These plugins provide the specialized agents referenced in `IMAP-IMPLEMENTATION-ORCHESTRATOR.md`.

---

## Related Documentation

- **Orchestrator Workflow**: `/docs/impl-plans/IMAP-IMPLEMENTATION-ORCHESTRATOR.md`
- **Development Progress**: `/docs/impl-plans/DEVELOPING-PROGRESS.md`
- **Planning Progress**: `/docs/impl-plans/PLANNING-PROGRESS.md`
- **Implementation Overview**: `/docs/impl-plans/00-OVERVIEW-REVISED.md`

---

**Status**: ✅ Permissions configured and ready for orchestrated implementation
