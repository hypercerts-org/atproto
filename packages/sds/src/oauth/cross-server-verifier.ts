import { JoseKey, Keyset, OAuthVerifier } from '@atproto/oauth-provider'
import { CrossServerOAuthVerifierOptions, TrustedIssuer } from './types'

/**
 * Cross-Server OAuth Verifier that can handle tokens from multiple pre-configured OAuth providers
 * without making external network calls. Uses locally stored JWKS for all trusted issuers.
 */
export class CrossServerOAuthVerifier extends OAuthVerifier {
  private trustedIssuers: Map<string, TrustedIssuer>
  private issuerKeysets: Map<string, Keyset>

  constructor(options: CrossServerOAuthVerifierOptions) {
    // Allow empty trusted issuers for development/test environments
    if (options.trustedIssuers.length === 0) {
      console.log(
        '[CrossServerOAuthVerifier] No trusted issuers configured - running in permissive mode',
      )
      // Initialize with dummy values for permissive mode
      super({
        issuer: 'http://localhost:2583', // Use a valid URL format
        keyset: new Keyset([]),
        dpopSecret: options.dpopSecret,
        redis: options.redis,
      })
      this.trustedIssuers = new Map() // Initialize to an empty map
      this.issuerKeysets = new Map()
    } else {
      // Use the first trusted issuer as the primary issuer for base class
      const primaryIssuer = options.trustedIssuers[0]

      // Create keyset from primary issuer's JWKS
      const primaryKeys = primaryIssuer.jwks.keys.map((key: any) =>
        JoseKey.fromJWK(key),
      )
      const primaryKeyset = new Keyset(primaryKeys)

      super({
        issuer: primaryIssuer.issuer,
        keyset: primaryKeyset,
        dpopSecret: options.dpopSecret,
        redis: options.redis,
      })

      this.trustedIssuers = new Map()
      this.issuerKeysets = new Map()

      // Initialize all trusted issuers and their keysets
      for (const trustedIssuer of options.trustedIssuers) {
        this.trustedIssuers.set(trustedIssuer.issuer, trustedIssuer)

        // Create keyset for this issuer
        const keys = trustedIssuer.jwks.keys.map((key: any) =>
          JoseKey.fromJWK(key),
        )
        this.issuerKeysets.set(trustedIssuer.issuer, new Keyset(keys))
      }
      console.log(
        `[CrossServerOAuthVerifier] Initialized with ${this.trustedIssuers.size} trusted issuers`,
      )
    }
  }

  private addTrustedIssuerKeyset(trustedIssuer: TrustedIssuer): void {
    const keys = trustedIssuer.jwks.keys.map((key: any) => JoseKey.fromJWK(key))
    this.issuerKeysets.set(trustedIssuer.issuer, new Keyset(keys))
  }

  /**
   * Get JWKS for a trusted issuer from local configuration
   * No external network calls - uses pre-configured JWKS
   */
  private getJwks(issuer: string): any {
    const trustedIssuer = this.trustedIssuers.get(issuer)
    if (!trustedIssuer) {
      throw new Error(`Issuer ${issuer} is not in trusted issuers list`)
    }
    return trustedIssuer.jwks
  }

  /**
   * Override token verification to support multiple issuers
   * Extracts issuer from token, validates trust, and uses pre-configured keys
   */
  protected async verifyToken(
    tokenType: any,
    token: string,
    dpopProof: any,
    verifyOptions?: any,
  ): Promise<any> {
    // If in permissive mode, skip issuer validation
    if (this.trustedIssuers.size === 0) {
      console.log(
        '[CrossServerOAuthVerifier] Running in permissive mode - skipping issuer validation',
      )
      // In permissive mode, we still need a keyset for the base verifier,
      // but we don't have one from a trusted issuer.
      // This scenario needs careful handling: either the base verifier
      // needs to be bypassed, or a dummy keyset is used and actual
      // token verification is skipped/mocked.
      // For now, we'll let the base verifier fail if it can't find a key,
      // as this mode is primarily for tests where tokens might be mocked.
      return super.verifyToken(tokenType, token, dpopProof, verifyOptions)
    }

    // Decode token without verification to get issuer
    const [, payload] = token.split('.').map((part) => {
      try {
        return JSON.parse(Buffer.from(part, 'base64url').toString())
      } catch (e) {
        throw new Error('Invalid token format')
      }
    })

    const issuer = payload.iss
    if (!issuer) {
      throw new Error('Token missing issuer claim')
    }

    // Check if issuer is trusted
    if (!this.trustedIssuers.has(issuer)) {
      console.log(`[CrossServerOAuthVerifier] Untrusted issuer: ${issuer}`)
      console.log(
        `[CrossServerOAuthVerifier] Trusted issuers:`,
        Array.from(this.trustedIssuers.keys()),
      )
      throw new Error(`Untrusted issuer: ${issuer}`)
    }

    console.log(
      `[CrossServerOAuthVerifier] Verifying token from trusted issuer: ${issuer}`,
    )

    // Get pre-configured keyset for this issuer
    const keyset = this.issuerKeysets.get(issuer)
    if (!keyset) {
      throw new Error(`No keyset configured for issuer: ${issuer}`)
    }

    // Temporarily replace the keyset and issuer for verification
    const originalKeyset = this.keyset
    const originalIssuer = this.issuer

    try {
      // @ts-ignore - accessing private properties for verification
      this.keyset = keyset
      // @ts-ignore
      this.issuer = issuer

      // Call the base class verification method
      return await super.verifyToken(tokenType, token, dpopProof, verifyOptions)
    } finally {
      // Restore original values
      // @ts-ignore
      this.keyset = originalKeyset
      // @ts-ignore
      this.issuer = originalIssuer
    }
  }

  /**
   * Get list of trusted issuers
   */
  getTrustedIssuers(): string[] {
    return this.trustedIssuers ? Array.from(this.trustedIssuers.keys()) : []
  }

  /**
   * Get detailed information about trusted issuers
   */
  getTrustedIssuersInfo(): TrustedIssuer[] {
    return this.trustedIssuers ? Array.from(this.trustedIssuers.values()) : []
  }

  /**
   * Check if an issuer is trusted
   */
  isTrustedIssuer(issuer: string): boolean {
    return this.trustedIssuers ? this.trustedIssuers.has(issuer) : false
  }
}
