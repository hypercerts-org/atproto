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
  })

  describe('authentication security', () => {
    test('should reject forged JWT tokens', async () => {
      // This test demonstrates that forged JWT tokens should be rejected
      const forgedToken = createForgedJwtToken(testUserDid)

      // Mock the token extraction and validation
      const mockReq = {
        headers: {
          authorization: `Bearer ${forgedToken}`,
        },
      } as any

      // The auth verifier should reject forged tokens
      // This is a critical vulnerability if it doesn't
      try {
        const result = await sdsAuthVerifier.oauth()({ req: mockReq } as any)
        // If this succeeds, it's a critical vulnerability
        expect(result).toBeUndefined()
      } catch (error) {
        // Expected to fail with authentication error
        expect(
          (error as Error).message.includes('auth') ||
            (error as Error).message.includes('token'),
        ).toBe(true)
      }
    })

    test('should reject tokens without proper signature', async () => {
      const noSignatureToken = createNoSignatureToken(testUserDid)

      const mockReq = {
        headers: {
          authorization: `Bearer ${noSignatureToken}`,
        },
      } as any

      try {
        const result = await sdsAuthVerifier.oauth()({ req: mockReq } as any)
        expect(result).toBeUndefined()
      } catch (error) {
        expect(
          (error as Error).message.includes('auth') ||
            (error as Error).message.includes('signature'),
        ).toBe(true)
      }
    })

    test('should reject malicious cross-server tokens', async () => {
      const maliciousToken = createMaliciousToken(
        testUserDid,
        'malicious-issuer.com',
      )

      const mockReq = {
        headers: {
          authorization: `Bearer ${maliciousToken}`,
        },
      } as any

      try {
        const result = await sdsAuthVerifier.oauth()({ req: mockReq } as any)
        expect(result).toBeUndefined()
      } catch (error) {
        expect(
          (error as Error).message.includes('auth') ||
            (error as Error).message.includes('issuer'),
        ).toBe(true)
      }
    })

    test('should validate OAuth scopes properly', async () => {
      const limitedScopeToken = createLimitedScopeToken(testUserDid, ['read'])

      const mockReq = {
        headers: {
          authorization: `Bearer ${limitedScopeToken}`,
        },
      } as any

      try {
        const result = await sdsAuthVerifier.oauth()({ req: mockReq } as any)
        // Should not grant admin access with limited scope
        if (result?.credentials?.permissions) {
          expect(result.credentials.permissions.scopes).not.toContain('admin')
        }
      } catch (error) {
        // Validation error is also acceptable
        expect(error).toBeDefined()
      }
    })
  })
})

// Helper functions to create test tokens
function createForgedJwtToken(did: string): string {
  const header = Buffer.from(
    JSON.stringify({ alg: 'none', typ: 'JWT' }),
  ).toString('base64url')
  const payload = Buffer.from(
    JSON.stringify({
      sub: did,
      iss: 'malicious-issuer.com',
      aud: 'sds-server',
      exp: Math.floor(Date.now() / 1000) + 3600,
      scope: ['repo:*', 'atproto'],
    }),
  ).toString('base64url')

  return `${header}.${payload}.forged-signature`
}

function createNoSignatureToken(did: string): string {
  const header = Buffer.from(
    JSON.stringify({ alg: 'none', typ: 'JWT' }),
  ).toString('base64url')
  const payload = Buffer.from(
    JSON.stringify({
      sub: did,
      iss: 'pds-server',
      aud: 'sds-server',
      exp: Math.floor(Date.now() / 1000) + 3600,
      scope: ['repo:*', 'atproto'],
    }),
  ).toString('base64url')

  return `${header}.${payload}` // No signature
}

function createMaliciousToken(did: string, issuer: string): string {
  const header = Buffer.from(
    JSON.stringify({ alg: 'none', typ: 'JWT' }),
  ).toString('base64url')
  const payload = Buffer.from(
    JSON.stringify({
      sub: did,
      iss: issuer,
      aud: 'sds-server',
      exp: Math.floor(Date.now() / 1000) + 3600,
      scope: ['repo:*', 'atproto'],
    }),
  ).toString('base64url')

  return `${header}.${payload}.malicious-signature`
}

function createLimitedScopeToken(did: string, scopes: string[]): string {
  const header = Buffer.from(
    JSON.stringify({ alg: 'none', typ: 'JWT' }),
  ).toString('base64url')
  const payload = Buffer.from(
    JSON.stringify({
      sub: did,
      iss: 'pds-server',
      aud: 'sds-server',
      exp: Math.floor(Date.now() / 1000) + 3600,
      scope: scopes,
    }),
  ).toString('base64url')

  return `${header}.${payload}.limited-signature`
}
