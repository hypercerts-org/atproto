# SDS Authentication Architecture

## Overview

This document describes how authentication works in the SDS (Shared Data Server), the current implementation limitations, and why certain tests fail.

## Authentication Flow

### Production Flow (OAuth + DPoP)

When a client authenticates to the SDS in production:

1. User authenticates with their PDS via OAuth
2. PDS issues an access token (JWT) with DPoP binding
3. Client makes requests to SDS with:
   - `Authorization: DPoP <access_token>`
   - `DPoP: <dpop_proof>`
4. SDS validates the request

### What SDS Actually Validates

The SDS authentication (`SdsAuthVerifier.oauth()` in `src/sds-auth-verifier.ts`) does the following:

1. **Rejects Bearer tokens** - Only DPoP tokens are accepted (lines 216-221)
2. **Extracts DID from access token WITHOUT signature validation** - Uses `SimpleTokenExtractor` which just decodes the JWT payload and trusts the `sub` claim
3. **Validates the DPoP proof cryptographically**:
   - Verifies proof signature using the embedded JWK
   - Validates `htm` (HTTP method) matches request
   - Validates `htu` (HTTP URI) matches request
   - Validates `ath` (access token hash) matches the token
   - Checks proof freshness (`iat` within 60 seconds)
   - Checks `jti` exists (replay protection)

### Security Model

The current security model relies on:

- **DPoP proof validation** - Proves the client possesses the private key that was bound to the token during OAuth
- **Trust in access token claims** - The `sub` (DID) claim is trusted without verifying the token was actually signed by the issuing PDS
- **SDS database permissions** - Authorization is handled entirely by SDS's permission system, not OAuth scopes

## Code Locations

| Component | File | Purpose |
|-----------|------|---------|
| SDS Auth Verifier | `src/sds-auth-verifier.ts` | Main auth logic, DPoP validation |
| Simple Token Extractor | `src/oauth/simple-token-extractor.ts` | Extracts DID from JWT (no validation) |
| Federated Token Validator | `src/oauth/federated-token-validator.ts` | **EXISTS BUT NOT WIRED UP** - Would validate JWT signatures |
| Base Auth Verifier | `src/auth-verifier.ts` | PDS-inherited auth (Bearer tokens, etc.) |

## Endpoint Auth Methods

SDS endpoints use different auth methods:

### `authVerifier.oauth()` - Requires DPoP

Used by SDS-specific endpoints:
- `com.sds.organization.create`
- `com.sds.organization.list`
- `com.sds.repo.grantAccess`
- `com.sds.repo.revokeAccess`
- `com.sds.repo.getPermissions`
- `com.sds.repo.listCollaborators`
- `com.sds.repo.transferOwnership`

### `authVerifier.authorization()` - Accepts Bearer or DPoP

Used by standard ATProto endpoints:
- `com.atproto.repo.createRecord`
- `com.atproto.repo.putRecord`
- `com.atproto.repo.deleteRecord`
- `com.atproto.repo.applyWrites`
- `com.atproto.repo.uploadBlob`

## Test Environment

### Why `agent.login()` Works for Some Tests

In the test environment (`packages/dev-env`):

1. PDS and SDS share the same JWT secret (`JWT_SECRET = 'jwt-secret'`)
2. `agent.login()` calls `com.atproto.server.createSession`
3. SDS still has `createSession` endpoint (inherited from PDS codebase)
4. This issues **Bearer tokens** signed with the shared secret
5. Endpoints using `authVerifier.authorization()` accept these Bearer tokens

### Why `organization-creation.test.ts` Fails

The test fails because:

1. It uses `agent.login()` which produces Bearer tokens
2. `com.sds.organization.create` uses `authVerifier.oauth()`
3. `SdsAuthVerifier.oauth()` explicitly rejects Bearer tokens:
   ```typescript
   if (tokenType !== 'DPoP') {
     throw new AuthRequiredError(
       'DPoP tokens required. Bearer tokens are not accepted...'
     )
   }
   ```

### Why `sds-network-integration.test.ts` Works

This test also uses `agent.login()`, but it calls endpoints like `com.sds.repo.getPermissions` which... wait, that also uses `oauth()`. Let me check if it's actually passing or also broken.

**Update**: If `sds-network-integration.test.ts` is passing, it may be because:
1. The tests are skipped
2. The endpoints were changed to use `authorization()` instead of `oauth()`
3. There's something else going on

## Known Issues

### 1. Access Token Not Validated

The access token's signature is never verified. The SDS trusts the `sub` claim without checking that the token was actually signed by the claimed issuer (PDS).

**Risk**: A malicious actor could craft a fake JWT with any DID in the `sub` claim. The DPoP proof would still need to be valid, but since DPoP keys are generated client-side, this is theoretically exploitable.

**Mitigation**: The `FederatedTokenValidator` class exists and is designed to fix this, but it's not integrated.

### 2. `createSession` Exists on SDS

The SDS inherited `createSession` from the PDS codebase. This allows username/password login directly to the SDS, which may not be the intended architecture.

### 3. Test Auth Mismatch

Tests use `agent.login()` (Bearer tokens) but SDS-specific endpoints require DPoP tokens.

## Fixing the Tests

Options for fixing `organization-creation.test.ts`:

### Option 1: Use OAuth with DPoP in Tests

Implement proper OAuth flow in tests. This is complex but matches production behavior.

### Option 2: Change Endpoints to Accept Bearer (Test Only)

Add a test mode or change `com.sds.*` endpoints to use `authorization()` instead of `oauth()`.

### Option 3: Add Bearer Support to `SdsAuthVerifier.oauth()`

Modify `oauth()` to accept Bearer tokens in addition to DPoP, at least for testing.

### Option 4: Create Test Helper for DPoP

Create a test utility that generates valid DPoP proofs for test tokens.

## Future Work

### Integrate FederatedTokenValidator

The `FederatedTokenValidator` should be wired into `SdsAuthVerifier.oauth()` to properly validate access tokens:

```typescript
// In SdsAuthVerifier.oauth()
const { did } = await this.federatedValidator.validateToken(token)
```

This would:
1. Decode token to get issuer (`iss` claim)
2. Fetch OAuth metadata from `{issuer}/.well-known/oauth-authorization-server`
3. Fetch JWKS from the `jwks_uri`
4. Validate JWT signature against issuer's public keys
5. Return validated DID

### Remove or Restrict createSession

Consider whether SDS should support `createSession` at all, or restrict it to specific use cases.

## References

- `FederatedTokenValidator` README: `src/oauth/README.md`
- OAuth Provider package: `packages/oauth/oauth-provider`
- DPoP RFC: https://datatracker.ietf.org/doc/html/rfc9449
