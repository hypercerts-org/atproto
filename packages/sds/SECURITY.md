# SDS Security Model

## OAuth Token Validation

### Current Implementation (Production)

The SDS requires DPoP tokens with cryptographic proof-of-possession:

- **DPoP tokens** (with `DPoP` header): ✅ **SECURE** - Cryptographically validated
- **Bearer tokens**: ❌ **REJECTED** - Not accepted

Bearer tokens are rejected with error: "DPoP tokens required. Bearer tokens are not accepted for security reasons."

### Bearer Token Forgery (Historical Context)

**Problem**: Bearer tokens, if accepted, could enable impersonation attacks without signature verification.

**Attack Scenario**:

```javascript
// 1. Attacker creates a fake JWT
const header = btoa(JSON.stringify({ alg: 'none', typ: 'JWT' }))
const payload = btoa(
  JSON.stringify({
    sub: 'did:plc:victim', // Any DID they want to impersonate
    iss: 'http://fake-pds.com', // Any issuer
    iat: Math.floor(Date.now() / 1000),
  }),
)
const fakeToken = `${header}.${payload}.`

// 2. Send to SDS
fetch('http://sds.example.com/xrpc/com.sds.repo.create', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${fakeToken}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ name: 'Malicious Org' }),
})

// 3. SDS accepts it!
// SimpleTokenExtractor just decodes the JWT and reads the DID
// No signature verification performed
```

**Impact**:

- Complete authentication bypass
- Attacker can impersonate any user
- Unauthorized access to all resources
- Data manipulation/theft

### Why This Happens

The `SimpleTokenExtractor` only **decodes** JWTs without **verifying** them:

```typescript
// Current code (INSECURE for Bearer tokens):
const parts = token.split('.')
const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString())
const did = payload.sub // Trusts whatever is in the token!
```

### Why JWT Signature Verification Doesn't Work

PDS uses **HS256** (HMAC-SHA256) for OAuth tokens:

- Symmetric algorithm using a secret key
- Secret key cannot be published (would allow anyone to sign tokens)
- No JWKS endpoint for external verification
- Resource servers (like SDS) **cannot verify the signature**

## The Solution: DPoP Proof Validation

DPoP (Demonstrating Proof-of-Possession) solves this problem through **cryptographic binding**:

### How DPoP Prevents Forgery

1. **Client has DPoP key pair** (generated during OAuth flow)
2. **Access token is bound to DPoP key** (`cnf` claim contains key thumbprint)
3. **Client creates DPoP proof** for each request:
   ```typescript
   {
     typ: "dpop+jwt",
     alg: "ES256",
     jwk: { /* client's public key */ }
   }
   {
     jti: "unique-id",
     htm: "POST",
     htu: "http://sds.example.com/xrpc/com.sds.repo.create",
     ath: "sha256(access_token)",
     iat: 1234567890
   }
   ```
4. **SDS validates the proof**:
   - ✅ Signature valid (using embedded public key)
   - ✅ Token hash matches (`ath` claim)
   - ✅ HTTP method matches (`htm` claim)
   - ✅ Target URI matches (`htu` claim)
   - ✅ Unique identifier prevents replay (`jti` claim)

### Attack Prevention

| Attack                 | Bearer Token  | DPoP Token                         |
| ---------------------- | ------------- | ---------------------------------- |
| Create fake JWT        | ✅ Succeeds   | ✅ Succeeds                        |
| Create fake DPoP proof | N/A           | ❌ **Fails** (no private key)      |
| Steal token            | ✅ Can use it | ❌ **Cannot use** (no private key) |
| Replay request         | ✅ Works      | ❌ **Fails** (wrong `htm`/`htu`)   |
| MITM modification      | ✅ Works      | ❌ **Fails** (proof doesn't match) |

**Key Insight**: Even if an attacker steals or forges the access token, they cannot create a valid DPoP proof without the client's private key.

## Production Implementation

### ✅ IMPLEMENTED: DPoP-Only Token Types

SDS now enforces DPoP token types. **Bearer tokens are rejected**:

```typescript
// In SdsAuthVerifier.oauth() method
if (tokenType !== 'DPoP') {
  throw new AuthRequiredError(
    'DPoP tokens required. Bearer tokens are not accepted for security reasons. ' +
      'Clients must create DPoP proofs for all requests.',
  )
}
```

### ✅ IMPLEMENTED: Full DPoP Proof Validation

SDS validates all DPoP proofs cryptographically:

```typescript
// Validate proof signature using embedded JWK
const publicKey = await jose.importJWK(dpopProofHeader.jwk, dpopProofHeader.alg)
const verifiedPayload = await jose.jwtVerify(dpopHeader, publicKey, {
  typ: 'dpop+jwt',
})

// Validate htm (HTTP method) matches request
// Validate htu (target URI) matches SDS endpoint
// Validate ath (token hash) matches presented token
// Validate iat (proof freshness) within 60 seconds
// Validate jti (unique identifier) exists
```

### Client Requirements

All clients must:

1. Obtain DPoP-bound tokens from PDS
2. Create DPoP proofs for each SDS request using `dpopFetchWrapper`
3. Send `Authorization: DPoP <token>` and `DPoP: <proof>` headers
4. Use `dpopFetchWrapper` from `@atproto/oauth-client` for automated proof creation

**Note**: The `@atproto/oauth-client` library now exports `dpopFetchWrapper` for public use.

## Security Model

### Production Implementation

**What's Implemented:**

- ✅ Bearer tokens rejected (prevents trivial forgery)
- ✅ DPoP token type required (client must use dpopFetchWrapper)
- ✅ Tokens are DPoP-bound at issuance (PDS adds `cnf` claim)
- ✅ Clients create proper DPoP proofs
- ✅ Server-side DPoP proof validation (full cryptographic validation)

**Why This Is Secure:**

The production implementation prevents all known attack vectors:

1. **Forged Bearer tokens**: Rejected at token type check
2. **Forged DPoP tokens**: Proof signature validation fails
3. **Stolen tokens**: Cannot create valid proofs without private key
4. **Stolen token + proof pairs**: Cannot replay (time-based validation)
5. **Modified requests**: htm/htu validation fails
6. **Token/proof mismatch**: ath claim validation fails

**Security Properties:**

- **Proof-of-Possession**: Cryptographic proof that client holds the private key
- **Request Binding**: Proof is bound to specific HTTP method and URI
- **Token Binding**: Proof is bound to the specific access token (ath claim)
- **Replay Protection**: Time-based validation (60 second window)
- **No Nonces Required**: Resource server mode (correct per RFC 9449)

## Alternative Solution: RS256/ES256 Tokens

If PDS switched from HS256 to RS256/ES256:

- Public keys published in JWKS
- SDS could verify JWT signatures
- Bearer tokens would be secure
- DPoP would still add additional security (proof-of-possession)

However, this requires changes to PDS and may have other implications.

## References

- [RFC 9449: OAuth 2.0 Demonstrating Proof of Possession (DPoP)](https://datatracker.ietf.org/doc/html/rfc9449)
- [RFC 7519: JSON Web Token (JWT)](https://datatracker.ietf.org/doc/html/rfc7519)
- [RFC 7515: JSON Web Signature (JWS)](https://datatracker.ietf.org/doc/html/rfc7515)
