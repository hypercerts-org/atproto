import { AuthRequiredError } from '@atproto/xrpc-server'

/**
 * Simple Token Extractor for PoC
 *
 * Minimal validation approach for proof of concept:
 * - Decodes JWT without signature verification
 * - Extracts DID from sub claim
 * - Trusts token claims on faith
 *
 * This is suitable for PoC/testing in trusted development environments.
 * Production deployments should implement proper JWT signature validation.
 */
export class SimpleTokenExtractor {
  /**
   * Extract DID from OAuth token without validating signature
   *
   * @param token - The JWT access token string
   * @returns Object containing the DID and issuer
   */
  extractDid(token: string): { did: string; issuer: string } {
    console.log(
      '[SimpleTokenExtractor] Extracting DID from token (no validation)',
    )

    // Decode JWT payload (no signature verification)
    const payload = this.decodeJwtPayload(token)

    if (!payload?.sub || !payload.sub.startsWith('did:')) {
      throw new AuthRequiredError('Invalid or missing DID in token')
    }

    const did = payload.sub
    const issuer = payload.iss || 'unknown'

    console.log(
      `[SimpleTokenExtractor] Extracted DID: ${did}, Issuer: ${issuer}`,
    )

    return { did, issuer }
  }

  /**
   * Decode JWT payload without verifying signature
   *
   * @param token - The JWT token string
   * @returns Decoded payload object
   */
  private decodeJwtPayload(token: string): any {
    try {
      const parts = token.split('.')
      if (parts.length !== 3) {
        throw new Error('Invalid JWT format')
      }

      // Decode the payload (second part of JWT)
      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString())

      return payload
    } catch (error) {
      throw new AuthRequiredError(
        `Failed to decode token: ${error instanceof Error ? error.message : 'Unknown error'}`,
      )
    }
  }
}
