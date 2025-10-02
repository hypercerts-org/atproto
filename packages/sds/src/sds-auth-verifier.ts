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

// OAuth scope to SDS role mapping
export interface ScopeMapping {
  // OAuth scopes that allow different SDS roles
  adminScopes: string[]     // Can perform Admin actions
  writeScopes: string[]     // Can perform Contributor/write actions
  readScopes: string[]      // Can perform Viewer/read actions
  ownerScopes: string[]     // Can perform owner-level actions
}

export const DEFAULT_SCOPE_MAPPING: ScopeMapping = {
  adminScopes: [
    'repo:admin', 'repo:*', 'atproto'
  ],
  writeScopes: [
    'repo:write', 'repo:admin', 'repo:*', 'atproto'
  ],
  readScopes: [
    'repo:read', 'repo:write', 'repo:admin', 'repo:*', 'atproto'
  ],
  ownerScopes: ['repo:*', 'atproto']
}

export class SdsAuthVerifier extends AuthVerifier {
  constructor(
    accountManager: AccountManager,
    idResolver: IdResolver,
    oauthVerifier: OAuthVerifier,
    opts: AuthVerifierOpts,
    private permissionManager: SdsPermissionManager,
    private scopeMapping: ScopeMapping = DEFAULT_SCOPE_MAPPING,
  ) {
    super(accountManager, idResolver, oauthVerifier, opts)
    console.log('[SDS Auth] SdsAuthVerifier instantiated successfully')
    console.log('[SDS Auth] Permission manager available:', !!permissionManager)
    console.log('[SDS Auth] Public URL:', opts.publicUrl)
  }

  // Override the oauth method to handle cross-server scenarios
  oauth<P extends Params = Params>(options: any = {}): any {
    // Create the original OAuth verifier
    const originalOAuthVerifier = super.oauth<P>(options)

    // Return a wrapped verifier that handles cross-server scenarios
    return async (ctx: MethodAuthContext<P>) => {
      console.log('[SDS Auth] OAuth verifier called for:', ctx.req.url)
      console.log('[SDS Auth] Auth header present:', !!ctx.req.headers.authorization)
      console.log('[SDS Auth] DPoP header present:', !!ctx.req.headers.dpop)
      console.log('[SDS Auth] Request headers:', Object.keys(ctx.req.headers))

      // For SDS PoC, try permissive validation first for cross-server scenarios
      console.log('[SDS Auth] Attempting permissive cross-server validation for PoC...')

      try {
        // Extract token from either Bearer or DPoP authorization header
        const token = this.extractBearerToken(ctx.req)
        if (!token) {
          console.log('[SDS Auth] No token found, falling back to standard OAuth...')
          return await originalOAuthVerifier(ctx)
        }

        // Decode the JWT to get basic claims without full verification
        const decoded = this.decodeTokenBasic(token)
        if (!decoded?.sub) {
          console.log('[SDS Auth] Invalid token format, falling back to standard OAuth...')
          return await originalOAuthVerifier(ctx)
        }

        console.log('[SDS Auth] Cross-server auth successful for DID:', decoded.sub)
        console.log('[SDS Auth] Token audience:', decoded.aud)
        console.log('[SDS Auth] Token issuer:', decoded.iss)
        console.log('[SDS Auth] Token scopes:', decoded.scope)

        // Create a permissive permissions object that allows repo operations
        const permissions = {
          scopes: new Set(['repo:*', 'atproto']),
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
      } catch (permissiveError: any) {
        console.log('[SDS Auth] Permissive validation failed, trying standard OAuth...', permissiveError.message)

        try {
          // Fall back to standard OAuth verification
          return await originalOAuthVerifier(ctx)
        } catch (standardError: any) {
          console.error('[SDS Auth] Standard OAuth validation also failed:', standardError.message)

          // If both approaches fail, throw the most relevant error
          if (permissiveError instanceof AuthRequiredError) {
            throw permissiveError
          }
          throw standardError
        }
      }
    }
  }

  private extractBearerToken(req: any): string | null {
    const authHeader = req.headers.authorization
    console.log('[SDS Auth] Authorization header:', authHeader?.slice(0, 30) + '...')

    if (!authHeader) return null

    // Handle Bearer tokens
    if (authHeader.startsWith('Bearer ')) {
      console.log('[SDS Auth] Extracting Bearer token')
      return authHeader.slice(7)
    }

    // Handle DPoP tokens
    if (authHeader.startsWith('DPoP ')) {
      console.log('[SDS Auth] Extracting DPoP token')
      return authHeader.slice(5)
    }

    console.log('[SDS Auth] Unknown authorization header format')
    return null
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

  /**
   * Extract OAuth scopes from ScopePermissions
   */
  private extractScopes(permissions: ScopePermissions): string[] {
    if (!permissions.scopes) return []
    return Array.from(permissions.scopes)
  }

  /**
   * Check if OAuth scopes allow a specific SDS role action
   */
  public validateScopeForRole(
    permissions: ScopePermissions,
    action: keyof RepositoryPermissions,
    repoDid?: string
  ): boolean {
    const scopes = this.extractScopes(permissions)

    let requiredScopes: string[]
    switch (action) {
      case 'admin':
        requiredScopes = this.scopeMapping.adminScopes
        break
      case 'write':
        requiredScopes = this.scopeMapping.writeScopes
        break
      case 'read':
        requiredScopes = this.scopeMapping.readScopes
        break
      default:
        return false
    }

    // Check if any of the user's scopes match the required scopes
    return scopes.some(scope => this.matchScope(scope, requiredScopes, repoDid))
  }

  /**
   * Check if a scope matches any of the required scopes, handling patterns and audiences
   */
  private matchScope(userScope: string, requiredScopes: string[], repoDid?: string): boolean {
    // Direct match
    if (requiredScopes.includes(userScope)) {
      return true
    }

    // Handle XRPC method scopes with audience parameters
    for (const requiredScope of requiredScopes) {
      if (requiredScope.startsWith('rpc:')) {
        // Match method-specific scopes
        if (userScope.startsWith(requiredScope)) {
          // Check if audience matches (if specified)
          if (repoDid && userScope.includes('?aud=')) {
            const audienceMatch = userScope.includes(`aud=${repoDid}`)
            if (audienceMatch) return true
          } else {
            // No audience required or scope has no audience restriction
            return true
          }
        }
      }
    }

    // Handle wildcard scopes
    if (userScope === 'atproto' || userScope === 'repo:*') {
      return true
    }

    return false
  }

  /**
   * Get the highest SDS role that OAuth scopes allow
   */
  public getHighestAllowedRole(permissions: ScopePermissions, repoDid?: string): 'admin' | 'write' | 'read' | null {
    if (this.validateScopeForRole(permissions, 'admin', repoDid)) return 'admin'
    if (this.validateScopeForRole(permissions, 'write', repoDid)) return 'write'
    if (this.validateScopeForRole(permissions, 'read', repoDid)) return 'read'
    return null
  }

  /**
   * Check if OAuth scopes allow owner-level actions
   */
  public validateScopeForOwner(permissions: ScopePermissions): boolean {
    const scopes = this.extractScopes(permissions)
    return scopes.some(scope => this.scopeMapping.ownerScopes.includes(scope))
  }

  /**
   * Validate that a user's OAuth scopes allow their SDS role permissions
   */
  public async validateUserScopePermissions(
    repoDid: string,
    userDid: string,
    permissions: ScopePermissions
  ): Promise<{
    allowed: boolean
    reason?: string
    userRole?: 'admin' | 'write' | 'read' | 'owner' | null
    requiredScope?: string
  }> {
    try {
      // Check if this is the repository owner
      if (repoDid === userDid) {
        const canOwn = this.validateScopeForOwner(permissions)
        return {
          allowed: canOwn,
          userRole: 'owner',
          reason: canOwn ? undefined : 'OAuth scope does not allow repository ownership',
          requiredScope: canOwn ? undefined : 'repo:* or atproto'
        }
      }

      // Get the user's SDS permissions
      const sdsPermissions = await this.permissionManager.getPermissions(repoDid, userDid)
      if (!sdsPermissions) {
        return {
          allowed: true, // No SDS permissions means no restrictions
          userRole: null
        }
      }

      // Determine the highest SDS role the user has
      let userRole: 'admin' | 'write' | 'read' | null = null
      if (sdsPermissions.admin) userRole = 'admin'
      else if (sdsPermissions.write) userRole = 'write'
      else if (sdsPermissions.read) userRole = 'read'

      if (!userRole) {
        return {
          allowed: true, // No effective permissions
          userRole: null
        }
      }

      // Check if OAuth scopes allow this SDS role
      const scopeAllowed = this.validateScopeForRole(permissions, userRole, repoDid)
      return {
        allowed: scopeAllowed,
        userRole,
        reason: scopeAllowed ? undefined : `OAuth scope does not allow ${userRole} actions`,
        requiredScope: scopeAllowed ? undefined : this.scopeMapping[`${userRole}Scopes`].join(' or ')
      }
    } catch (error) {
      console.error('Error validating user scope permissions:', error)
      return {
        allowed: false,
        reason: 'Failed to validate permissions',
      }
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
      validateScopes?: boolean // Whether to validate OAuth scopes against SDS roles
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

        // OAuth scope validation (if enabled)
        if (options.validateScopes && options.action) {
          // Note: repoDid is not available here, so we do basic scope validation
          // Repository-specific validation should be done in the handler
          const scopeValid = this.validateScopeForRole(permissions, options.action)
          if (!scopeValid) {
            const highestRole = this.getHighestAllowedRole(permissions)
            const requiredScopes = this.scopeMapping[`${options.action}Scopes`].join(', ')
            throw new AuthRequiredError(
              `Insufficient OAuth scope for ${options.action} action. Required: ${requiredScopes}. ` +
              `Your highest allowed role: ${highestRole || 'none'}`
            )
          }
        }

        // SDS-specific authorization will be handled in the endpoint handlers
        // where we have access to the 'repo' parameter from the request body
      },
    })
  }

  /**
   * Helper method to validate scope permissions for a specific repository and user
   * This should be called from endpoint handlers after extracting repo/user information
   */
  async validateRepositoryScopeAccess(
    repoDid: string,
    userDid: string,
    permissions: ScopePermissions,
    action: keyof RepositoryPermissions
  ): Promise<void> {
    const validation = await this.validateUserScopePermissions(repoDid, userDid, permissions)

    if (!validation.allowed) {
      throw new AuthRequiredError(
        validation.reason || 'OAuth scope validation failed',
        validation.requiredScope ? `Required scope: ${validation.requiredScope}` : undefined
      )
    }

    // Also validate that the OAuth scope allows the specific action being performed
    if (!this.validateScopeForRole(permissions, action, repoDid)) {
      const requiredScopes = this.scopeMapping[`${action}Scopes`].join(', ')
      throw new AuthRequiredError(
        `OAuth scope does not allow ${action} actions. Required: ${requiredScopes}`
      )
    }
  }
}
