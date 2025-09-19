// SDS Context - Extends PDS context with SDS-specific components
import { AppContext, AppContextOptions } from './context'
import { SdsPermissionManager } from './permission-manager'
import { SdsAuthVerifier } from './sds-auth-verifier'

export interface SdsAppContextOptions extends AppContextOptions {
  authVerifier: SdsAuthVerifier // Override with SDS version
  permissionManager: SdsPermissionManager
}

export class SdsAppContext extends AppContext {
  public authVerifier: SdsAuthVerifier // Override with SDS version
  public permissionManager: SdsPermissionManager

  constructor(opts: SdsAppContextOptions) {
    super(opts)
    this.authVerifier = opts.authVerifier
    this.permissionManager = opts.permissionManager
  }
}

/**
 * Create SDS-specific application context
 * This extends the base PDS context creation with SDS components
 */
export const createSdsContext = async (
  baseContextOptions: AppContextOptions,
): Promise<SdsAppContext> => {
  // Create the permission manager
  const permissionManager = new SdsPermissionManager(
    baseContextOptions.accountManager.db,
  )

  // Create SDS auth verifier (extends base auth verifier with permission checks)
  const sdsAuthVerifier = new SdsAuthVerifier(
    baseContextOptions.accountManager,
    baseContextOptions.idResolver,
    baseContextOptions.authVerifier.oauthVerifier,
    {
      publicUrl: baseContextOptions.cfg.service.publicUrl,
      jwtKey: baseContextOptions.authVerifier['_jwtKey'], // Access private field
      adminPass: baseContextOptions.authVerifier['_adminPass'], // Access private field
      dids: baseContextOptions.authVerifier.dids,
    },
    permissionManager,
  )

  // Create SDS context with enhanced components
  return new SdsAppContext({
    ...baseContextOptions,
    authVerifier: sdsAuthVerifier,
    permissionManager,
  })
}
