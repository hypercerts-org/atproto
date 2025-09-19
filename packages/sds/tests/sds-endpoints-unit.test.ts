import { TestNetworkWithSds } from '@atproto/dev-env'
import { SdsPermissionManager } from '../src/permission-manager'
import { RepositoryPermissions } from '../src/types'

describe('SDS Endpoints Unit Tests', () => {
  let network: TestNetworkWithSds
  let permissionManager: SdsPermissionManager

  const testRepoDid = 'did:plc:test-repo-123'
  const testOwnerDid = 'did:plc:test-owner'
  const testUserDid = 'did:plc:test-user-456'

  beforeAll(async () => {
    network = await TestNetworkWithSds.create({
      dbPostgresSchema: 'sds_endpoints_unit_test',
    })
    permissionManager = new SdsPermissionManager(
      network.sds.ctx.accountManager.db,
    )
  })

  afterAll(async () => {
    await network.close()
  })

  beforeEach(async () => {
    // Clear SDS tables before each test to ensure isolation
    await network.sds.ctx.accountManager.db.db
      .deleteFrom('shared_repository_permissions')
      .execute()
    await network.sds.ctx.accountManager.db.db
      .deleteFrom('permission_audit_log')
      .execute()
  })

  describe('Permission Management Flow', () => {
    test('should complete full permission management cycle', async () => {
      // 1. Initially no permissions
      const initialPermissions = await permissionManager.getPermissions(
        testRepoDid,
        testUserDid,
      )
      expect(initialPermissions).toBeNull()

      // 2. Grant permissions
      const permissions: RepositoryPermissions = { read: true, write: false }
      await permissionManager.grantAccess(
        testRepoDid,
        testUserDid,
        permissions,
        testOwnerDid,
      )

      // 3. Check permissions were granted
      const grantedPermissions = await permissionManager.getPermissions(
        testRepoDid,
        testUserDid,
      )
      expect(grantedPermissions).toEqual(permissions)

      // 4. List collaborators
      const collaborators =
        await permissionManager.listCollaborators(testRepoDid)
      expect(collaborators).toHaveLength(1)
      expect(collaborators[0].userDid).toBe(testUserDid)
      expect(collaborators[0].permissions).toEqual(permissions)
      expect(collaborators[0].grantedBy).toBe(testOwnerDid)

      // 5. Check access
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

      // 6. Revoke access
      await permissionManager.revokeAccess(
        testRepoDid,
        testUserDid,
        testOwnerDid,
      )

      // 7. Verify access is revoked
      const revokedPermissions = await permissionManager.getPermissions(
        testRepoDid,
        testUserDid,
      )
      expect(revokedPermissions).toBeNull()

      const noReadAccess = await permissionManager.checkAccess(
        testRepoDid,
        testUserDid,
        'read',
      )
      expect(noReadAccess).toBe(false)

      // 8. Verify audit log
      const auditLog =
        await permissionManager.getPermissionAuditLog(testRepoDid)
      expect(auditLog).toHaveLength(2)
      expect(auditLog[0].action).toBe('revoke') // Most recent first
      expect(auditLog[1].action).toBe('grant')
    })

    test('should handle owner permissions correctly', async () => {
      // Owner should always have full access
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

    test('should handle multiple collaborators', async () => {
      const user1 = 'did:plc:user-1'
      const user2 = 'did:plc:user-2'
      const user3 = 'did:plc:user-3'

      // Grant different permissions to different users
      await permissionManager.grantAccess(
        testRepoDid,
        user1,
        { read: true, write: true },
        testOwnerDid,
      )
      await permissionManager.grantAccess(
        testRepoDid,
        user2,
        { read: true, write: false },
        testOwnerDid,
      )
      await permissionManager.grantAccess(
        testRepoDid,
        user3,
        { read: false, write: true },
        testOwnerDid,
      )

      const collaborators =
        await permissionManager.listCollaborators(testRepoDid)
      expect(collaborators).toHaveLength(3)

      // Check individual permissions
      expect(
        await permissionManager.checkAccess(testRepoDid, user1, 'read'),
      ).toBe(true)
      expect(
        await permissionManager.checkAccess(testRepoDid, user1, 'write'),
      ).toBe(true)

      expect(
        await permissionManager.checkAccess(testRepoDid, user2, 'read'),
      ).toBe(true)
      expect(
        await permissionManager.checkAccess(testRepoDid, user2, 'write'),
      ).toBe(false)

      expect(
        await permissionManager.checkAccess(testRepoDid, user3, 'read'),
      ).toBe(false)
      expect(
        await permissionManager.checkAccess(testRepoDid, user3, 'write'),
      ).toBe(true)
    })

    test('should handle permission updates', async () => {
      // Initial permissions
      await permissionManager.grantAccess(
        testRepoDid,
        testUserDid,
        { read: true, write: false },
        testOwnerDid,
      )

      let permissions = await permissionManager.getPermissions(
        testRepoDid,
        testUserDid,
      )
      expect(permissions).toEqual({ read: true, write: false })

      // Update permissions
      await permissionManager.grantAccess(
        testRepoDid,
        testUserDid,
        { read: true, write: true },
        testOwnerDid,
      )

      permissions = await permissionManager.getPermissions(
        testRepoDid,
        testUserDid,
      )
      expect(permissions).toEqual({ read: true, write: true })

      // Check audit log shows both grant and modify
      const auditLog =
        await permissionManager.getPermissionAuditLog(testRepoDid)
      expect(auditLog).toHaveLength(2)
      expect(auditLog[0].action).toBe('modify') // Most recent
      expect(auditLog[1].action).toBe('grant')
    })

    test('should handle repository cleanup', async () => {
      const user1 = 'did:plc:user-1'
      const user2 = 'did:plc:user-2'

      // Grant permissions to multiple users
      await permissionManager.grantAccess(
        testRepoDid,
        user1,
        { read: true, write: false },
        testOwnerDid,
      )
      await permissionManager.grantAccess(
        testRepoDid,
        user2,
        { read: true, write: true },
        testOwnerDid,
      )

      expect(await permissionManager.hasCollaborators(testRepoDid)).toBe(true)

      // Remove all permissions (repository cleanup)
      await permissionManager.removeAllPermissions(testRepoDid, testOwnerDid)

      expect(await permissionManager.hasCollaborators(testRepoDid)).toBe(false)

      const collaborators =
        await permissionManager.listCollaborators(testRepoDid)
      expect(collaborators).toHaveLength(0)

      // Check audit log
      const auditLog =
        await permissionManager.getPermissionAuditLog(testRepoDid)
      expect(auditLog).toHaveLength(4) // 2 grants + 2 removes
      expect(auditLog.filter((log) => log.action === 'revoke')).toHaveLength(2)
    })
  })

  describe('Error Handling', () => {
    test('should handle revoking non-existent permissions', async () => {
      await expect(
        permissionManager.revokeAccess(testRepoDid, testUserDid, testOwnerDid),
      ).rejects.toThrow('does not have access')
    })

    test('should handle database errors gracefully', async () => {
      // Test with invalid DID format (should still work but log error)
      const hasAccess = await permissionManager.checkAccess(
        'invalid-did',
        testUserDid,
        'read',
      )
      expect(hasAccess).toBe(false)
    })
  })

  describe('Performance and Edge Cases', () => {
    test('should handle empty repository lists', async () => {
      const repos = await permissionManager.listUserRepositories(testUserDid)
      expect(repos).toEqual([])
    })

    test('should handle large audit logs', async () => {
      // Create many permission changes
      for (let i = 0; i < 50; i++) {
        await permissionManager.grantAccess(
          testRepoDid,
          testUserDid,
          { read: true, write: i % 2 === 0 },
          testOwnerDid,
        )
      }

      const auditLog = await permissionManager.getPermissionAuditLog(
        testRepoDid,
        25,
      )
      expect(auditLog).toHaveLength(25) // Limited by our request
    })

    test('should handle concurrent permission operations', async () => {
      const user1 = 'did:plc:concurrent-user-1'
      const user2 = 'did:plc:concurrent-user-2'

      // Simulate concurrent operations
      await Promise.all([
        permissionManager.grantAccess(
          testRepoDid,
          user1,
          { read: true, write: true },
          testOwnerDid,
        ),
        permissionManager.grantAccess(
          testRepoDid,
          user2,
          { read: true, write: false },
          testOwnerDid,
        ),
      ])

      const collaborators =
        await permissionManager.listCollaborators(testRepoDid)
      expect(collaborators).toHaveLength(2)
    })
  })
})
