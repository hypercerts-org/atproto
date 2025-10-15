/**
 * SDS Auth Integration Tests
 *
 * These tests focus on the authorization layer of SDS (database permissions),
 * not the authentication layer (federated JWT validation).
 *
 * Authentication (token validation) is handled by FederatedTokenValidator which:
 * - Fetches JWKS from the issuing PDS
 * - Validates JWT signatures locally
 * - Extracts the user's DID from the validated token
 *
 * Authorization (access control) is tested here and is based on:
 * - SDS database permissions (read, write, admin, owner)
 * - Permission inheritance (owner > admin > write > read)
 * - No OAuth scope validation
 */

import { DatabaseSchema, getDb, getMigrator } from '../src/account-manager/db'
import { Database } from '../src/db'
import { SdsPermissionManager } from '../src/permission-manager'
import { SdsAuthVerifier } from '../src/sds-auth-verifier'
import { RepositoryPermissions } from '../src/types'

// Mock the required dependencies for testing
const mockAccountManager = {
  db: {} as any,
} as any

const mockIdResolver = {} as any

const mockOAuthVerifier = {} as any

const mockAuthVerifierOpts = {
  publicUrl: 'https://test.example.com',
  jwtKey: {} as any,
  adminPass: 'test-admin-pass',
  dids: {
    pds: 'did:plc:test-pds',
  },
}

describe('SDS Auth Integration', () => {
  let db: Database<DatabaseSchema>
  let permissionManager: SdsPermissionManager
  let sdsAuthVerifier: SdsAuthVerifier

  const testRepoDid = 'did:plc:test-repo-123'
  const testUserDid = 'did:plc:test-user-456'
  const testOwnerDid = 'did:plc:test-owner-789'

  beforeAll(async () => {
    // Create in-memory SQLite database for testing
    db = getDb(':memory:')

    // Run migrations to set up the database schema
    const migrator = getMigrator(db)
    await migrator.migrateToLatestOrThrow()

    // Initialize components
    permissionManager = new SdsPermissionManager(db)
    mockAccountManager.db = db

    sdsAuthVerifier = new SdsAuthVerifier(
      mockAccountManager,
      mockIdResolver,
      mockOAuthVerifier,
      mockAuthVerifierOpts,
      permissionManager,
    )
  })

  afterAll(async () => {
    await db.close()
  })

  beforeEach(async () => {
    // Clean up test data before each test
    await db.db.deleteFrom('shared_repository_permissions').execute()
    await db.db.deleteFrom('permission_audit_log').execute()
  })

  describe('checkRepositoryAccess', () => {
    test('should allow owner access to their own repository', async () => {
      const hasAccess = await sdsAuthVerifier.checkRepositoryAccess(
        testOwnerDid,
        testOwnerDid,
        'write',
      )

      expect(hasAccess).toBe(true)
    })

    test('should deny access to users without permissions', async () => {
      const hasAccess = await sdsAuthVerifier.checkRepositoryAccess(
        testRepoDid,
        testUserDid,
        'read',
      )

      expect(hasAccess).toBe(false)
    })

    test('should allow access to users with granted permissions', async () => {
      // Grant permissions first
      const permissions: RepositoryPermissions = { read: true, write: false }
      await permissionManager.grantAccess(
        testRepoDid,
        testUserDid,
        permissions,
        testOwnerDid,
      )

      // Test read access (should be allowed)
      const hasReadAccess = await sdsAuthVerifier.checkRepositoryAccess(
        testRepoDid,
        testUserDid,
        'read',
      )
      expect(hasReadAccess).toBe(true)

      // Test write access (should be denied)
      const hasWriteAccess = await sdsAuthVerifier.checkRepositoryAccess(
        testRepoDid,
        testUserDid,
        'write',
      )
      expect(hasWriteAccess).toBe(false)
    })

    test('should handle errors gracefully', async () => {
      // Test with invalid DID format to trigger an error
      const hasAccess = await sdsAuthVerifier.checkRepositoryAccess(
        'invalid-did',
        testUserDid,
        'read',
      )

      // Should return false instead of throwing
      expect(hasAccess).toBe(false)
    })
  })

  describe('getRequiredAction', () => {
    test('should detect write operations correctly', async () => {
      expect(sdsAuthVerifier.getRequiredAction('POST')).toBe('write')
      expect(sdsAuthVerifier.getRequiredAction('PUT')).toBe('write')
      expect(sdsAuthVerifier.getRequiredAction('DELETE')).toBe('write')

      expect(sdsAuthVerifier.getRequiredAction('GET', '/createRecord')).toBe(
        'write',
      )
      expect(sdsAuthVerifier.getRequiredAction('GET', '/putRecord')).toBe(
        'write',
      )
      expect(sdsAuthVerifier.getRequiredAction('GET', '/deleteRecord')).toBe(
        'write',
      )
      expect(sdsAuthVerifier.getRequiredAction('GET', '/uploadBlob')).toBe(
        'write',
      )
    })

    test('should detect read operations correctly', async () => {
      expect(sdsAuthVerifier.getRequiredAction('GET')).toBe('read')
      expect(sdsAuthVerifier.getRequiredAction('GET', '/getRecord')).toBe(
        'read',
      )
      expect(sdsAuthVerifier.getRequiredAction('HEAD')).toBe('read')
    })

    test('should detect admin operations correctly', async () => {
      expect(
        sdsAuthVerifier.getRequiredAction('POST', '/admin/updateAccount'),
      ).toBe('admin')
      expect(
        sdsAuthVerifier.getRequiredAction('GET', '/moderation/report'),
      ).toBe('admin')
    })
  })

  describe('integration with permission manager', () => {
    test('should integrate properly with permission manager', async () => {
      // Grant permissions through permission manager
      const permissions: RepositoryPermissions = { read: true, write: true }
      await permissionManager.grantAccess(
        testRepoDid,
        testUserDid,
        permissions,
        testOwnerDid,
      )

      // Verify through auth verifier
      const hasReadAccess = await sdsAuthVerifier.checkRepositoryAccess(
        testRepoDid,
        testUserDid,
        'read',
      )
      const hasWriteAccess = await sdsAuthVerifier.checkRepositoryAccess(
        testRepoDid,
        testUserDid,
        'write',
      )

      expect(hasReadAccess).toBe(true)
      expect(hasWriteAccess).toBe(true)

      // Revoke permissions
      await permissionManager.revokeAccess(
        testRepoDid,
        testUserDid,
        testOwnerDid,
      )

      // Verify access is revoked
      const hasAccessAfterRevoke = await sdsAuthVerifier.checkRepositoryAccess(
        testRepoDid,
        testUserDid,
        'read',
      )
      expect(hasAccessAfterRevoke).toBe(false)
    })

    test('should handle admin permission inheritance', async () => {
      // Grant admin permissions
      const permissions: RepositoryPermissions = { admin: true }
      await permissionManager.grantAccess(
        testRepoDid,
        testUserDid,
        permissions,
        testOwnerDid,
      )

      // Admin should have write and read access
      const hasAdminAccess = await sdsAuthVerifier.checkRepositoryAccess(
        testRepoDid,
        testUserDid,
        'admin',
      )
      const hasWriteAccess = await sdsAuthVerifier.checkRepositoryAccess(
        testRepoDid,
        testUserDid,
        'write',
      )
      const hasReadAccess = await sdsAuthVerifier.checkRepositoryAccess(
        testRepoDid,
        testUserDid,
        'read',
      )

      expect(hasAdminAccess).toBe(true)
      expect(hasWriteAccess).toBe(true)
      expect(hasReadAccess).toBe(true)
    })

    test('should handle write permission inheritance', async () => {
      // Grant write permissions
      const permissions: RepositoryPermissions = { write: true }
      await permissionManager.grantAccess(
        testRepoDid,
        testUserDid,
        permissions,
        testOwnerDid,
      )

      // Write should include read access but not admin
      const hasWriteAccess = await sdsAuthVerifier.checkRepositoryAccess(
        testRepoDid,
        testUserDid,
        'write',
      )
      const hasReadAccess = await sdsAuthVerifier.checkRepositoryAccess(
        testRepoDid,
        testUserDid,
        'read',
      )
      const hasAdminAccess = await sdsAuthVerifier.checkRepositoryAccess(
        testRepoDid,
        testUserDid,
        'admin',
      )

      expect(hasWriteAccess).toBe(true)
      expect(hasReadAccess).toBe(true)
      expect(hasAdminAccess).toBe(false)
    })
  })

  describe('permission-based authorization (no OAuth scopes)', () => {
    test('should allow access with SDS permissions only', async () => {
      // Grant permissions in DB
      const permissions: RepositoryPermissions = { read: true, write: true }
      await permissionManager.grantAccess(
        testRepoDid,
        testUserDid,
        permissions,
        testOwnerDid,
      )

      // Verify access granted based on SDS permissions alone
      const hasAccess = await sdsAuthVerifier.checkRepositoryAccess(
        testRepoDid,
        testUserDid,
        'write',
      )
      expect(hasAccess).toBe(true)
    })

    test('should deny access without SDS permissions', async () => {
      // No permissions in DB
      // Verify access denied
      const hasAccess = await sdsAuthVerifier.checkRepositoryAccess(
        testRepoDid,
        testUserDid,
        'write',
      )
      expect(hasAccess).toBe(false)
    })
  })
})
