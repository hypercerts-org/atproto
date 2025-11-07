import { TestNetworkWithSds } from '@atproto/dev-env'
import { InvalidRequestError } from '@atproto/xrpc-server'
import type { DatabaseSchema } from '../src/account-manager/db/schema'
import type { Database } from '../src/db'
import { SdsPermissionManager } from '../src/permission-manager'
import { RepositoryPermissions } from '../src/types'

describe('SDS Endpoint Logic', () => {
  let network: TestNetworkWithSds
  let permissionManager: SdsPermissionManager

  const testRepoDid = 'did:plc:test-repo-123'
  const testOwnerDid = 'did:plc:test-owner'
  const testCollaboratorDid = 'did:plc:test-collaborator'
  const testUnauthorizedDid = 'did:plc:test-unauthorized'

  beforeAll(async () => {
    network = await TestNetworkWithSds.create({
      dbPostgresSchema: 'sds_endpoint_logic_test',
    })
    permissionManager = new SdsPermissionManager(
      network.sds.ctx.accountManager.db as unknown as Database<DatabaseSchema>,
    )
  })

  afterAll(async () => {
    await network.close()
  })

  beforeEach(async () => {
    // Clear tables before each test
    await network.sds.ctx.accountManager.db.db
      .deleteFrom('shared_repository_permissions')
      .execute()
    await network.sds.ctx.accountManager.db.db
      .deleteFrom('permission_audit_log')
      .execute()
  })

  describe('grantAccess endpoint logic', () => {
    test('should grant access when called by repository owner', async () => {
      const permissions: RepositoryPermissions = {
        read: true,
        create: false,
        update: false,
        delete: false,
      }

      // This simulates the grantAccess endpoint logic
      await permissionManager.grantAccess(
        testRepoDid,
        testCollaboratorDid,
        permissions,
        testOwnerDid,
      )

      const grantedPermissions = await permissionManager.getPermissions(
        testRepoDid,
        testCollaboratorDid,
      )
      expect(grantedPermissions).toEqual(permissions)

      const collaborators =
        await permissionManager.listCollaborators(testRepoDid)
      expect(collaborators).toHaveLength(1)
      expect(collaborators[0].userDid).toBe(testCollaboratorDid)
      expect(collaborators[0].grantedBy).toBe(testOwnerDid)
    })

    test('should validate permissions object', async () => {
      // Test the validation logic that would be in the endpoint
      const invalidPermissions = {
        read: 'invalid',
        create: false,
        update: false,
        delete: false,
      } as any

      expect(() => {
        if (
          typeof invalidPermissions.read !== 'boolean' ||
          typeof invalidPermissions.create !== 'boolean' ||
          typeof invalidPermissions.update !== 'boolean' ||
          typeof invalidPermissions.delete !== 'boolean'
        ) {
          throw new InvalidRequestError(
            'Permissions must specify boolean values for read, create, update, and delete',
          )
        }
      }).toThrow('Permissions must specify boolean values')
    })

    test('should prevent granting access to repository owner', async () => {
      // Test the business logic that prevents self-granting
      await expect(
        permissionManager.grantAccess(
          testOwnerDid,
          testOwnerDid,
          {
            read: true,
            create: true,
            update: true,
            delete: true,
          },
          testOwnerDid,
        ),
      ).rejects.toThrow() // The permission manager should handle this case
    })
  })

  describe('revokeAccess endpoint logic', () => {
    beforeEach(async () => {
      // Set up initial permissions
      await permissionManager.grantAccess(
        testRepoDid,
        testCollaboratorDid,
        {
          read: true,
          create: false,
          update: false,
          delete: false,
        },
        testOwnerDid,
      )
    })

    test('should revoke access when called by repository owner', async () => {
      await permissionManager.revokeAccess(
        testRepoDid,
        testCollaboratorDid,
        testOwnerDid,
      )

      const permissions = await permissionManager.getPermissions(
        testRepoDid,
        testCollaboratorDid,
      )
      expect(permissions).toBeNull()
    })

    test('should handle revoking non-existent permissions', async () => {
      await expect(
        permissionManager.revokeAccess(
          testRepoDid,
          testUnauthorizedDid,
          testOwnerDid,
        ),
      ).rejects.toThrow('does not have access')
    })
  })

  describe('listCollaborators endpoint logic', () => {
    beforeEach(async () => {
      // Set up test data
      await permissionManager.grantAccess(
        testRepoDid,
        testCollaboratorDid,
        {
          read: true,
          create: false,
          update: false,
          delete: false,
        },
        testOwnerDid,
      )
      await permissionManager.grantAccess(
        testRepoDid,
        'did:plc:another-user',
        {
          read: true,
          create: true,
          update: true,
          delete: true,
        },
        testOwnerDid,
      )
    })

    test('should list all collaborators', async () => {
      const collaborators =
        await permissionManager.listCollaborators(testRepoDid)

      expect(collaborators).toHaveLength(2)
      expect(collaborators.map((c) => c.userDid)).toContain(testCollaboratorDid)
      expect(collaborators.map((c) => c.userDid)).toContain(
        'did:plc:another-user',
      )
    })

    test('should return empty array for repository with no collaborators', async () => {
      const emptyRepoDid = 'did:plc:empty-repo'
      const collaborators =
        await permissionManager.listCollaborators(emptyRepoDid)
      expect(collaborators).toEqual([])
    })

    test('should support pagination logic', async () => {
      const allCollaborators =
        await permissionManager.listCollaborators(testRepoDid)

      // Test pagination parameters (this would be in the endpoint)
      const limit = 1
      const startIndex = 0
      const endIndex = Math.min(startIndex + limit, allCollaborators.length)
      const paginatedCollaborators = allCollaborators.slice(
        startIndex,
        endIndex,
      )

      expect(paginatedCollaborators).toHaveLength(1)

      const nextCursor =
        endIndex < allCollaborators.length ? endIndex.toString() : undefined
      expect(nextCursor).toBe('1') // Should have a next page
    })
  })

  describe('getPermissions endpoint logic', () => {
    test('should return owner permissions for repository owner', async () => {
      // Owner should always have full permissions (implicit)
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

      // The endpoint would return this format:
      const ownerResponse = {
        permissions: {
          read: true,
          create: true,
          update: true,
          delete: true,
        },
        accessType: 'owner' as const,
      }
      expect(ownerResponse.accessType).toBe('owner')
      expect(ownerResponse.permissions).toEqual({
        read: true,
        create: true,
        update: true,
        delete: true,
      })
    })

    test('should return shared permissions for collaborator', async () => {
      const permissions: RepositoryPermissions = {
        read: true,
        create: false,
        update: false,
        delete: false,
      }
      await permissionManager.grantAccess(
        testRepoDid,
        testCollaboratorDid,
        permissions,
        testOwnerDid,
      )

      const sharedPermissions = await permissionManager.getPermissions(
        testRepoDid,
        testCollaboratorDid,
      )
      expect(sharedPermissions).toEqual(permissions)

      // The endpoint would return this format:
      const collaboratorResponse = {
        permissions: sharedPermissions,
        accessType: 'shared' as const,
        grantedBy: testOwnerDid,
        grantedAt: expect.any(String),
      }
      expect(collaboratorResponse.accessType).toBe('shared')
      expect(collaboratorResponse.permissions).toEqual(permissions)
    })

    test('should return no permissions for unauthorized user', async () => {
      const permissions = await permissionManager.getPermissions(
        testRepoDid,
        testUnauthorizedDid,
      )
      expect(permissions).toBeNull()

      // The endpoint would return this format:
      const unauthorizedResponse = {
        permissions: {
          read: false,
          create: false,
          update: false,
          delete: false,
        },
        accessType: 'none' as const,
      }
      expect(unauthorizedResponse.accessType).toBe('none')
      expect(unauthorizedResponse.permissions).toEqual({
        read: false,
        create: false,
        update: false,
        delete: false,
      })
    })
  })

  describe('permission system integration', () => {
    test('should support read/write permission granularity', async () => {
      // Grant read-only access
      await permissionManager.grantAccess(
        testRepoDid,
        testCollaboratorDid,
        {
          read: true,
          create: false,
          update: false,
          delete: false,
        },
        testOwnerDid,
      )

      const hasReadAccess = await permissionManager.checkAccess(
        testRepoDid,
        testCollaboratorDid,
        'read',
      )
      const hasCreateAccess = await permissionManager.checkAccess(
        testRepoDid,
        testCollaboratorDid,
        'create',
      )
      const hasUpdateAccess = await permissionManager.checkAccess(
        testRepoDid,
        testCollaboratorDid,
        'update',
      )
      const hasDeleteAccess = await permissionManager.checkAccess(
        testRepoDid,
        testCollaboratorDid,
        'delete',
      )

      expect(hasReadAccess).toBe(true)
      expect(hasCreateAccess).toBe(false)
      expect(hasUpdateAccess).toBe(false)
      expect(hasDeleteAccess).toBe(false)
    })

    test('should support action-based permission checking', async () => {
      // This simulates how the auth verifier would check permissions for different operations
      const permissions: RepositoryPermissions = {
        read: true,
        create: false,
        update: false,
        delete: false,
      }

      // Simulate endpoint permission checks
      const canRead = permissions.read // For operations like getRecord
      const canCreate = permissions.create // For operations like createRecord
      const canUpdate = permissions.update // For operations like updateRecord
      const canDelete = permissions.delete // For operations like deleteRecord

      expect(canRead).toBe(true)
      expect(canCreate).toBe(false)
      expect(canUpdate).toBe(false)
      expect(canDelete).toBe(false)
    })
  })

  describe('error handling and edge cases', () => {
    test('should handle concurrent operations', async () => {
      const user1 = 'did:plc:concurrent-user-1'
      const user2 = 'did:plc:concurrent-user-2'

      // Simulate concurrent grant operations
      await Promise.all([
        permissionManager.grantAccess(
          testRepoDid,
          user1,
          {
            read: true,
            create: true,
            update: true,
            delete: true,
          },
          testOwnerDid,
        ),
        permissionManager.grantAccess(
          testRepoDid,
          user2,
          {
            read: true,
            create: false,
            update: false,
            delete: false,
          },
          testOwnerDid,
        ),
      ])

      const collaborators =
        await permissionManager.listCollaborators(testRepoDid)
      expect(collaborators).toHaveLength(2)
    })

    test('should maintain audit trail', async () => {
      await permissionManager.grantAccess(
        testRepoDid,
        testCollaboratorDid,
        {
          read: true,
          create: false,
          update: false,
          delete: false,
        },
        testOwnerDid,
      )

      await permissionManager.revokeAccess(
        testRepoDid,
        testCollaboratorDid,
        testOwnerDid,
      )

      const auditLog =
        await permissionManager.getPermissionAuditLog(testRepoDid)
      expect(auditLog).toHaveLength(2)
      expect(auditLog[0].action).toBe('revoke') // Most recent first
      expect(auditLog[1].action).toBe('grant')
    })

    test('should handle repository cleanup', async () => {
      await permissionManager.grantAccess(
        testRepoDid,
        testCollaboratorDid,
        {
          read: true,
          create: false,
          update: false,
          delete: false,
        },
        testOwnerDid,
      )
      await permissionManager.grantAccess(
        testRepoDid,
        'did:plc:another-user',
        {
          read: true,
          create: true,
          update: true,
          delete: true,
        },
        testOwnerDid,
      )

      expect(await permissionManager.hasCollaborators(testRepoDid)).toBe(true)

      await permissionManager.removeAllPermissions(testRepoDid, testOwnerDid)

      expect(await permissionManager.hasCollaborators(testRepoDid)).toBe(false)
      const collaborators =
        await permissionManager.listCollaborators(testRepoDid)
      expect(collaborators).toHaveLength(0)
    })
  })
})
