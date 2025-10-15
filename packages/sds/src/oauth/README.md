# OAuth Federated Token Validation Module

This module implements federated OAuth 2.0 token validation for the Shared Data Server (SDS). It validates OAuth tokens from any PDS in the AT Protocol network by fetching JWKS (JSON Web Key Sets) from the issuing PDS and performing local JWT signature verification.

## Overview

The OAuth module provides:

- **Federated JWT Validation**: Validates tokens from any PDS by fetching their public keys
- **JWKS Fetching**: Retrieves public keys from PDS OAuth metadata endpoints
- **DID Extraction**: Extracts the user's DID from validated token claims
- **DPoP Support**: Handles both Bearer and DPoP token types
- **JWKS Caching**: Caches public keys to minimize network requests
- **No OAuth Scope Validation**: Authorization handled solely by SDS database

## Architecture

```
┌─────────────────┐                              ┌─────────────────┐
│   SDS Server    │                              │   PDS Server    │
│  (Resource)     │                              │ (Auth Server)   │
│                 │                              │                 │
│ ┌─────────────┐ │                              │ ┌─────────────┐ │
│ │ Federated   │ │──────① Fetch OAuth Metadata─▶│ │.well-known/ │ │
│ │   Token     │ │                              │ │oauth-authz  │ │
│ │ Validator   │ │◀─────② Return jwks_uri──────│ │-server      │ │
│ │             │ │                              │ └─────────────┘ │
│ │             │ │──────③ Fetch JWKS───────────▶│ ┌─────────────┐ │
│ │             │ │◀─────④ Return Public Keys───│ │  JWKS       │ │
│ └─────────────┘ │                              │ │  Endpoint   │ │
│        │        │                              │ └─────────────┘ │
│        ▼        │                              │                 │
│ ┌─────────────┐ │                              │                 │
│ │   Verify    │ │                              │                 │
│ │   JWT       │ │                              │                 │
│ │ Signature   │ │                              │                 │
│ └─────────────┘ │                              │                 │
└─────────────────┘                              └─────────────────┘
```

## Components

### FederatedTokenValidator

The main class that handles federated token validation:

```typescript
import { FederatedTokenValidator } from './oauth/federated-token-validator'

const validator = new FederatedTokenValidator({
  cacheTTL: 3600000, // 1 hour cache for JWKS (default)
})

// Validate a token from any PDS
const result = await validator.validateToken(
  token,
  'Bearer', // or 'DPoP'
)

console.log(result.did) // User's DID
console.log(result.issuer) // PDS that issued the token
console.log(result.claims) // Full JWT claims
```

### Token Validation Flow

1. **Decode Token** (without verification) to extract `iss` claim
2. **Check Cache** for JWKS from this issuer
3. **Fetch OAuth Metadata** from `{issuer}/.well-known/oauth-authorization-server`
4. **Fetch JWKS** from the `jwks_uri` in the metadata
5. **Create Keyset** from the fetched public keys
6. **Validate JWT** signature using the Keyset
7. **Verify Claims** (expiration, issuer match, etc.)
8. **Extract DID** from the `sub` claim
9. **Cache JWKS** for future requests

## Key Features

### Open Federation

SDS trusts any PDS in the AT Protocol network to issue valid tokens. No pre-configuration or registration is required. This aligns with the decentralized nature of the AT Protocol.

### Standard OAuth 2.0

Uses standard OAuth 2.0 JWT validation:

- JWKS (RFC 7517) for public key distribution
- JWT (RFC 7519) for token format
- OAuth 2.0 Authorization Server Metadata (RFC 8414)

### JWKS Caching

Public keys are cached by issuer URL with a configurable TTL (default: 1 hour). This:

- Reduces network latency for repeated validations
- Minimizes load on PDS servers
- Maintains security (keys are still fetched regularly)

### DPoP Support

Both Bearer and DPoP token types are supported. For DPoP tokens:

- The DPoP proof is extracted from the request header
- Token binding is verified using the public key in the DPoP proof
- Validation is performed using the fetched JWKS

### No Scope Validation

Unlike traditional OAuth resource servers, SDS does not validate OAuth scopes. Authorization decisions are made entirely based on:

- Token validity (signature, expiration)
- User identity (DID from token)
- SDS database permissions

## Security Considerations

### Trust Model

**SDS trusts PDS instances to:**

- Issue valid OAuth tokens to authenticated users
- Correctly identify users via the `sub` claim (DID)
- Secure their signing keys
- Rotate keys appropriately

**SDS does NOT trust PDS instances for:**

- Authorization decisions (handled by SDS database)
- User permissions (handled by SDS database)
- Access control (handled by SDS database)

### Network Security

- **JWKS Fetching**: Uses HTTPS to fetch OAuth metadata and JWKS
- **Issuer Validation**: Verifies that the issuer in the token matches the OAuth metadata
- **SSRF Protection**: Consider implementing URL validation for issuer URLs
- **Rate Limiting**: JWKS requests should be rate-limited per issuer

### Token Security

- **Signature Verification**: All tokens are verified using public-key cryptography
- **Expiration**: Tokens are checked for expiration (`exp` claim)
- **Replay Protection**: DPoP provides replay protection for supported clients
- **Revocation**: Token revocation is handled by the issuing PDS (tokens expire)

### Performance Considerations

- **Network Latency**: Initial validation adds ~50-200ms for JWKS fetch
- **Caching**: Subsequent validations are fast (cached JWKS)
- **PDS Availability**: Token validation depends on PDS availability for initial JWKS fetch
- **Cache Invalidation**: JWKS cache TTL should balance security and performance

## Configuration

The `FederatedTokenValidator` accepts an optional configuration object:

```typescript
const validator = new FederatedTokenValidator({
  cacheTTL: 3600000, // Cache JWKS for 1 hour (default)
})
```

### Cache TTL

The `cacheTTL` parameter controls how long JWKS are cached:

- **Lower values** (e.g., 5 minutes): More secure, higher network load
- **Higher values** (e.g., 24 hours): Less secure, lower network load
- **Default** (1 hour): Balanced approach

## Error Handling

The validator throws `AuthRequiredError` for various failure conditions:

- **Token missing issuer**: Token doesn't have an `iss` claim
- **Invalid JWT format**: Token is malformed
- **OAuth metadata fetch failed**: PDS metadata endpoint returned error
- **JWKS fetch failed**: JWKS endpoint returned error
- **Signature verification failed**: Token signature doesn't match any key
- **Token expired**: Token's `exp` claim is in the past
- **Invalid DID**: Token's `sub` claim is not a valid DID

## Example Usage

```typescript
import { SdsAuthVerifier } from './sds-auth-verifier'

// In SdsAuthVerifier
class SdsAuthVerifier extends AuthVerifier {
  private federatedValidator: FederatedTokenValidator

  constructor(/* ... */) {
    super(/* ... */)
    this.federatedValidator = new FederatedTokenValidator()
  }

  oauth() {
    return async (ctx) => {
      // Extract token from authorization header
      const authHeader = ctx.req.headers.authorization
      const [tokenType, token] = authHeader.split(' ')

      // Validate token using federated validator
      const result = await this.federatedValidator.validateToken(
        token,
        tokenType as 'Bearer' | 'DPoP',
      )

      // Check SDS database permissions (separate from OAuth)
      const hasAccess = await this.permissionManager.checkAccess(
        repoDid,
        result.did,
        'read',
      )

      return {
        credentials: {
          type: 'oauth',
          did: result.did,
        },
      }
    }
  }
}
```

## Comparison with Introspection

This implementation uses **JWT validation** instead of **token introspection**:

| Aspect             | Federated JWT           | Introspection      |
| ------------------ | ----------------------- | ------------------ |
| Network calls      | One per issuer (cached) | One per validation |
| Latency            | Low (after cache)       | Higher             |
| PDS load           | Lower                   | Higher             |
| Standards          | OAuth 2.0 JWT           | RFC 7662           |
| Offline validation | Yes (with cache)        | No                 |
| Implementation     | More complex            | Simpler            |

## Future Enhancements

Potential improvements for future versions:

- **Key rotation handling**: Automatic retry on signature failure (key may have rotated)
- **Revocation checking**: Support for OAuth token revocation lists
- **Enhanced caching**: Redis-based cache for multi-instance deployments
- **Metrics**: Track JWKS fetch latency, cache hit rate, validation failures
- **SSRF protection**: Validate issuer URLs against allowlist/blocklist
