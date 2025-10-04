# @atproto/sds: Shared Data Server (SDS)

TypeScript implementation of an atproto Shared Data Server that enables collaborative repository sharing while maintaining full PDS compatibility.

[![NPM](https://img.shields.io/npm/v/@atproto/sds)](https://www.npmjs.com/package/@atproto/sds)
[![Github CI Status](https://github.com/bluesky-social/atproto/actions/workflows/repo.yaml/badge.svg)](https://github.com/bluesky-social/atproto/actions/workflows/repo.yaml)

## Overview

The Shared Data Server (SDS) extends the Personal Data Server (PDS) with multi-user repository sharing capabilities. It maintains 100% API compatibility with PDS while adding collaborative features that allow multiple users to access and modify shared repositories.

## Authorization & Claims Architecture

### OAuth Scope-Based Authorization

SDS uses a sophisticated authorization system that maps OAuth scopes to repository access levels:

```typescript
// OAuth scopes determine user capabilities
const scopeMapping = {
  adminScopes: ['repo:admin', 'repo:*', 'atproto'], // Full admin access
  writeScopes: ['repo:write', 'repo:*'], // Write access
  readScopes: ['repo:read', 'repo:*'], // Read access
  ownerScopes: ['repo:*', 'atproto'], // Repository ownership
}
```

### Multi-Layer Permission System

1. **Repository Ownership**: Users who own repositories (DID matches repository DID) have full access
2. **Shared Permissions**: Additional users can be granted read/write/admin access through SDS permission system
3. **OAuth Scope Validation**: All actions are validated against user's OAuth scopes
4. **Cross-Repository Access**: Users can access repositories they don't own if granted permissions

### Permission Claims Flow

```typescript
// 1. User authenticates with OAuth token
const token = await oauthClient.getAccessToken()

// 2. SDS validates OAuth scopes against required permissions
const hasPermission = await sdsAuthVerifier.validateUserScopePermissions(
  repoDid,
  userDid,
  token.scopes,
)

// 3. SDS checks shared repository permissions
const sharedAccess = await permissionManager.checkAccess(
  repoDid,
  userDid,
  'write',
)

// 4. Combined authorization decision
const canWrite = hasPermission.allowed && sharedAccess
```

### Repository Access Control

- **Owner Access**: Repository owners (DID matches repo DID) have full access regardless of OAuth scopes
- **Shared Access**: Collaborators must have both valid OAuth scopes AND explicit SDS permissions
- **Permission Inheritance**: Admin permissions include write access, write permissions include read access
- **Audit Trail**: All permission changes are logged with timestamps and change attribution

### API Endpoints

SDS provides additional endpoints for collaboration management:

- `com.sds.repo.grantAccess` - Grant repository access to users
- `com.sds.repo.revokeAccess` - Revoke repository access
- `com.sds.repo.listCollaborators` - List repository collaborators
- `com.sds.repo.getPermissions` - Check user permissions
- `com.sds.organization.create` - Create shared organizations
- `com.sds.organization.list` - List accessible organizations

### Federation Compatibility

SDS instances appear as standard PDS instances to the AT Protocol network:

- All existing `com.atproto.*` endpoints work unchanged
- Federation with existing PDS instances is seamless
- No protocol changes required for adoption
- Existing AT Protocol clients work without modification

## Development

This package is part of the AT Protocol monorepo. For development setup and testing, see the main repository documentation.

## License

This project is dual-licensed under MIT and Apache 2.0 terms:

- MIT license ([LICENSE-MIT.txt](https://github.com/bluesky-social/atproto/blob/main/LICENSE-MIT.txt) or http://opensource.org/licenses/MIT)
- Apache License, Version 2.0, ([LICENSE-APACHE.txt](https://github.com/bluesky-social/atproto/blob/main/LICENSE-APACHE.txt) or http://www.apache.org/licenses/LICENSE-2.0)

Downstream projects and end users may chose either license individually, or both together, at their discretion. The motivation for this dual-licensing is the additional software patent assurance provided by Apache 2.0.
