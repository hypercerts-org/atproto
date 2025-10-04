import { OAuthConfig, TrustedIssuer } from './types'

/**
 * OAuth Configuration Manager for managing trusted OAuth issuers and their JWKS
 * in a self-contained SDS server. No external network calls required.
 */
export class OAuthConfigManager {
  private config: OAuthConfig
  private trustedIssuers: Map<string, TrustedIssuer> = new Map()

  constructor(config: OAuthConfig) {
    this.config = config

    // Initialize trusted issuers map
    for (const issuer of config.trustedIssuers) {
      this.trustedIssuers.set(issuer.issuer, issuer)
    }

    console.log(
      `[OAuthConfigManager] Initialized with ${this.trustedIssuers.size} trusted issuers`,
    )
  }

  /**
   * Get the OAuth configuration
   */
  getConfig(): OAuthConfig {
    return this.config
  }

  /**
   * Get list of trusted issuer URLs
   */
  getTrustedIssuers(): string[] {
    return Array.from(this.trustedIssuers.keys())
  }

  /**
   * Get detailed information about trusted issuers
   */
  getTrustedIssuersInfo(): TrustedIssuer[] {
    return Array.from(this.trustedIssuers.values())
  }

  /**
   * Check if a specific issuer is trusted
   */
  isTrustedIssuer(issuer: string): boolean {
    return this.trustedIssuers.has(issuer)
  }

  /**
   * Get trusted issuer information by URL
   */
  getTrustedIssuer(issuer: string): TrustedIssuer | undefined {
    return this.trustedIssuers.get(issuer)
  }

  /**
   * Get resource server metadata
   */
  getResourceServerMetadata() {
    return this.config.resourceServerMetadata
  }
}
