// SDS Auth Verifier - Extends PDS auth with multi-user permission checks
import { createHash } from 'node:crypto'
import * as jose from 'jose'
import { IdResolver } from '@atproto/identity'
import { OAuthVerifier } from '@atproto/oauth-provider'
import {
  AuthRequiredError,
  MethodAuthContext,
  Params,
} from '@atproto/xrpc-server'
import { AccountManager } from './account-manager/account-manager'
import { AuthVerifier, AuthVerifierOpts } from './auth-verifier'
import { SimpleTokenExtractor } from './oauth/simple-token-extractor'
import { SdsPermissionManager } from './permission-manager'
import { PermissionCheckContext, RepositoryPermissions } from './types'
import { appendVary } from './util/http'

/**
 * SDS Auth Verifier extends the base PDS auth verifier with
 * simple OAuth token extraction and SDS permission checking.
 *
 * Authentication: Extracts DID from OAuth tokens (minimal validation for PoC)
 * Authorization: Checks SDS database permissions only (no OAuth scope validation)
 */
export class SdsAuthVerifier extends AuthVerifier {
  private tokenExtractor: SimpleTokenExtractor
  private publicUrl: string

  constructor(
    accountManager: AccountManager,
    idResolver: IdResolver,
    oauthVerifier: OAuthVerifier,
    opts: AuthVerifierOpts,
    private permissionManager: SdsPermissionManager,
  ) {
    super(accountManager, idResolver, oauthVerifier, opts)
    this.tokenExtractor = new SimpleTokenExtractor()
    this.publicUrl = opts.publicUrl
    console.log(
      '[SDS Auth] SdsAuthVerifier instantiated with production DPoP validation',
    )
  }

  /**
   * Validates a DPoP proof without nonce verification (resource server mode)
   *
   * This validates:
   * - Proof signature using embedded JWK
   * - HTTP method (htm) matches request
   * - Target URI (htu) matches request
   * - Access token hash (ath) matches token
   * - Proof freshness (iat within 60 seconds)
   * - Replay protection (jti exists)
   *
   * Does NOT validate nonces (authorization server responsibility)
   */
  private async validateDpopProof(
    method: string,
    url: URL,
    headers: Record<string, undefined | string | string[]>,
    accessToken: string,
  ): Promise<{ jkt: string }> {
    // 1. Extract DPoP header
    const dpopHeader = headers['dpop']
    if (!dpopHeader || typeof dpopHeader !== 'string') {
      throw new AuthRequiredError('Missing DPoP header')
    }

    console.log('[SDS Auth] Extracting DPoP proof')

    // 2. Decode DPoP proof to get structure
    let dpopProofHeader: any

    try {
      const parts = dpopHeader.split('.')
      if (parts.length !== 3) {
        throw new Error('Invalid JWT format')
      }

      dpopProofHeader = JSON.parse(
        Buffer.from(parts[0], 'base64url').toString('utf-8'),
      )
    } catch (error) {
      throw new AuthRequiredError('Invalid DPoP proof format')
    }

    // 3. Validate DPoP proof structure
    if (dpopProofHeader.typ !== 'dpop+jwt') {
      throw new AuthRequiredError('DPoP proof must have typ=dpop+jwt')
    }

    if (!dpopProofHeader.jwk) {
      throw new AuthRequiredError('DPoP proof must include jwk in header')
    }

    console.log('[SDS Auth] Validating DPoP proof signature')

    // 4. Import the JWK from the DPoP proof header
    let publicKey: jose.KeyLike | Uint8Array
    try {
      publicKey = await jose.importJWK(dpopProofHeader.jwk, dpopProofHeader.alg)
    } catch (error) {
      throw new AuthRequiredError('Invalid JWK in DPoP proof')
    }

    // 5. Verify the DPoP proof signature
    let verifiedPayload: jose.JWTVerifyResult
    try {
      verifiedPayload = await jose.jwtVerify(dpopHeader, publicKey, {
        typ: 'dpop+jwt',
      })
    } catch (error) {
      console.error('[SDS Auth] DPoP signature verification failed:', error)
      throw new AuthRequiredError('DPoP proof signature verification failed')
    }

    console.log('[SDS Auth] ✅ DPoP proof signature verified')

    // 6. Validate htm claim (HTTP method)
    if (verifiedPayload.payload.htm !== method) {
      throw new AuthRequiredError(
        `DPoP proof htm claim mismatch. Expected ${method}, got ${verifiedPayload.payload.htm}`,
      )
    }

    // 7. Validate htu claim (HTTP URI)
    const expectedHtu = `${url.protocol}//${url.host}${url.pathname}`
    if (verifiedPayload.payload.htu !== expectedHtu) {
      throw new AuthRequiredError(
        `DPoP proof htu claim mismatch. Expected ${expectedHtu}, got ${verifiedPayload.payload.htu}`,
      )
    }

    // 8. Validate ath claim (access token hash)
    const tokenHash = createHash('sha256')
      .update(accessToken)
      .digest('base64url')

    if (verifiedPayload.payload.ath !== tokenHash) {
      throw new AuthRequiredError(
        'DPoP proof ath claim does not match access token',
      )
    }

    // 9. Validate jti claim exists (replay protection)
    if (
      !verifiedPayload.payload.jti ||
      typeof verifiedPayload.payload.jti !== 'string'
    ) {
      throw new AuthRequiredError('DPoP proof must include jti claim')
    }

    // 10. Validate iat claim (issued at time)
    if (
      !verifiedPayload.payload.iat ||
      typeof verifiedPayload.payload.iat !== 'number'
    ) {
      throw new AuthRequiredError('DPoP proof must include iat claim')
    }

    // Check if proof is too old (e.g., more than 60 seconds)
    const now = Math.floor(Date.now() / 1000)
    const age = now - verifiedPayload.payload.iat
    if (age > 60) {
      throw new AuthRequiredError('DPoP proof is too old')
    }
    if (age < -5) {
      // Allow 5 seconds clock skew
      throw new AuthRequiredError('DPoP proof iat is in the future')
    }

    console.log('[SDS Auth] ✅ All DPoP proof claims validated')

    // 11. Calculate JKT (thumbprint) for the response
    const jkt = await jose.calculateJwkThumbprint(dpopProofHeader.jwk, 'sha256')

    return { jkt }
  }

  /**
   * Override oauth method with DPoP-only authentication
   *
   * This method:
   * 1. Extracts DPoP token from authorization header
   * 2. Validates cryptographic proof-of-possession (DPoP proof)
   * 3. Extracts DID from token (no signature validation of token itself)
   * 4. Returns credentials (authorization checked via SDS DB permissions)
   *
   * Security: Bearer tokens are rejected. All clients must use DPoP.
   */
  oauth<P extends Params = Params>(_options: any = {}): any {
    return async (ctx: MethodAuthContext<P>) => {
      this.setAuthHeaders(ctx.res)

      console.log('[SDS Auth] OAuth authentication started')

      try {
        // Extract authorization header
        const authHeader = ctx.req.headers.authorization
        if (!authHeader) {
          throw new AuthRequiredError('Missing authorization header')
        }

        // Parse token type and token
        const parts = authHeader.split(' ')
        if (parts.length !== 2) {
          throw new AuthRequiredError('Invalid authorization header format')
        }

        const [tokenType, token] = parts
        if (!token) {
          throw new AuthRequiredError('Missing token')
        }

        // Only DPoP tokens are accepted
        if (tokenType !== 'DPoP') {
          throw new AuthRequiredError(
            'DPoP tokens required. Bearer tokens are not accepted for security reasons. ' +
              'Clients must create DPoP proofs for all requests.',
          )
        }

        console.log(`[SDS Auth] Extracting DID from token`)

        // Extract DID from token (no signature validation of token itself)
        const { did } = this.tokenExtractor.extractDid(token)

        console.log('[SDS Auth] Validating DPoP proof')

        // Build full URL for DPoP validation
        const originalUrl = ctx.req.originalUrl || ctx.req.url || '/'
        const fullUrl = new URL(originalUrl, this.publicUrl)

        // Validate DPoP proof cryptographically
        const dpopProof = await this.validateDpopProof(
          ctx.req.method || 'GET',
          fullUrl,
          ctx.req.headers,
          token,
        )

        console.log(`[SDS Auth] ✅ DPoP proof validated: jkt=${dpopProof.jkt}`)

        return {
          credentials: {
            type: 'oauth' as const,
            did,
            dpopProof,
          },
        }
      } catch (error) {
        console.log('[SDS Auth] Authentication error:', error)
        throw error instanceof AuthRequiredError
          ? error
          : new AuthRequiredError('Authentication failed')
      }
    }
  }

  /**
   * Set auth headers on response
   */
  private setAuthHeaders(res: any): void {
    res.setHeader('Cache-Control', 'private')
    appendVary(res, 'Authorization')
  }

  /**
   * Check if a user has access to perform an action on a repository
   * This is the core SDS enhancement - checking shared repository permissions
   */
  async checkRepositoryAccess(
    repoDid: string,
    userDid: string,
    action: keyof RepositoryPermissions,
    _context?: PermissionCheckContext,
  ): Promise<boolean> {
    try {
      return await this.permissionManager.checkAccess(repoDid, userDid, action)
    } catch (error) {
      // Log the error but don't throw - return false to deny access
      console.error('[SDS Auth] Error checking repository access:', error)
      return false
    }
  }

  /**
   * Enhanced findAccount that supports shared repository access
   * This method extends the base PDS behavior to allow access to shared repositories
   */
  async findAccountWithSharedAccess(
    repo: string,
    userDid: string,
    action: keyof RepositoryPermissions,
    options: {
      checkTakedown?: boolean
      checkDeactivated?: boolean
    } = {},
  ) {
    // First, try to find the account normally (this handles DIDs and handles)
    const account = await this.findAccount(repo, options)
    const repoDid = account.did

    // Check if this is the owner (original PDS behavior)
    if (repoDid === userDid) {
      return { account, hasAccess: true, accessType: 'owner' as const }
    }

    // Check if the user has shared access to this repository
    const hasSharedAccess = await this.checkRepositoryAccess(
      repoDid,
      userDid,
      action,
    )

    if (!hasSharedAccess) {
      throw new AuthRequiredError(
        `Access denied: User ${userDid} does not have ${action} access to repository ${repoDid}`,
      )
    }

    return { account, hasAccess: true, accessType: 'shared' as const }
  }

  /**
   * Utility method to determine required action based on request context
   * This helps endpoints determine what permission to check based on the operation
   */
  getRequiredAction(
    method: string,
    path?: string,
    collection?: string,
  ): keyof RepositoryPermissions {
    // Admin operations (check first, before general write operations)
    if (
      path?.includes('admin') ||
      path?.includes('moderation') ||
      collection?.includes('admin')
    ) {
      return 'admin'
    }

    // Write operations
    if (method === 'POST' || method === 'PUT' || method === 'DELETE') {
      return 'write'
    }

    // Specific endpoint patterns for write operations
    if (
      path?.includes('createRecord') ||
      path?.includes('putRecord') ||
      path?.includes('deleteRecord') ||
      path?.includes('uploadBlob') ||
      path?.includes('applyWrites')
    ) {
      return 'write'
    }

    // Default to read for GET operations and other cases
    return 'read'
  }
}
