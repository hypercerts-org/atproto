// SDS Permission Manager - Handles multi-user repository access control
import type { DatabaseSchema } from '../account-manager/db'
import { Database } from '../db'
import {
  CollaboratorInfo,
  PermissionChange,
  RepositoryPermissions,
  SdsPermissionError,
} from '../types'

export class SdsPermissionManager {
  constructor(private db: Database<DatabaseSchema>) {}

  /**
   * Check if a user has access to perform an action on a repository
   */
  async checkAccess(
    repoDid: string,
    userDid: string,
    action: keyof RepositoryPermissions,
  ): Promise<boolean> {
    try {
      const permissions = await this.getPermissions(repoDid, userDid)
      if (!permissions) return false

      // Owners have implicit access to everything
      if (permissions.owner === true) {
        return true
      }

      // Admins have implicit access to all CRUD operations
      if (permissions.admin === true) {
        if (['read', 'create', 'update', 'delete', 'admin'].includes(action)) {
          return true
        }
      }

      // Otherwise check specific permission
      return permissions[action] ?? false
    } catch (error) {
      console.error('Error checking repository access:', error)
      return false
    }
  }

  /**
   * Check if a user is the owner of a repository
   */
  async isOwner(repoDid: string, userDid: string): Promise<boolean> {
    try {
      const permissions = await this.getPermissions(repoDid, userDid)
      return permissions?.owner ?? false
    } catch (error) {
      console.error('Error checking repository ownership:', error)
      return false
    }
  }

  /**
   * Get the role of a user for a repository
   */
  async getUserRole(
    repoDid: string,
    userDid: string,
  ): Promise<'owner' | 'admin' | 'collaborator' | 'none'> {
    try {
      const permissions = await this.getPermissions(repoDid, userDid)
      if (!permissions) return 'none'

      if (permissions.owner === true) return 'owner'
      if (permissions.admin === true) return 'admin'

      if (
        permissions.read ||
        permissions.create ||
        permissions.update ||
        permissions.delete
      ) {
        return 'collaborator'
      }

      return 'none'
    } catch (error) {
      console.error('Error getting user role:', error)
      return 'none'
    }
  }

  /**
   * Check if user can manage a target user
   * - Owner can manage anyone
   * - Admin can manage other admins and collaborators (but not owner)
   * - Collaborators cannot manage anyone
   */
  async canManageUser(
    repoDid: string,
    managerDid: string,
    targetDid: string,
  ): Promise<{ canManage: boolean; reason?: string }> {
    try {
      if (managerDid === targetDid) {
        return { canManage: false, reason: 'Cannot manage yourself' }
      }

      const managerRole = await this.getUserRole(repoDid, managerDid)
      const targetRole = await this.getUserRole(repoDid, targetDid)

      if (managerRole === 'owner') {
        return { canManage: true }
      }

      if (managerRole === 'admin') {
        if (targetRole === 'owner') {
          return {
            canManage: false,
            reason: 'Admins cannot manage the owner',
          }
        }
        return { canManage: true }
      }

      return { canManage: false, reason: 'Insufficient permissions' }
    } catch (error) {
      return { canManage: false, reason: 'Error checking permissions' }
    }
  }

  /**
   * Check if user can grant specific permissions
   * - Only owner can grant owner or admin roles
   * - Admin can grant collaborator permissions only
   */
  async canGrantPermissions(
    repoDid: string,
    granterDid: string,
    permissionsToGrant: RepositoryPermissions,
  ): Promise<{ canGrant: boolean; reason?: string }> {
    const granterRole = await this.getUserRole(repoDid, granterDid)

    if (permissionsToGrant.owner === true && granterRole !== 'owner') {
      return {
        canGrant: false,
        reason: 'Only repository owner can grant owner role',
      }
    }

    if (permissionsToGrant.admin === true && granterRole !== 'owner') {
      return {
        canGrant: false,
        reason: 'Only repository owner can grant admin role',
      }
    }

    if (granterRole === 'owner' || granterRole === 'admin') {
      return { canGrant: true }
    }

    return { canGrant: false, reason: 'Insufficient permissions' }
  }

  /**
   * Grant access to a repository for a user
   */
  async grantAccess(
    repoDid: string,
    userDid: string,
    permissions: RepositoryPermissions,
    grantedBy: string,
  ): Promise<void> {
    const permissionsJson = JSON.stringify(permissions)
    const now = new Date().toISOString()

    try {
      // Check if user already has permissions
      const existing = await this.getPermissions(repoDid, userDid)

      // Insert or update permissions
      await this.db.db
        .insertInto('shared_repository_permissions')
        .values({
          repoDid: repoDid,
          userDid: userDid,
          permissions: permissionsJson,
          grantedBy: grantedBy,
          grantedAt: now,
          revokedAt: null,
        })
        .onConflict((oc) =>
          oc.columns(['repoDid', 'userDid']).doUpdateSet({
            permissions: permissionsJson,
            grantedBy: grantedBy,
            grantedAt: now,
            revokedAt: null,
          }),
        )
        .execute()

      // Log the change
      await this.logPermissionChange(
        repoDid,
        userDid,
        existing ? 'modify' : 'grant',
        existing,
        permissions,
        grantedBy,
      )
    } catch (error) {
      console.error('Error granting repository access:', error)
      throw new SdsPermissionError(
        `Failed to grant access to repository ${repoDid} for user ${userDid}`,
        repoDid,
        userDid,
        'grant',
      )
    }
  }

  /**
   * Revoke access to a repository for a user
   */
  async revokeAccess(
    repoDid: string,
    userDid: string,
    revokedBy: string,
  ): Promise<void> {
    try {
      const currentPerms = await this.getPermissions(repoDid, userDid)

      if (!currentPerms) {
        throw new SdsPermissionError(
          `User ${userDid} does not have access to repository ${repoDid}`,
          repoDid,
          userDid,
          'revoke',
        )
      }

      const now = new Date().toISOString()

      await this.db.db
        .updateTable('shared_repository_permissions')
        .set({ revokedAt: now })
        .where('repoDid', '=', repoDid)
        .where('userDid', '=', userDid)
        .execute()

      await this.logPermissionChange(
        repoDid,
        userDid,
        'revoke',
        currentPerms,
        null,
        revokedBy,
      )
    } catch (error) {
      if (error instanceof SdsPermissionError) throw error

      throw new SdsPermissionError(
        `Failed to revoke access to repository ${repoDid} for user ${userDid}`,
        repoDid,
        userDid,
        'revoke',
      )
    }
  }

  /**
   * Get current permissions for a user on a repository
   */
  async getPermissions(
    repoDid: string,
    userDid: string,
  ): Promise<RepositoryPermissions | null> {
    try {
      const result = await this.db.db
        .selectFrom('shared_repository_permissions')
        .select(['permissions'])
        .where('repoDid', '=', repoDid)
        .where('userDid', '=', userDid)
        .where('revokedAt', 'is', null)
        .executeTakeFirst()

      if (!result) return null

      return JSON.parse(result.permissions) as RepositoryPermissions
    } catch (error) {
      console.error('Error getting permissions:', error)
      return null
    }
  }

  /**
   * List all collaborators for a repository
   */
  async listCollaborators(repoDid: string): Promise<CollaboratorInfo[]> {
    try {
      const results = await this.db.db
        .selectFrom('shared_repository_permissions')
        .selectAll()
        .where('repoDid', '=', repoDid)
        .where('revokedAt', 'is', null)
        .execute()

      return results.map((result) => ({
        userDid: result.userDid,
        permissions: JSON.parse(result.permissions) as RepositoryPermissions,
        grantedBy: result.grantedBy,
        grantedAt: result.grantedAt,
        revokedAt: result.revokedAt || undefined,
      }))
    } catch (error) {
      console.error('Error listing collaborators:', error)
      return []
    }
  }

  /**
   * List all repositories a user has access to
   */
  async listUserRepositories(userDid: string): Promise<string[]> {
    try {
      const results = await this.db.db
        .selectFrom('shared_repository_permissions')
        .select(['repoDid'])
        .where('userDid', '=', userDid)
        .where('revokedAt', 'is', null)
        .execute()

      return results.map((result) => result.repoDid)
    } catch (error) {
      console.error('Error listing user repositories:', error)
      return []
    }
  }

  /**
   * Get permission change audit log for a repository
   */
  async getPermissionAuditLog(
    repoDid: string,
    limit = 100,
  ): Promise<PermissionChange[]> {
    try {
      const results = await this.db.db
        .selectFrom('permission_audit_log')
        .selectAll()
        .where('repoDid', '=', repoDid)
        .orderBy('changedAt', 'desc')
        .limit(limit)
        .execute()

      return results.map((result) => ({
        repoDid: result.repoDid,
        userDid: result.userDid,
        action: result.action as 'grant' | 'revoke' | 'modify',
        permissionsBefore: result.permissionsBefore
          ? JSON.parse(result.permissionsBefore)
          : undefined,
        permissionsAfter: result.permissionsAfter
          ? JSON.parse(result.permissionsAfter)
          : undefined,
        changedBy: result.changedBy,
        changedAt: result.changedAt,
      }))
    } catch (error) {
      console.error('Error getting audit log:', error)
      return []
    }
  }

  /**
   * Check if a repository has any collaborators
   */
  async hasCollaborators(repoDid: string): Promise<boolean> {
    try {
      const result = await this.db.db
        .selectFrom('shared_repository_permissions')
        .select(['userDid'])
        .where('repoDid', '=', repoDid)
        .where('revokedAt', 'is', null)
        .limit(1)
        .executeTakeFirst()

      return !!result
    } catch (error) {
      console.error('Error checking collaborators:', error)
      return false
    }
  }

  /**
   * Remove all permissions for a repository (cleanup)
   */
  async removeAllPermissions(
    repoDid: string,
    removedBy: string,
  ): Promise<void> {
    try {
      const collaborators = await this.listCollaborators(repoDid)

      const now = new Date().toISOString()

      // Mark all permissions as revoked
      await this.db.db
        .updateTable('shared_repository_permissions')
        .set({ revokedAt: now })
        .where('repoDid', '=', repoDid)
        .where('revokedAt', 'is', null)
        .execute()

      // Log all the changes
      for (const collaborator of collaborators) {
        await this.logPermissionChange(
          repoDid,
          collaborator.userDid,
          'revoke',
          collaborator.permissions,
          null,
          removedBy,
        )
      }
    } catch (error) {
      console.error('Error removing all permissions:', error)
      throw new SdsPermissionError(
        `Failed to remove all permissions for repository ${repoDid}`,
        repoDid,
        'all',
        'revoke',
      )
    }
  }

  /**
   * Log a permission change to the audit log
   */
  private async logPermissionChange(
    repoDid: string,
    userDid: string,
    action: string,
    permissionsBefore: RepositoryPermissions | null,
    permissionsAfter: RepositoryPermissions | null,
    changedBy: string,
  ): Promise<void> {
    try {
      await this.db.db
        .insertInto('permission_audit_log')
        .values({
          repoDid: repoDid,
          userDid: userDid,
          action,
          permissionsBefore: permissionsBefore
            ? JSON.stringify(permissionsBefore)
            : null,
          permissionsAfter: permissionsAfter
            ? JSON.stringify(permissionsAfter)
            : null,
          changedBy: changedBy,
          changedAt: new Date().toISOString(),
        })
        .execute()
    } catch (error) {
      console.error('Error logging permission change:', error)
      // Don't throw here - audit logging failure shouldn't break the main operation
    }
  }
}
