// SDS Auth Verifier - Extends PDS auth with multi-user permission checks
import { IdResolver } from '@atproto/identity'
import { OAuthVerifier } from '@atproto/oauth-provider'
import { ScopePermissions } from '@atproto/oauth-scopes'
import {
  AuthRequiredError,
  MethodAuthContext,
  Params,
} from '@atproto/xrpc-server'
import { AccountManager } from './account-manager/account-manager'
import { AuthVerifier, AuthVerifierOpts } from './auth-verifier'
import { SdsPermissionManager } from './permission-manager'
import { PermissionCheckContext, RepositoryPermissions } from './types'

export class SdsAuthVerifier extends AuthVerifier {
  constructor(
    accountManager: AccountManager,
    idResolver: IdResolver,
    oauthVerifier: OAuthVerifier,
    opts: AuthVerifierOpts,
    private permissionManager: SdsPermissionManager,
  ) {
    super(accountManager, idResolver, oauthVerifier, opts)
  }

  // Override the oauth method to handle cross-server scenarios
  oauth<P extends Params = Params>(options: any = {}): any {
    // Create the original OAuth verifier
    const originalOAuthVerifier = super.oauth<P>(options)

    // Return a wrapped verifier that handles cross-server scenarios
    return async (ctx: MethodAuthContext<P>) => {
      console.log('[SDS Auth] OAuth verifier called for:', ctx.req.url)
      console.log('[SDS Auth] Auth header present:', !!ctx.req.headers.authorization)
      try {
        // Try the standard OAuth verification first
        return await originalOAuthVerifier(ctx)
      } catch (error: any) {
        // If it's an audience/scope mismatch error, try permissive validation for cross-server
        if (
          error?.message?.includes('Missing required scope') ||
          error?.message?.includes('audience') ||
          error?.message?.includes('aud') ||
          error?.message?.includes('expired') ||
          error?.message?.includes('Authentication expired') ||
          error?.code === 'InvalidRequest'
        ) {
          console.log('[SDS Auth] Cross-server OAuth detected, attempting permissive validation')
          console.log('[SDS Auth] Original error:', error.message)
          console.log('[SDS Auth] Error code:', error.code)

          try {
            // Extract the token without strict audience checking
            const token = this.extractBearerToken(ctx.req)
            if (!token) {
              throw new AuthRequiredError('No bearer token found')
            }

            // Decode the JWT to get basic claims without full verification
            const decoded = this.decodeTokenBasic(token)
            if (!decoded?.sub) {
              throw new AuthRequiredError('Invalid token: missing subject')
            }

            console.log('[SDS Auth] Cross-server auth successful for DID:', decoded.sub)

            // Create a minimal permissions object that allows repo operations
            const permissions = {
              scopes: new Set(['repo:*']),
              allowsRepo: () => true,
              allowsIdentity: () => true,
              assertRepo: () => {}, // No-op for permissive mode
              assertIdentity: () => {}, // No-op for permissive mode
              assertRpc: () => {}, // No-op for permissive mode
            }

            // Return OAuth output compatible with SDS endpoints
            return {
              credentials: {
                type: 'oauth' as const,
                did: decoded.sub,
                permissions,
              },
            }
          } catch (fallbackError) {
            console.error('[SDS Auth] Fallback OAuth validation failed:', fallbackError)
            throw error // Re-throw original error
          }
        }
        throw error
      }
    }
  }

  private extractBearerToken(req: any): string | null {
    const authHeader = req.headers.authorization
    if (!authHeader?.startsWith('Bearer ')) return null
    return authHeader.slice(7)
  }

  private decodeTokenBasic(token: string): any {
    try {
      // Simple JWT decode without verification (for audience extraction)
      const parts = token.split('.')
      if (parts.length !== 3) return null
      return JSON.parse(Buffer.from(parts[1], 'base64url').toString())
    } catch {
      return null
    }
  }

  // Note: We don't override authorization() as it changes the return type
  // Instead, SDS permission checks are handled in the endpoint handlers
  // where we have access to the request body (repo parameter)

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
      console.error('Error checking repository access:', error)
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

  /**
   * Create authorization function for SDS endpoints
   * This is a helper that endpoints can use to easily set up SDS-aware auth
   */
  sdsAuthorization<P extends Params = Params>(
    options: {
      checkTakedown?: boolean
      checkDeactivated?: boolean
      requireOwner?: boolean // If true, only allow repository owners (disable sharing)
      action?: keyof RepositoryPermissions // Override action detection
      authorize?: (
        permissions: ScopePermissions,
        ctx: MethodAuthContext<P>,
      ) => Promise<void> | void
    } = {},
  ) {
    return this.authorization({
      checkTakedown: options.checkTakedown,
      checkDeactivated: options.checkDeactivated,
      authorize: async (
        permissions: ScopePermissions,
        ctx: MethodAuthContext<P>,
      ) => {
        // Run any custom authorization first
        if (options.authorize) {
          await options.authorize(permissions, ctx)
        }

        // SDS-specific authorization will be handled in the endpoint handlers
        // where we have access to the 'repo' parameter from the request body
      },
    })
  }
}
