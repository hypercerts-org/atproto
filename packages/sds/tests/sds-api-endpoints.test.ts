import { AtpAgent } from '@atproto/api'
import { TestNetworkWithSds } from '@atproto/dev-env'
import { RepositoryPermissions } from '../src/types'

describe('SDS API Endpoints', () => {
  let network: TestNetworkWithSds
  let agent: AtpAgent
  let repoOwner: { did: string; agent: AtpAgent }
  let collaborator: { did: string; agent: AtpAgent }
  let unauthorizedUser: { did: string; agent: AtpAgent }

  beforeAll(async () => {
    network = await TestNetworkWithSds.create({
      dbPostgresSchema: 'sds_api_endpoints_test',
    })

    // Create test users
    const sc = network.serviceHeaders
    agent = network.sds.getClient()

    // Create repository owner
    const ownerAccount = await agent.com.atproto.server.createAccount(
      {
        handle: 'repo-owner.test',
        email: 'owner@test.com',
        password: 'password123',
      },
      { headers: sc },
    )

    repoOwner = {
      did: ownerAccount.data.did,
      agent: new AtpAgent({ service: network.sds.url }),
    }
    await repoOwner.agent.login({
      identifier: 'repo-owner.test',
      password: 'password123',
    })

    // Create collaborator
    const collaboratorAccount = await agent.com.atproto.server.createAccount(
      {
        handle: 'collaborator.test',
        email: 'collaborator@test.com',
        password: 'password123',
      },
      { headers: sc },
    )

    collaborator = {
      did: collaboratorAccount.data.did,
      agent: new AtpAgent({ service: network.sds.url }),
    }
    await collaborator.agent.login({
      identifier: 'collaborator.test',
      password: 'password123',
    })

    // Create unauthorized user
    const unauthorizedAccount = await agent.com.atproto.server.createAccount(
      {
        handle: 'unauthorized.test',
        email: 'unauthorized@test.com',
        password: 'password123',
      },
      { headers: sc },
    )

    unauthorizedUser = {
      did: unauthorizedAccount.data.did,
      agent: new AtpAgent({ service: network.sds.url }),
    }
    await unauthorizedUser.agent.login({
      identifier: 'unauthorized.test',
      password: 'password123',
    })
  })

  afterAll(async () => {
    await network.close()
  })

  describe('com.sds.repo.getPermissions', () => {
    test('should return owner permissions for repository owner', async () => {
      const response = await repoOwner.agent.call(
        'com.sds.repo.getPermissions',
        {
          repo: repoOwner.did,
        },
      )

      expect(response.data.permissions).toEqual({
        read: true,
        create: true,
        update: true,
        delete: true,
        admin: true,
      })
      expect(response.data.accessType).toBe('owner')
    })

    test('should return no permissions for unauthorized user', async () => {
      const response = await unauthorizedUser.agent.call(
        'com.sds.repo.getPermissions',
        {
          repo: repoOwner.did,
        },
      )

      expect(response.data.permissions).toEqual({
        read: false,
        create: false,
        update: false,
        delete: false,
        admin: false,
      })
      expect(response.data.accessType).toBe('none')
    })
  })

  describe('com.sds.repo.grantAccess', () => {
    test('should allow repository owner to grant access', async () => {
      const permissions: RepositoryPermissions = {
        read: true,
        create: false,
        update: false,
        delete: false,
      }

      const response = await repoOwner.agent.call('com.sds.repo.grantAccess', {
        repo: repoOwner.did,
        userDid: collaborator.did,
        permissions,
      })

      expect(response.data.success).toBe(true)
      expect(response.data.grantedAt).toBeDefined()
      expect(response.data.collaborator).toEqual({
        userDid: collaborator.did,
        permissions,
        grantedBy: repoOwner.did,
        grantedAt: response.data.grantedAt,
      })
    })

    test('should not allow non-owner to grant access', async () => {
      const permissions: RepositoryPermissions = {
        read: true,
        create: true,
        update: true,
        delete: true,
      }

      await expect(
        collaborator.agent.call('com.sds.repo.grantAccess', {
          repo: repoOwner.did,
          userDid: unauthorizedUser.did,
          permissions,
        }),
      ).rejects.toThrow('Only repository owners can grant access')
    })

    test('should not allow granting access to repository owner', async () => {
      const permissions: RepositoryPermissions = {
        read: true,
        create: true,
        update: true,
        delete: true,
      }

      await expect(
        repoOwner.agent.call('com.sds.repo.grantAccess', {
          repo: repoOwner.did,
          userDid: repoOwner.did,
          permissions,
        }),
      ).rejects.toThrow('Cannot grant access to repository owner')
    })

    test('should validate permissions object', async () => {
      await expect(
        repoOwner.agent.call('com.sds.repo.grantAccess', {
          repo: repoOwner.did,
          userDid: collaborator.did,
          permissions: { read: 'invalid' }, // Invalid type
        }),
      ).rejects.toThrow('Permissions must specify boolean values')
    })
  })

  describe('com.sds.repo.getPermissions (after granting access)', () => {
    test('should return shared permissions for collaborator', async () => {
      const response = await collaborator.agent.call(
        'com.sds.repo.getPermissions',
        {
          repo: repoOwner.did,
        },
      )

      expect(response.data.permissions).toEqual({
        read: true,
        create: false,
        update: false,
        delete: false,
      })
      expect(response.data.accessType).toBe('shared')
      expect(response.data.grantedBy).toBe(repoOwner.did)
      expect(response.data.grantedAt).toBeDefined()
    })
  })

  describe('com.sds.repo.listCollaborators', () => {
    test('should allow repository owner to list collaborators', async () => {
      const response = await repoOwner.agent.call(
        'com.sds.repo.listCollaborators',
        {
          repo: repoOwner.did,
        },
      )

      expect(response.data.collaborators).toHaveLength(1)
      expect(response.data.collaborators[0]).toEqual({
        userDid: collaborator.did,
        permissions: {
          read: true,
          create: false,
          update: false,
          delete: false,
        },
        grantedBy: repoOwner.did,
        grantedAt: expect.any(String),
        revokedAt: undefined,
      })
    })

    test('should allow collaborator to list collaborators', async () => {
      const response = await collaborator.agent.call(
        'com.sds.repo.listCollaborators',
        {
          repo: repoOwner.did,
        },
      )

      expect(response.data.collaborators).toHaveLength(1)
    })

    test('should not allow unauthorized user to list collaborators', async () => {
      await expect(
        unauthorizedUser.agent.call('com.sds.repo.listCollaborators', {
          repo: repoOwner.did,
        }),
      ).rejects.toThrow('Insufficient permissions')
    })
  })

  describe('com.sds.repo.revokeAccess', () => {
    test('should allow repository owner to revoke access', async () => {
      const response = await repoOwner.agent.call('com.sds.repo.revokeAccess', {
        repo: repoOwner.did,
        userDid: collaborator.did,
      })

      expect(response.data.success).toBe(true)
      expect(response.data.revokedAt).toBeDefined()
    })

    test('should not allow non-owner to revoke access', async () => {
      // First grant access back to test revocation by non-owner
      await repoOwner.agent.call('com.sds.repo.grantAccess', {
        repo: repoOwner.did,
        userDid: collaborator.did,
        permissions: {
          read: true,
          create: false,
          update: false,
          delete: false,
        },
      })

      await expect(
        collaborator.agent.call('com.sds.repo.revokeAccess', {
          repo: repoOwner.did,
          userDid: unauthorizedUser.did,
        }),
      ).rejects.toThrow('Only repository owners can revoke access')
    })

    test('should handle revoking non-existent access', async () => {
      await expect(
        repoOwner.agent.call('com.sds.repo.revokeAccess', {
          repo: repoOwner.did,
          userDid: unauthorizedUser.did,
        }),
      ).rejects.toThrow('does not have access')
    })

    test('should not allow revoking access from repository owner', async () => {
      await expect(
        repoOwner.agent.call('com.sds.repo.revokeAccess', {
          repo: repoOwner.did,
          userDid: repoOwner.did,
        }),
      ).rejects.toThrow('Cannot revoke access from repository owner')
    })
  })

  describe('integration with repository operations', () => {
    test('should allow collaborator to perform operations based on permissions', async () => {
      // Grant write access to collaborator
      await repoOwner.agent.call('com.sds.repo.grantAccess', {
        repo: repoOwner.did,
        userDid: collaborator.did,
        permissions: {
          read: true,
          create: true,
          update: true,
          delete: true,
        },
      })

      // Collaborator should be able to create records in the shared repository
      const response = await collaborator.agent.com.atproto.repo.createRecord({
        repo: repoOwner.did, // Create in owner's repository
        collection: 'app.bsky.feed.post',
        record: {
          $type: 'app.bsky.feed.post',
          text: 'Hello from collaborator!',
          createdAt: new Date().toISOString(),
        },
      })

      expect(response.data.uri).toContain(repoOwner.did)
      expect(response.data.cid).toBeDefined()
    })

    test('should prevent unauthorized operations', async () => {
      // Revoke write access
      await repoOwner.agent.call('com.sds.repo.revokeAccess', {
        repo: repoOwner.did,
        userDid: collaborator.did,
      })

      // Collaborator should no longer be able to create records
      await expect(
        collaborator.agent.com.atproto.repo.createRecord({
          repo: repoOwner.did,
          collection: 'app.bsky.feed.post',
          record: {
            $type: 'app.bsky.feed.post',
            text: 'This should fail!',
            createdAt: new Date().toISOString(),
          },
        }),
      ).rejects.toThrow('Access denied')
    })
  })
})
