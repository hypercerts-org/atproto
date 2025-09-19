import { DatabaseSchema, getDb, getMigrator } from '../src/account-manager/db'
import { Database } from '../src/db'
import { SdsPermissionManager } from '../src/permission-manager'
import { RepositoryPermissions, SdsPermissionError } from '../src/types'

describe('SdsPermissionManager', () => {
  let db: Database<DatabaseSchema>
  let permissionManager: SdsPermissionManager

  const testRepoDid = 'did:plc:test-repo-123'
  const testUserDid = 'did:plc:test-user-456'
  const testOwnerDid = 'did:plc:test-owner-789'

  beforeAll(async () => {
    // Create in-memory SQLite database for testing
    db = getDb(':memory:')

    // Run migrations to set up the database schema
    const migrator = getMigrator(db)
    await migrator.migrateToLatestOrThrow()

    // Initialize permission manager
    permissionManager = new SdsPermissionManager(db)
  })

  afterAll(async () => {
    await db.close()
  })

  beforeEach(async () => {
    // Clean up test data before each test
    await db.db.deleteFrom('shared_repository_permissions').execute()
    await db.db.deleteFrom('permission_audit_log').execute()
  })

  describe('checkAccess', () => {
    test('should allow owner full access to their own repository', async () => {
      const hasReadAccess = await permissionManager.checkAccess(
        testOwnerDid,
        testOwnerDid,
        'read',
      )
      const hasWriteAccess = await permissionManager.checkAccess(
        testOwnerDid,
        testOwnerDid,
        'write',
      )

      expect(hasReadAccess).toBe(true)
      expect(hasWriteAccess).toBe(true)
    })

    test('should deny access to users without permissions', async () => {
      const hasReadAccess = await permissionManager.checkAccess(
        testRepoDid,
        testUserDid,
        'read',
      )
      const hasWriteAccess = await permissionManager.checkAccess(
        testRepoDid,
        testUserDid,
        'write',
      )

      expect(hasReadAccess).toBe(false)
      expect(hasWriteAccess).toBe(false)
    })

    test('should grant access based on permissions', async () => {
      const permissions: RepositoryPermissions = { read: true, write: false }

      await permissionManager.grantAccess(
        testRepoDid,
        testUserDid,
        permissions,
        testOwnerDid,
      )

      const hasReadAccess = await permissionManager.checkAccess(
        testRepoDid,
        testUserDid,
        'read',
      )
      const hasWriteAccess = await permissionManager.checkAccess(
        testRepoDid,
        testUserDid,
        'write',
      )

      expect(hasReadAccess).toBe(true)
      expect(hasWriteAccess).toBe(false)
    })
  })

  describe('grantAccess', () => {
    test('should grant permissions to a user', async () => {
      const permissions: RepositoryPermissions = { read: true, write: true }

      await permissionManager.grantAccess(
        testRepoDid,
        testUserDid,
        permissions,
        testOwnerDid,
      )

      const userPermissions = await permissionManager.getPermissions(
        testRepoDid,
        testUserDid,
      )

      expect(userPermissions).toEqual(permissions)
    })

    test('should update existing permissions', async () => {
      // Grant initial permissions
      const initialPermissions: RepositoryPermissions = {
        read: true,
        write: false,
      }
      await permissionManager.grantAccess(
        testRepoDid,
        testUserDid,
        initialPermissions,
        testOwnerDid,
      )

      // Update permissions
      const updatedPermissions: RepositoryPermissions = {
        read: true,
        write: true,
      }
      await permissionManager.grantAccess(
        testRepoDid,
        testUserDid,
        updatedPermissions,
        testOwnerDid,
      )

      const userPermissions = await permissionManager.getPermissions(
        testRepoDid,
        testUserDid,
      )

      expect(userPermissions).toEqual(updatedPermissions)
    })

    test('should create audit log entry', async () => {
      const permissions: RepositoryPermissions = { read: true, write: true }

      await permissionManager.grantAccess(
        testRepoDid,
        testUserDid,
        permissions,
        testOwnerDid,
      )

      const auditLog =
        await permissionManager.getPermissionAuditLog(testRepoDid)

      expect(auditLog).toHaveLength(1)
      expect(auditLog[0]).toMatchObject({
        repoDid: testRepoDid,
        userDid: testUserDid,
        action: 'grant',
        changedBy: testOwnerDid,
      })
    })
  })

  describe('revokeAccess', () => {
    test('should revoke user permissions', async () => {
      // First grant permissions
      const permissions: RepositoryPermissions = { read: true, write: true }
      await permissionManager.grantAccess(
        testRepoDid,
        testUserDid,
        permissions,
        testOwnerDid,
      )

      // Then revoke them
      await permissionManager.revokeAccess(
        testRepoDid,
        testUserDid,
        testOwnerDid,
      )

      const hasAccess = await permissionManager.checkAccess(
        testRepoDid,
        testUserDid,
        'read',
      )

      expect(hasAccess).toBe(false)
    })

    test('should throw error when revoking non-existent permissions', async () => {
      await expect(
        permissionManager.revokeAccess(testRepoDid, testUserDid, testOwnerDid),
      ).rejects.toThrow(SdsPermissionError)
    })

    test('should create audit log entry for revocation', async () => {
      // Grant then revoke permissions
      const permissions: RepositoryPermissions = { read: true, write: true }
      await permissionManager.grantAccess(
        testRepoDid,
        testUserDid,
        permissions,
        testOwnerDid,
      )
      // Add a small delay to ensure different timestamps
      await new Promise((resolve) => setTimeout(resolve, 1))
      await permissionManager.revokeAccess(
        testRepoDid,
        testUserDid,
        testOwnerDid,
      )

      const auditLog =
        await permissionManager.getPermissionAuditLog(testRepoDid)

      expect(auditLog).toHaveLength(2)
      expect(auditLog[0].action).toBe('revoke') // Most recent first
      expect(auditLog[1].action).toBe('grant')
    })
  })

  describe('listCollaborators', () => {
    test('should list all collaborators for a repository', async () => {
      const user1Permissions: RepositoryPermissions = {
        read: true,
        write: true,
      }
      const user2Permissions: RepositoryPermissions = {
        read: true,
        write: false,
      }

      await permissionManager.grantAccess(
        testRepoDid,
        testUserDid,
        user1Permissions,
        testOwnerDid,
      )
      await permissionManager.grantAccess(
        testRepoDid,
        'did:plc:test-user-2',
        user2Permissions,
        testOwnerDid,
      )

      const collaborators =
        await permissionManager.listCollaborators(testRepoDid)

      expect(collaborators).toHaveLength(2)
      expect(
        collaborators.find((c) => c.userDid === testUserDid)?.permissions,
      ).toEqual(user1Permissions)
      expect(
        collaborators.find((c) => c.userDid === 'did:plc:test-user-2')
          ?.permissions,
      ).toEqual(user2Permissions)
    })

    test('should return empty array for repository with no collaborators', async () => {
      const collaborators =
        await permissionManager.listCollaborators(testRepoDid)
      expect(collaborators).toEqual([])
    })
  })

  describe('listUserRepositories', () => {
    test('should list all repositories a user has access to', async () => {
      const permissions: RepositoryPermissions = { read: true, write: true }
      const repo1 = 'did:plc:test-repo-1'
      const repo2 = 'did:plc:test-repo-2'

      await permissionManager.grantAccess(
        repo1,
        testUserDid,
        permissions,
        testOwnerDid,
      )
      await permissionManager.grantAccess(
        repo2,
        testUserDid,
        permissions,
        testOwnerDid,
      )

      const repositories =
        await permissionManager.listUserRepositories(testUserDid)

      expect(repositories).toHaveLength(2)
      expect(repositories).toContain(repo1)
      expect(repositories).toContain(repo2)
    })
  })

  describe('hasCollaborators', () => {
    test('should return true when repository has collaborators', async () => {
      const permissions: RepositoryPermissions = { read: true, write: true }
      await permissionManager.grantAccess(
        testRepoDid,
        testUserDid,
        permissions,
        testOwnerDid,
      )

      const hasCollaborators =
        await permissionManager.hasCollaborators(testRepoDid)
      expect(hasCollaborators).toBe(true)
    })

    test('should return false when repository has no collaborators', async () => {
      const hasCollaborators =
        await permissionManager.hasCollaborators(testRepoDid)
      expect(hasCollaborators).toBe(false)
    })
  })

  describe('removeAllPermissions', () => {
    test('should remove all permissions for a repository', async () => {
      const permissions: RepositoryPermissions = { read: true, write: true }

      // Grant permissions to multiple users
      await permissionManager.grantAccess(
        testRepoDid,
        testUserDid,
        permissions,
        testOwnerDid,
      )
      await permissionManager.grantAccess(
        testRepoDid,
        'did:plc:user-2',
        permissions,
        testOwnerDid,
      )

      // Remove all permissions
      await permissionManager.removeAllPermissions(testRepoDid, testOwnerDid)

      // Check that no collaborators remain
      const collaborators =
        await permissionManager.listCollaborators(testRepoDid)
      expect(collaborators).toHaveLength(0)

      // Check that users no longer have access
      const hasAccess = await permissionManager.checkAccess(
        testRepoDid,
        testUserDid,
        'read',
      )
      expect(hasAccess).toBe(false)
    })
  })
})
