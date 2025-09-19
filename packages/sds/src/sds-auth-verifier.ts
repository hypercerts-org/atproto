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
    context?: PermissionCheckContext,
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
    options?: {
      checkTakedown?: boolean
      checkDeactivated?: boolean
    },
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
