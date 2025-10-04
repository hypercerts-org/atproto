# OAuth Cross-Server Authentication Module

This module implements a self-contained OAuth 2.0 Resource Server for the Shared Data Server (SDS) that can handle tokens from multiple PDS (Personal Data Server) instances in a federated AT Protocol network.

## Overview

The OAuth module provides:

- **Cross-Server OAuth Verifier**: Validates tokens from multiple pre-configured OAuth providers
- **OAuth Configuration Manager**: Manages trusted issuers and resource server metadata
- **Static JWKS Configuration**: Uses pre-configured JWKS for all trusted issuers
- **No External Dependencies**: Self-contained with no external network calls during token validation

## Architecture

```
┌─────────────────┐                              ┌─────────────────┐
│   SDS Server    │                              │   PDS Server    │
│                 │                              │                 │
│ ┌─────────────┐ │                              │ ┌─────────────┐ │
│ │Cross-Server │ │◄─────────────────────────────┤ │OAuth Server │ │
│ │OAuth Verifier│ │                              │ │             │ │
│ └─────────────┘ │                              │ └─────────────┘ │
│                 │                              │                 │
│ ┌─────────────┐ │                              │                 │
│ │OAuth Config │ │                              │                 │
│ │Manager      │ │                              │                 │
│ └─────────────┘ │                              │                 │
└─────────────────┘                              └─────────────────┘
         │                                               │
         │                                               │
         ▼                                               ▼
┌─────────────────┐                              ┌─────────────────┐
│ Validates JWT   │                              │ Issues JWT      │
│ Tokens using   │                              │ Tokens          │
│ Pre-configured │                              │                 │
│ JWKS           │                              │                 │
└─────────────────┘                              └─────────────────┘
```

## Components

### CrossServerOAuthVerifier

Extends the base `OAuthVerifier` to support multiple pre-configured issuers:

```typescript
const verifier = new CrossServerOAuthVerifier({
  trustedIssuers: [
    {
      issuer: 'https://pds1.example.com',
      jwks: { keys: [...] },
      metadata: { name: 'PDS Server 1' }
    },
    {
      issuer: 'https://pds2.example.com',
      jwks: { keys: [...] },
      metadata: { name: 'PDS Server 2' }
    }
  ],
  dpopSecret: 'your-dpop-secret',
  redis: redisClient
})

// Check if issuer is trusted
const isTrusted = verifier.isTrustedIssuer('https://pds1.example.com')

// Get trusted issuers
const issuers = verifier.getTrustedIssuers()
```

### OAuthConfigManager

Manages OAuth configuration and trusted issuers:

```typescript
const configManager = new OAuthConfigManager({
  trustedIssuers: [
    {
      issuer: 'https://pds1.example.com',
      jwks: { keys: [...] },
      metadata: { name: 'PDS Server 1' }
    }
  ],
  resourceServerMetadata: {
    scopes: ['atproto', 'sds:read', 'sds:write', 'sds:admin'],
    documentation: 'https://atproto.com/specs/sds'
  }
})

// Get trusted issuers
const issuers = configManager.getTrustedIssuers()

// Check if issuer is trusted
const isTrusted = configManager.isTrustedIssuer('https://pds1.example.com')

// Get resource server metadata
const metadata = configManager.getResourceServerMetadata()
```

## Key Features

### Static JWKS Configuration

The verifier uses pre-configured JWKS for all trusted issuers:

```typescript
const verifier = new CrossServerOAuthVerifier({
  trustedIssuers: [
    {
      issuer: 'https://pds1.example.com',
      jwks: {
        keys: [
          {
            kty: 'EC',
            crv: 'P-256',
            x: 'base64-encoded-x',
            y: 'base64-encoded-y',
            kid: 'key-id',
          },
        ],
      },
    },
  ],
})
```

### No External Network Calls

Token validation is completely self-contained:

```typescript
// No network calls during token validation
const isValid = await verifier.verifyToken(token, dpopProof)
```

### Permissive Mode

Supports permissive mode for development and testing:

```typescript
// Initialize with empty trusted issuers for permissive mode
const verifier = new CrossServerOAuthVerifier({
  trustedIssuers: [], // Permissive mode
})
```

### Error Handling

Robust error handling for token validation:

```typescript
try {
  const result = await verifier.verifyToken(token, dpopProof)
} catch (error) {
  if (error.message.includes('Untrusted issuer')) {
    console.error('Token from untrusted issuer')
  }
}
```

## Security Considerations

- **No Shared Secrets**: Each PDS maintains its own JWT signing keys
- **Pre-configured Trust**: Only pre-configured trusted issuers are accepted
- **Static JWKS**: JWKS are provided at configuration time, no runtime fetching
- **Token Validation**: Full JWT signature verification with DPoP support
- **Self-contained**: No external network dependencies during token validation

## Production Deployment

For production deployment:

1. **Configure Trusted Issuers**: Set up trusted PDS servers with their JWKS
2. **Secure Configuration**: Store JWKS securely in configuration
3. **Monitor Performance**: Track token validation times
4. **Security Audit**: Regularly audit trusted issuer configurations

## Configuration

The OAuth module is configured through environment variables:

```bash
# Trusted OAuth issuers configuration (JSON string)
SDS_TRUSTED_OAUTH_ISSUERS_CONFIG='[
  {
    "issuer": "https://pds1.example.com",
    "jwks": { "keys": [...] },
    "metadata": { "name": "PDS Server 1" }
  }
]'
```

## Future Enhancements

- **Dynamic Configuration**: Support for runtime configuration updates
- **Metrics**: Detailed metrics for monitoring and debugging
- **Admin API**: REST API for managing trusted issuers
- **Configuration Validation**: Validate JWKS format and issuer URLs

## Related Documentation

- [OAuth 2.0 Resource Server Metadata](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-resource-metadata)
- [OAuth 2.0 Authorization Server Metadata](https://datatracker.ietf.org/doc/html/rfc8414)
- [JSON Web Key Set (JWKS)](https://datatracker.ietf.org/doc/html/rfc7517)
- [OAuth 2.0 DPoP](https://datatracker.ietf.org/doc/html/rfc9449)
