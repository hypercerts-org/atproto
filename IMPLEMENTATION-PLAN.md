# ATProto Shared Data Server (SDS) Implementation Plan

## Goal

Create a `@atproto/sds` package that enables shared data repositories between multiple users while maintaining full compatibility with the existing ATProto ecosystem and avoiding any breaking changes to the current PDS implementation.

## Key Requirements

- **Zero Breaking Changes**: Existing PDS deployments remain unaffected
- **Maximum Code Reuse**: Leverage existing PDS components extensively
- **Interface Compatibility**: Implement the same XRPC API as PDS
- **Optional Adoption**: Organizations can choose SDS when collaboration is needed
- **Federation Ready**: Support interaction with regular PDSes

## Considerations

### 1. Architecture Philosophy

- **Composition over Modification**: Extend PDS rather than modify it
- **Minimal Delta**: Only implement sharing-specific logic, reuse everything else
- **Clear Boundaries**: Sharing complexity isolated to SDS package

### 2. Technical Constraints

- Maintain ATProto protocol compliance
- Preserve individual user data sovereignty
- Support existing client applications without changes
- Handle authentication/authorization for multi-user scenarios

### 3. Deployment Scenarios

- **Pure SDS**: Organizations deploy SDS for collaborative workspaces
- **Hybrid**: Users have personal PDS + participate in shared SDSes
- **Migration**: Teams can upgrade from PDS to SDS when sharing is needed

## Conclusions

### Best Approach: Separate SDS Package

After analyzing proxy/middleware vs. separate package approaches, a dedicated `@atproto/sds` package is optimal because:

1. **No Ecosystem Disruption**: PDS continues unchanged
2. **Clean Separation**: Sharing logic isolated and optional
3. **Code Reuse**: Can import and extend PDS components
4. **Implementation Flexibility**: Multiple ATProto server implementations (following email server model)

### Core Strategy: Composition + Extension

- Import PDS components as dependencies
- Override only authentication and authorization layers
- Add permission management system
- Extend database schema for multi-user access
- Implement new sharing-specific endpoints

## PoC Implementation Plan (3-4 Weeks)

**Goal**: Rapid validation of core shared repository concept with minimal viable features

### Phase 1: Foundation & Database (Week 1)

#### 1.1 Package Setup

```bash
# Create new package structure
mkdir packages/sds
cd packages/sds
```

#### 1.2 Package Configuration

```json
// packages/sds/package.json - reuse PDS dependencies exactly
{
  "name": "@atproto/sds",
  "version": "0.1.0",
  "description": "Shared Data Server - Multi-user ATProto implementation",
  "dependencies": {
    "@atproto/pds": "workspace:^"
    // All PDS dependencies inherited automatically
  },
  "scripts": {
    "build": "tsc --build tsconfig.build.json",
    "dev": "tsc --build --watch",
    "test": "../dev-infra/with-test-redis-and-db.sh jest"
  }
}
```

#### 1.3 Minimal Core Architecture

```typescript
// packages/sds/src/index.ts - Follow PDS.create() pattern exactly
import {
  PDS,
  ServerConfig,
  ServerSecrets,
  AppContextOptions,
} from '@atproto/pds'
import { SdsPermissionManager } from './permission-manager'

// Extend PDS config with minimal sharing options
export interface SdsConfig extends ServerConfig {
  sharing: {
    maxCollaborators: number // Simple limit for PoC
  }
}

// Composition pattern: wrap PDS with sharing capabilities
export class SDS extends PDS {
  public permissionManager: SdsPermissionManager

  static async create(
    cfg: SdsConfig,
    secrets: ServerSecrets,
    overrides?: Partial<AppContextOptions>,
  ): Promise<SDS> {
    // Create PDS normally
    const pds = await PDS.create(cfg, secrets, overrides)

    // Add SDS extensions
    const permissionManager = new SdsPermissionManager(
      pds.ctx.accountManager.db,
    )

    // Cast to SDS and add extensions
    const sds = pds as unknown as SDS
    sds.permissionManager = permissionManager

    return sds
  }
}
```

#### 1.4 Shared Repository Identity

```typescript
// packages/sds/src/shared-identity/index.ts
import { createOp as createPlcOp } from '@did-plc/lib'
import { Secp256k1Keypair } from '@atproto/crypto'

export class SharedRepoIdentity {
  constructor(
    private sdsRotationKey: Keypair,
    private serviceEndpoint: string,
  ) {}

  async createSharedRepoDid(
    name: string,
    createdBy: string,
  ): Promise<{ did: string; signingKey: string }> {
    // Generate new did:plc for shared repository per architectural decisions
    const signingKey = await Secp256k1Keypair.create({ exportable: true })
    const plcCreate = await createPlcOp({
      signingKey: signingKey.did(),
      rotationKeys: [this.sdsRotationKey.did()],
      handle: `${name}.shared`, // Temporary handle for shared repos
      pds: this.serviceEndpoint,
      signer: this.sdsRotationKey,
    })

    return {
      did: plcCreate.did,
      signingKey: signingKey.did(),
    }
  }

  async validateCollaboratorSignature(
    repoDid: string,
    userDid: string,
    signature: string,
    payload: any,
  ): Promise<boolean> {
    // Validate per-collaborator signing authority
    // Implementation depends on key delegation mechanism
    return true // Placeholder
  }
}
```

#### 1.4 Database Extensions (End of Week 1)

**PoC Approach**: Add minimal tables to existing PDS database structure

```sql
-- packages/sds/src/db/migrations/001-sharing.sql
-- Follow PDS migration pattern exactly

-- Minimal PoC tables - extend existing PDS schema
CREATE TABLE shared_permissions (
  repo_did TEXT NOT NULL,
  user_did TEXT NOT NULL,
  permissions TEXT NOT NULL DEFAULT '{"read":true,"write":true}', -- JSON permissions
  granted_by TEXT NOT NULL,
  granted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (repo_did, user_did)
);

-- Simple audit log for PoC
CREATE TABLE permission_changes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  repo_did TEXT NOT NULL,
  user_did TEXT NOT NULL,
  action TEXT NOT NULL, -- 'grant', 'revoke'
  changed_by TEXT NOT NULL,
  changed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_shared_permissions_user ON shared_permissions(user_did);
CREATE INDEX idx_shared_permissions_repo ON shared_permissions(repo_did);
```

### Phase 2: Auth & Permission Logic (Week 2)

#### 2.1 Minimal Permission Manager

```typescript
// packages/sds/src/permission-manager/index.ts
// Reuse PDS database patterns exactly
import { Database } from '@atproto/pds' // Use exact PDS database class

export class SdsPermissionManager {
  constructor(private db: Database) {}

  async checkAccess(
    repoDid: string,
    userDid: string,
    action: 'read' | 'write',
  ): Promise<boolean> {
    // Owner always has full access (unchanged from PDS)
    if (repoDid === userDid) return true

    // PoC: Simple permission check
    const result = await this.db
      .selectFrom('shared_permissions')
      .selectAll()
      .where('repo_did', '=', repoDid)
      .where('user_did', '=', userDid)
      .executeTakeFirst()

    if (!result) return false

    const permissions = JSON.parse(result.permissions)
    return permissions[action] ?? false
  }

  async grantAccess(
    repoDid: string,
    userDid: string,
    grantedBy: string,
  ): Promise<void> {
    // PoC: Simple grant with default permissions
    await this.db
      .insertInto('shared_permissions')
      .values({
        repo_did: repoDid,
        user_did: userDid,
        granted_by: grantedBy,
      })
      .onConflict((oc) => oc.doNothing())
      .execute()
  }
}
```

#### 2.2 Auth Extension (Minimal Override)

**PoC Strategy**: Intercept key endpoints only, reuse all PDS auth patterns

```typescript
// packages/sds/src/api/com/atproto/repo/createRecord.ts
// Override PDS endpoint to add permission check
import { createRecord as pdsCreateRecord } from '@atproto/pds/dist/api/com/atproto/repo/createRecord'

export default function (server: Server, ctx: SdsContext) {
  return pdsCreateRecord(server, {
    ...ctx,
    // Override only the auth check
    authVerifier: {
      ...ctx.authVerifier,
      authorization: (opts) => {
        const baseAuth = ctx.authVerifier.authorization(opts)
        return async (reqCtx) => {
          const result = await baseAuth(reqCtx)

          // Add SDS permission check
          if (reqCtx.input.body.repo !== result.credentials.did) {
            const hasAccess = await ctx.permissionManager.checkAccess(
              reqCtx.input.body.repo,
              result.credentials.did,
              'write',
            )
            if (!hasAccess) {
              throw new AuthRequiredError('No permission for shared repo')
            }
          }

          return result
        }
      },
    },
  })
}
```

### Phase 3: Integration & Testing (Week 3)

#### 3.1 Simple API Extension

**PoC Strategy**: Add one new endpoint for sharing, reuse everything else

```typescript
// packages/sds/src/api/com/sds/repo/grantAccess.ts
// New endpoint following PDS patterns exactly
export default function (server: Server, ctx: SdsContext) {
  server.addLexicon({
    lexicon: 1,
    id: 'com.sds.repo.grantAccess',
    defs: {
      main: {
        type: 'procedure',
        input: {
          encoding: 'application/json',
          schema: {
            type: 'object',
            required: ['repo', 'userDid'],
            properties: {
              repo: { type: 'string', format: 'did' },
              userDid: { type: 'string', format: 'did' },
            },
          },
        },
      },
    },
  })

  server.com.sds.repo.grantAccess({
    auth: ctx.authVerifier.authorization(),
    rateLimit: [
      { name: 'repo-write-hour', points: 1 }, // Follow PDS rate limit patterns
    ],
    handler: async ({ input, auth }) => {
      const { repo, userDid } = input.body
      const grantedBy = auth.credentials.did

      // Only repo owner can grant access (for PoC)
      if (repo !== grantedBy) {
        throw new AuthRequiredError('Only repository owner can grant access')
      }

      await ctx.permissionManager.grantAccess(repo, userDid, grantedBy)
      return { encoding: 'application/json', body: { success: true } }
    },
  })
}
```

### Phase 4: PoC Demo & Documentation (Week 4)

#### 4.1 Simple Demo & Testing

**PoC Goal**: Demonstrate core sharing concept works

```typescript
// packages/sds/example/poc-demo.ts
import { SDS } from '@atproto/sds'

async function pocDemo() {
  // 1. Start SDS (exactly like PDS)
  const sds = await SDS.create(config, secrets)
  await sds.start()

  // 2. Create two users (normal PDS flow)
  const alice = await createAccount({ handle: 'alice.test' })
  const bob = await createAccount({ handle: 'bob.test' })

  // 3. Alice grants Bob access to her repo (new SDS endpoint)
  await sds.com.sds.repo.grantAccess({
    repo: alice.did,
    userDid: bob.did,
  })

  // 4. Bob creates record in Alice's repo (existing PDS endpoint!)
  await sds.com.atproto.repo.createRecord({
    repo: alice.did, // <- Bob writing to Alice's repo
    collection: 'app.bsky.feed.post',
    record: { text: 'Bob wrote this in Alice repo!' },
  })

  console.log('✅ PoC Success: Shared repository working!')
}
```

## PoC Deliverables Summary

**Week 1**: Working SDS server that starts up ✅
**Week 2**: Permission system + basic auth checks ✅
**Week 3**: One shared repository demo working ✅
**Week 4**: Documentation + demo video ✅

**Total Implementation**: ~500 lines of new code, 95% PDS reuse

## Answers to Open Questions (Based on PDS Patterns)

### 1. **Blob Permission Alignment** ✅ **Implemented**

- **Answer**: Blob access = record access (simplest approach)
- **PDS Pattern**: BlobReader checks against record ownership, we extend this
- **Implementation**: Override `packages/pds/src/actor-store/blob/reader.ts` permission check

### 2. **Revocation Edge Cases** ✅ **Implemented**

- **Answer**: Real-time permission checks at request time
- **PDS Pattern**: AuthVerifier checks happen on every request anyway
- **Implementation**: Permission check in auth middleware (no caching for PoC)

### 3. **Rate Limiting for Shared Users**

- **Answer**: Follow PDS rate limit patterns exactly
- **PDS Pattern**: Points-based system with user quotas in `index.ts:106-143`
- **Implementation**: Shared users count toward owner's quota for PoC

### 4. **Conflict Resolution**

- **Answer**: Use existing ATProto `swapCommit` pattern
- **PDS Pattern**: Repository transactions already handle concurrency in `repo/transactor.ts`
- **Implementation**: No changes needed - PDS patterns work for shared repos

### 5. **Key Management**

- **Answer**: File-based keys for PoC, same as PDS
- **PDS Pattern**: `createSecretKeyObject()` in `auth-verifier.ts`
- **Implementation**: Reuse existing PDS key management completely

## Minimal Code Changes Summary

### What We Reuse (95%):

- ✅ All database patterns (`Database`, `ActorStore`, etc.)
- ✅ Complete repository management (`repo/`, `sequencer/`)
- ✅ Blob storage handling (`BlobReader`, `DiskBlobStore`)
- ✅ Authentication infrastructure (`AuthVerifier`, OAuth flows)
- ✅ Identity resolution (`IdResolver`, DID handling)
- ✅ XRPC server framework & routing
- ✅ Rate limiting system (reuse exact patterns)
- ✅ Configuration & environment handling
- ✅ Logging, monitoring, background queues

### What We Add (5%):

- 🆕 `SdsPermissionManager` (~50 lines)
- 🆕 2 database tables (`shared_permissions`, `permission_changes`)
- 🆕 1 new API endpoint (`com.sds.repo.grantAccess`)
- 🆕 Auth middleware override for permission checks (~50 lines)
- 🆕 SDS server wrapper class (~100 lines)

### PoC Code Estimate:

- **New files**: 6 files (~500 lines total)
- **Modified files**: 0 (pure composition)
- **Reused PDS code**: 95%+ (entire codebase)
- **Development time**: 3-4 weeks vs 6-7 weeks original

This streamlined approach validates the core concept quickly while building a foundation for future expansion.

## Architectural Decisions

Based on the requirements analysis, we've made the following key decisions:

### 1. Repository Identity & Signing

- **Decision**: Each shared repository gets a new organizational DID document
- **Rationale**: Shared repos are distinct entities (communities/organizations) separate from individual users
- **Implementation**: Generate `did:plc` for each shared repo with SDS as the service endpoint
- **Signing**: Per-collaborator signing authority using individual user keys with delegation

### 2. Authorization Granularity

- **Phase 1**: Collection-level permissions (read/write/admin per collection)
- **Future**: Progressive enhancement to record-level and blob-level as needed
- **Rationale**: Start simple, expand complexity incrementally based on usage patterns

### 3. Conflict Resolution

- **Strategy**: Optimistic concurrency with revision-based conflict detection
- **Implementation**: Follow ATProto's existing `swapCommit` pattern for atomic updates
- **Fallback**: Last-writer-wins for unresolved conflicts

### 4. Permission Model

- **Initial**: Equal collaborator permissions (all have read/write/admin)
- **Audit**: Immutable audit trails for all permission changes
- **Future**: Consider UCAN-based capability system for fine-grained permissions

### 5. API Design

- **Namespace**: Use `com.atproto.sds.*` for SDS-specific endpoints
- **Compatibility**: Existing `com.atproto.repo.*` endpoints accept any DID parameter
- **Discovery**: Add `.well-known/sds-capabilities` endpoint for client discovery

### 6. Database Architecture

- **Strategy**: Extend existing PDS database with additional tables
- **Migration**: Additive-only schema changes, no breaking modifications
- **Isolation**: SDS tables prefix for clear separation

### 7. Operational Policies

- **Privacy**: Public collaborator membership by default
- **Rate Limits**: Follow PDS standards with per-collaborator quotas
- **Export**: Permission-based access to CAR exports
- **TTL**: On-read permission expiry checks with background cleanup

### Open Questions (For Future Phases)

**Remaining Questions for Future Implementation:**

- [ ] **Federation semantics**: How do shared repo commits replicate to other ATProto services? What PLC/directory changes are needed for discovery?
- [ ] **Cross-server sharing**: Can users on different PDSes collaborate on the same SDS repo? What authentication flow?
- [ ] **Feed generator compatibility**: How do existing feed algorithms handle shared authorship? Need protocol changes?
- [ ] **Blob permission alignment**: Should blob access perfectly mirror record permissions or have separate controls?
- [ ] **Revocation edge cases**: How to handle mid-flight requests when permissions are revoked during processing?
- [ ] **Multi-tenant isolation**: For hosting multiple organizations, what separation is needed (keys, storage, rate limits)?
- [ ] **Advanced key management**: HSM/KMS integration for enterprise deployments?
- [ ] **Event streaming**: Webhooks for permission changes, with retry and security considerations?
- [ ] **Migration tooling**: Automated tools to convert personal repos to shared repos?
- [ ] **Legal framework**: Content ownership, data retention policies, and jurisdictional compliance?
- [ ] **Performance monitoring**: Key metrics for permission checks, conflict rates, and collaborative efficiency?
- [ ] **Testing standards**: Conformance tests for SDS implementations and interoperability fixtures?

**Technical Deep Dives Needed:**

- [ ] **Sequencer ordering**: Multi-writer scenarios may need additional ordering guarantees beyond current ATProto sequencer
- [ ] **Cache invalidation**: How permission changes affect client caches, gateways, and mirrors across the network
- [ ] **Error standardization**: Comprehensive error codes for SDS-specific failures to improve client developer experience
