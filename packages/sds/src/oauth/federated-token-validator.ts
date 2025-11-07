import { JoseKey, Keyset } from '@atproto/oauth-provider'
import { AuthRequiredError } from '@atproto/xrpc-server'

/**
 * Result of token validation
 */
export interface TokenValidationResult {
  did: string
  issuer: string
  claims: any
}

/**
 * OAuth Authorization Server metadata
 */
interface OAuthMetadata {
  issuer: string
  jwks_uri: string
  [key: string]: any
}

/**
 * JWKS cache entry
 */
interface JWKSCacheEntry {
  keyset: Keyset
  fetchedAt: number
}

/**
 * Federated Token Validator
 *
 * Validates OAuth tokens from any PDS by:
 * 1. Extracting issuer from token
 * 2. Fetching OAuth metadata and JWKS from issuer
 * 3. Validating JWT signature locally
 * 4. Extracting DID from validated claims
 *
 * Implements caching to avoid repeated JWKS fetches.
 */
export class FederatedTokenValidator {
  private jwksCache: Map<string, JWKSCacheEntry> = new Map()
  private readonly cacheTTL: number

  constructor(options: { cacheTTL?: number } = {}) {
    // Default 1 hour cache TTL
    this.cacheTTL = options.cacheTTL ?? 3600000
  }

  /**
   * Validate an OAuth token from any PDS issuer
   */
  async validateToken(token: string): Promise<TokenValidationResult> {
    // 1. Decode token to extract issuer (without verification)
    const payload = this.decodeTokenPayload(token)

    if (!payload?.iss) {
      throw new AuthRequiredError('Token missing issuer claim')
    }

    const issuer = payload.iss

    // 2. Get or fetch JWKS for this issuer
    const keyset = await this.getKeyset(issuer)

    // 3. Validate JWT signature and claims
    try {
      const verified = await keyset.verifyJwt(
        token as `${string}.${string}.${string}`,
        {
          issuer: [issuer], // Expected issuer (array)
          clockTolerance: 60, // 60 second clock tolerance
        },
      )

      // 4. Extract DID from sub claim
      const did = verified.payload.sub
      if (!did || !did.startsWith('did:')) {
        throw new AuthRequiredError('Invalid DID in token subject')
      }

      return {
        did,
        issuer,
        claims: verified.payload,
      }
    } catch (error) {
      console.error('[FederatedTokenValidator] Token validation failed:', error)
      throw new AuthRequiredError(
        `Token validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      )
    }
  }

  /**
   * Get or fetch JWKS for an issuer
   */
  private async getKeyset(issuer: string): Promise<Keyset> {
    // Check cache
    const cached = this.jwksCache.get(issuer)
    if (cached && Date.now() - cached.fetchedAt < this.cacheTTL) {
      return cached.keyset
    }

    // Fetch fresh JWKS
    const keyset = await this.fetchKeyset(issuer)

    // Cache it
    this.jwksCache.set(issuer, {
      keyset,
      fetchedAt: Date.now(),
    })

    return keyset
  }

  /**
   * Fetch JWKS from issuer's OAuth metadata
   */
  private async fetchKeyset(issuer: string): Promise<Keyset> {
    try {
      // 1. Fetch OAuth metadata
      const metadataUrl = `${issuer}/.well-known/oauth-authorization-server`

      const metadataResponse = await fetch(metadataUrl)
      if (!metadataResponse.ok) {
        throw new Error(
          `Failed to fetch OAuth metadata: ${metadataResponse.status}`,
        )
      }

      const metadata = (await metadataResponse.json()) as OAuthMetadata

      // Verify issuer matches
      if (metadata.issuer !== issuer) {
        throw new Error(
          `Issuer mismatch: expected ${issuer}, got ${metadata.issuer}`,
        )
      }

      if (!metadata.jwks_uri) {
        throw new Error('OAuth metadata missing jwks_uri')
      }

      // 2. Fetch JWKS
      const jwksResponse = await fetch(metadata.jwks_uri)
      if (!jwksResponse.ok) {
        throw new Error(`Failed to fetch JWKS: ${jwksResponse.status}`)
      }

      const jwks = (await jwksResponse.json()) as { keys?: unknown[] }

      if (!jwks.keys || !Array.isArray(jwks.keys)) {
        throw new Error('Invalid JWKS format')
      }

      // 3. Create Keyset from JWKS
      const keys = await Promise.all(
        jwks.keys.map((jwk: any) => JoseKey.fromJWK(jwk)),
      )

      return new Keyset(keys)
    } catch (error) {
      throw new AuthRequiredError(
        `Failed to fetch JWKS for issuer ${issuer}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      )
    }
  }

  /**
   * Decode JWT token payload without verification
   */
  private decodeTokenPayload(token: string): any {
    try {
      const parts = token.split('.')
      if (parts.length !== 3) {
        throw new Error('Invalid JWT format')
      }
      return JSON.parse(Buffer.from(parts[1], 'base64url').toString())
    } catch (error) {
      throw new AuthRequiredError('Failed to decode token')
    }
  }

  /**
   * Clear the JWKS cache (useful for testing)
   */
  clearCache(): void {
    this.jwksCache.clear()
  }
}
