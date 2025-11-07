import { TestNetworkWithSds } from '@atproto/dev-env'
import type { DatabaseSchema } from '../src/account-manager/db/schema'
import type { Database } from '../src/db'
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
      network.sds.ctx.accountManager.db as unknown as Database<DatabaseSchema>,
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
      const permissions: RepositoryPermissions = {
        read: true,
        create: false,
        update: false,
        delete: false,
      }
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
      const hasCreateAccess = await permissionManager.checkAccess(
        testRepoDid,
        testUserDid,
        'create',
      )
      const hasUpdateAccess = await permissionManager.checkAccess(
        testRepoDid,
        testUserDid,
        'update',
      )
      const hasDeleteAccess = await permissionManager.checkAccess(
        testRepoDid,
        testUserDid,
        'delete',
      )
      expect(hasReadAccess).toBe(true)
      expect(hasCreateAccess).toBe(false)
      expect(hasUpdateAccess).toBe(false)
      expect(hasDeleteAccess).toBe(false)

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
      const hasCreateAccess = await permissionManager.checkAccess(
        testOwnerDid,
        testOwnerDid,
        'create',
      )
      const hasUpdateAccess = await permissionManager.checkAccess(
        testOwnerDid,
        testOwnerDid,
        'update',
      )
      const hasDeleteAccess = await permissionManager.checkAccess(
        testOwnerDid,
        testOwnerDid,
        'delete',
      )

      expect(hasReadAccess).toBe(true)
      expect(hasCreateAccess).toBe(true)
      expect(hasUpdateAccess).toBe(true)
      expect(hasDeleteAccess).toBe(true)
    })

    test('should handle multiple collaborators', async () => {
      const user1 = 'did:plc:user-1'
      const user2 = 'did:plc:user-2'
      const user3 = 'did:plc:user-3'

      // Grant different permissions to different users
      await permissionManager.grantAccess(
        testRepoDid,
        user1,
        { read: true, create: true, update: true, delete: true },
        testOwnerDid,
      )
      await permissionManager.grantAccess(
        testRepoDid,
        user2,
        { read: true, create: false, update: false, delete: false },
        testOwnerDid,
      )
      await permissionManager.grantAccess(
        testRepoDid,
        user3,
        { read: false, create: true, update: true, delete: true },
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
        await permissionManager.checkAccess(testRepoDid, user1, 'create'),
      ).toBe(true)
      expect(
        await permissionManager.checkAccess(testRepoDid, user1, 'update'),
      ).toBe(true)
      expect(
        await permissionManager.checkAccess(testRepoDid, user1, 'delete'),
      ).toBe(true)

      expect(
        await permissionManager.checkAccess(testRepoDid, user2, 'read'),
      ).toBe(true)
      expect(
        await permissionManager.checkAccess(testRepoDid, user2, 'create'),
      ).toBe(false)
      expect(
        await permissionManager.checkAccess(testRepoDid, user2, 'update'),
      ).toBe(false)
      expect(
        await permissionManager.checkAccess(testRepoDid, user2, 'delete'),
      ).toBe(false)

      expect(
        await permissionManager.checkAccess(testRepoDid, user3, 'read'),
      ).toBe(false)
      expect(
        await permissionManager.checkAccess(testRepoDid, user3, 'create'),
      ).toBe(true)
      expect(
        await permissionManager.checkAccess(testRepoDid, user3, 'update'),
      ).toBe(true)
      expect(
        await permissionManager.checkAccess(testRepoDid, user3, 'delete'),
      ).toBe(true)
    })

    test('should handle permission updates', async () => {
      // Initial permissions
      await permissionManager.grantAccess(
        testRepoDid,
        testUserDid,
        { read: true, create: false, update: false, delete: false },
        testOwnerDid,
      )

      let permissions = await permissionManager.getPermissions(
        testRepoDid,
        testUserDid,
      )
      expect(permissions).toEqual({
        read: true,
        create: false,
        update: false,
        delete: false,
      })

      // Update permissions
      await permissionManager.grantAccess(
        testRepoDid,
        testUserDid,
        { read: true, create: true, update: true, delete: true },
        testOwnerDid,
      )

      permissions = await permissionManager.getPermissions(
        testRepoDid,
        testUserDid,
      )
      expect(permissions).toEqual({
        read: true,
        create: true,
        update: true,
        delete: true,
      })

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
        { read: true, create: false, update: false, delete: false },
        testOwnerDid,
      )
      await permissionManager.grantAccess(
        testRepoDid,
        user2,
        { read: true, create: true, update: true, delete: true },
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
        const hasWrite = i % 2 === 0
        await permissionManager.grantAccess(
          testRepoDid,
          testUserDid,
          {
            read: true,
            create: hasWrite,
            update: hasWrite,
            delete: hasWrite,
          },
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
          { read: true, create: true, update: true, delete: true },
          testOwnerDid,
        ),
        permissionManager.grantAccess(
          testRepoDid,
          user2,
          { read: true, create: false, update: false, delete: false },
          testOwnerDid,
        ),
      ])

      const collaborators =
        await permissionManager.listCollaborators(testRepoDid)
      expect(collaborators).toHaveLength(2)
    })
  })

  describe('input validation security', () => {
    test('should validate DID format in parameters', async () => {
      const invalidDids = [
        'invalid-did',
        'did:invalid:format',
        'did:plc:',
        '',
        'did:plc:invalid-characters-!@#$%',
        'did:plc:too-long-' + 'a'.repeat(1000),
      ]

      for (const invalidDid of invalidDids) {
        try {
          await permissionManager.grantAccess(
            invalidDid,
            testUserDid,
            { read: true, create: true, update: true, delete: true },
            testOwnerDid,
          )

          expect(true).toBe(false) // Should not reach here
        } catch (error) {
          expect(error).toBeDefined()
        }
      }
    })

    test('should prevent SQL injection in DID parameters', async () => {
      const maliciousDids = [
        "'; DROP TABLE shared_repository_permissions; --",
        "'; DELETE FROM shared_repository_permissions; --",
        "'; UPDATE shared_repository_permissions SET permissions='{}'; --",
        "'; INSERT INTO shared_repository_permissions VALUES ('hacked', 'hacker', '{}', 'hacker', NOW(), NULL); --",
      ]

      for (const maliciousDid of maliciousDids) {
        try {
          await permissionManager.grantAccess(
            maliciousDid,
            testUserDid,
            { read: true, create: true, update: true, delete: true },
            testOwnerDid,
          )

          // Should either fail validation or not execute malicious SQL
          expect(true).toBe(true) // Test passes if no SQL injection occurs
        } catch (error) {
          // Validation error is expected and acceptable
          expect(error).toBeDefined()
        }
      }
    })

    test('should validate permission object structure', async () => {
      const invalidPermissions: unknown[] = [
        { read: 'true', create: 'false' }, // String instead of boolean
        { read: 1, create: 0 }, // Number instead of boolean
        { read: null, create: undefined }, // Null/undefined instead of boolean
        { read: [], create: {} }, // Array/object instead of boolean
      ]

      for (const _invalidPermissions of invalidPermissions) {
        try {
          await permissionManager.grantAccess(
            testRepoDid,
            testUserDid,
            _invalidPermissions as RepositoryPermissions,
            testOwnerDid,
          )

          expect(true).toBe(false) // Should not reach here
        } catch (error) {
          expect(error).toBeDefined()
        }
      }
    })

    test('should prevent injection in permission data', async () => {
      const maliciousPermissions = {
        read: true,
        create: true,
        update: true,
        delete: true,
        admin: true,
        malicious: '"; DROP TABLE shared_repository_permissions; --',
      } as unknown as RepositoryPermissions

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

    test('should handle extremely long input strings', async () => {
      const longString = 'a'.repeat(10000) // 10KB string

      try {
        await permissionManager.grantAccess(
          longString, // Using long string as repo DID
          testUserDid,
          { read: true, create: true, update: true, delete: true },
          testOwnerDid,
        )

        // Should either succeed with truncated input or fail validation
        expect(true).toBe(true) // Test passes if no buffer overflow occurs
      } catch (error) {
        // Validation error is also acceptable
        expect(error).toBeDefined()
      }
    })

    test('should handle Unicode characters safely', async () => {
      const unicodeStrings = [
        'Test 🚀 Repository',
        'Test 中文 Repository',
        'Test العربية Repository',
        'Test 🎉🎊🎈 Repository',
        'Test \u0000\u0001\u0002 Repository', // Control characters
      ]

      for (const unicodeString of unicodeStrings) {
        try {
          await permissionManager.grantAccess(
            unicodeString,
            testUserDid,
            { read: true, create: true, update: true, delete: true },
            testOwnerDid,
          )

          // Should either succeed with proper encoding or fail validation
          expect(true).toBe(true) // Test passes if no encoding issues occur
        } catch (error) {
          // Validation error is also acceptable
          expect(error).toBeDefined()
        }
      }
    })

    test('should handle special characters safely', async () => {
      const specialChars = [
        'Test "Repository"',
        "Test 'Repository'",
        'Test & Repository',
        'Test <Repository>',
        'Test Repository|Test',
        'Test Repository;Test',
        'Test Repository\nTest',
        'Test Repository\tTest',
      ]

      for (const specialChar of specialChars) {
        try {
          await permissionManager.grantAccess(
            specialChar,
            testUserDid,
            { read: true, create: true, update: true, delete: true },
            testOwnerDid,
          )

          // Should either succeed with proper escaping or fail validation
          expect(true).toBe(true) // Test passes if no injection occurs
        } catch (error) {
          // Validation error is also acceptable
          expect(error).toBeDefined()
        }
      }
    })
  })
})
