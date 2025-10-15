# @atproto/sds: Shared Data Server (SDS)

TypeScript implementation of an atproto Shared Data Server that enables collaborative repository sharing while maintaining full PDS compatibility.

[![NPM](https://img.shields.io/npm/v/@atproto/sds)](https://www.npmjs.com/package/@atproto/sds)
[![Github CI Status](https://github.com/bluesky-social/atproto/actions/workflows/repo.yaml/badge.svg)](https://github.com/bluesky-social/atproto/actions/workflows/repo.yaml)

## Overview

The Shared Data Server (SDS) extends the Personal Data Server (PDS) with multi-user repository sharing capabilities. It maintains 100% API compatibility with PDS while adding collaborative features that allow multiple users to access and modify shared repositories.

## Authorization Architecture

### DPoP-Only Authentication (Production Security)

SDS requires DPoP (Demonstrating Proof-of-Possession) token types for all OAuth requests:

1. **Token Type Validation**: Only `Authorization: DPoP <token>` headers accepted (Bearer tokens rejected)
2. **Token Binding**: Access token is DPoP-bound at issuance (PDS adds `cnf` claim with client's key thumbprint)
3. **Client Proof Creation**: Clients must create DPoP proofs using `dpopFetchWrapper`
4. **Server-Side Proof Validation**: Full cryptographic validation of DPoP proofs
5. **DID Extraction**: User's DID extracted from token's `sub` claim
6. **Authorization**: SDS database permissions determine access rights

**Security Model (Production):**

- ✅ **Bearer Token Protection**: Bearer tokens rejected entirely (prevents trivial forgery)
- ✅ **Token Binding**: Access tokens are DPoP-bound at issuance by PDS
- ✅ **Client Authentication**: Clients must use dpopFetchWrapper (creates proper proofs)
- ✅ **Server-Side Proof Validation**: Full cryptographic validation of DPoP proofs

**DPoP Proof Validation:**

The SDS validates every DPoP proof by checking:

- **Proof Signature**: Verifies proof signature using embedded JWK public key
- **HTTP Method (`htm`)**: Ensures method matches the actual request
- **Target URI (`htu`)**: Ensures URI matches the SDS endpoint
- **Access Token Hash (`ath`)**: Ensures proof is bound to the presented token
- **Proof Freshness (`iat`)**: Rejects proofs older than 60 seconds
- **Replay Protection (`jti`)**: Ensures proof contains unique identifier

**Why This Is Secure:**

1. **Bearer tokens rejected**: Cannot use simple forged JWTs
2. **DPoP token type required**: Client must use dpopFetchWrapper
3. **Token is DPoP-bound**: PDS adds `cnf` claim linking token to client's key
4. **Cryptographic proof validation**: Server validates proof signature and claims
5. **Request binding**: Proof is bound to specific HTTP method and URI
6. **Replay protection**: Time-based validation prevents proof reuse

**Creating DPoP Proofs**: Clients must use `dpopFetchWrapper` from `@atproto/oauth-client`:

```typescript
import { dpopFetchWrapper } from '@atproto/oauth-client'

const sdsDpopFetch = dpopFetchWrapper({
  fetch: globalThis.fetch.bind(globalThis),
  key: session.server.dpopKey,
  supportedAlgs: session.serverMetadata.dpop_signing_alg_values_supported,
  sha256: async (v) => session.server.runtime.sha256(v),
  nonces: session.server.dpopNonces,
  isAuthServer: false,
})
```

### Permission System

Authorization is managed entirely through the SDS database:

- **Owner Access**: Repository owners (DID matches repo DID) have full access
- **Shared Permissions**: Additional users can be granted read/write/admin access
- **No OAuth Scope Validation**: Token validity is the only OAuth requirement
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
