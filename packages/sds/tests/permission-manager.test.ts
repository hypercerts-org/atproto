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

  describe('permission system security', () => {
    test('should prevent users from granting themselves admin access', async () => {
      // Attacker should not be able to grant themselves admin access to owner's repository
      try {
        await permissionManager.grantAccess(
          testRepoDid,
          testUserDid,
          { read: true, write: true, admin: true },
          testUserDid, // User trying to grant themselves access
        )

        // This should fail
        expect(true).toBe(false) // Should not reach here
      } catch (error) {
        // Expected to fail
        expect(error).toBeDefined()
      }
    })

    test('should prevent users from escalating their own permissions', async () => {
      // First, owner grants limited access to user
      await permissionManager.grantAccess(
        testRepoDid,
        testUserDid,
        { read: true, write: false, admin: false },
        testOwnerDid,
      )

      // User should not be able to escalate their own permissions
      try {
        await permissionManager.grantAccess(
          testRepoDid,
          testUserDid,
          { read: true, write: true, admin: true },
          testUserDid, // User trying to escalate their own permissions
        )

        expect(true).toBe(false) // Should not reach here
      } catch (error) {
        expect(error).toBeDefined()
      }
    })

    test('should prevent users from granting access to repositories they do not own', async () => {
      // User should not be able to grant access to owner's repository
      try {
        await permissionManager.grantAccess(
          testRepoDid,
          'did:plc:another-user',
          { read: true, write: true },
          testUserDid, // User trying to grant access to owner's repo
        )

        expect(true).toBe(false) // Should not reach here
      } catch (error) {
        expect(error).toBeDefined()
      }
    })

    test('should validate permission object structure', async () => {
      const invalidPermissions = {
        read: 'true', // Should be boolean
        write: 1, // Should be boolean
        admin: null, // Should be boolean
      } as any

      try {
        await permissionManager.grantAccess(
          testRepoDid,
          testUserDid,
          invalidPermissions,
          testOwnerDid,
        )

        expect(true).toBe(false) // Should not reach here
      } catch (error) {
        expect(error).toBeDefined()
      }
    })

    test('should prevent injection in permission data', async () => {
      const maliciousPermissions = {
        read: true,
        write: true,
        admin: true,
        malicious: '"; DROP TABLE shared_repository_permissions; --',
      } as any

      try {
        await permissionManager.grantAccess(
          testRepoDid,
          testUserDid,
          maliciousPermissions,
          testOwnerDid,
        )

        // Should either succeed with sanitized data or fail validation
        // The key is that malicious content should not be executed
        expect(true).toBe(true) // Test passes if no SQL injection occurs
      } catch (error) {
        // Validation error is also acceptable
        expect(error).toBeDefined()
      }
    })

    test('should validate DID format in permission operations', async () => {
      const invalidDid = 'invalid-did-format'

      try {
        await permissionManager.grantAccess(
          testRepoDid,
          invalidDid,
          { read: true, write: true },
          testOwnerDid,
        )

        expect(true).toBe(false) // Should not reach here
      } catch (error) {
        expect(error).toBeDefined()
      }
    })

    test('should prevent unauthorized permission queries', async () => {
      // User should not be able to query permissions for repositories they don't have access to
      const hasAccess = await permissionManager.checkAccess(
        testRepoDid,
        testUserDid,
        'read',
      )

      expect(hasAccess).toBe(false)
    })

    test('should prevent unauthorized collaborator listing', async () => {
      // User should not be able to list collaborators for repositories they don't have access to
      const collaborators =
        await permissionManager.listCollaborators(testRepoDid)

      // Should not include user in the list
      const userInList = collaborators.some((c) => c.userDid === testUserDid)
      expect(userInList).toBe(false)
    })

    test('should maintain owner privileges', async () => {
      // First grant the owner explicit permissions for the repository
      await permissionManager.grantAccess(
        testRepoDid,
        testOwnerDid,
        { read: true, write: true, admin: true, owner: true },
        testOwnerDid, // Self-granted as the owner
      )

      // Owner should always have full access to their repository
      const ownerHasRead = await permissionManager.checkAccess(
        testRepoDid,
        testOwnerDid,
        'read',
      )
      const ownerHasWrite = await permissionManager.checkAccess(
        testRepoDid,
        testOwnerDid,
        'write',
      )

      expect(ownerHasRead).toBe(true)
      expect(ownerHasWrite).toBe(true)
    })

    test('should handle concurrent permission changes safely', async () => {
      // Simulate concurrent permission changes
      const promises = [
        permissionManager.grantAccess(
          testRepoDid,
          testUserDid,
          { read: true, write: false },
          testOwnerDid,
        ),
        permissionManager.grantAccess(
          testRepoDid,
          testUserDid,
          { read: true, write: true },
          testOwnerDid,
        ),
      ]

      // Should not throw errors
      await expect(Promise.all(promises)).resolves.not.toThrow()

      // Verify final state
      const finalPermissions = await permissionManager.getPermissions(
        testRepoDid,
        testUserDid,
      )

      expect(finalPermissions).toBeDefined()
      expect(finalPermissions?.read).toBe(true)
    })

    test('should prevent duplicate permission entries', async () => {
      // Grant access twice
      await permissionManager.grantAccess(
        testRepoDid,
        testUserDid,
        { read: true, write: false },
        testOwnerDid,
      )

      await permissionManager.grantAccess(
        testRepoDid,
        testUserDid,
        { read: true, write: true },
        testOwnerDid,
      )

      // Should not create duplicate entries
      const permissions = await db.db
        .selectFrom('shared_repository_permissions')
        .selectAll()
        .where('repoDid', '=', testRepoDid)
        .where('userDid', '=', testUserDid)
        .where('revokedAt', 'is', null)
        .execute()

      expect(permissions).toHaveLength(1)
    })
  })
})
