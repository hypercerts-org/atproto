import { AtpAgent } from '@atproto/api'
import { TestNetworkWithSds } from '@atproto/dev-env'

describe('SDS Network Integration', () => {
  let network: TestNetworkWithSds
  let repoOwner: { did: string; agent: AtpAgent }
  let collaborator: { did: string; agent: AtpAgent }

  beforeAll(async () => {
    network = await TestNetworkWithSds.create({
      dbPostgresSchema: 'sds_network_integration_test',
    })

    // Create test users on PDS (account management is still handled by PDS)
    const adminHeaders = await network.adminHeaders()
    const pdsAgent = network.pds.getClient()

    // Create repository owner
    const ownerAccount = await pdsAgent.com.atproto.server.createAccount(
      {
        handle: 'repo-owner.test',
        email: 'owner@test.com',
        password: 'password123',
      },
      { headers: adminHeaders },
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
    const collaboratorAccount = await pdsAgent.com.atproto.server.createAccount(
      {
        handle: 'collaborator.test',
        email: 'collaborator@test.com',
        password: 'password123',
      },
      { headers: adminHeaders },
    )

    collaborator = {
      did: collaboratorAccount.data.did,
      agent: new AtpAgent({ service: network.sds.url }),
    }
    await collaborator.agent.login({
      identifier: 'collaborator.test',
      password: 'password123',
    })
  })

  afterAll(async () => {
    await network.close()
  })

  describe('SDS-specific endpoints', () => {
    test('should have SDS endpoints available', async () => {
      // Test that SDS endpoints are accessible
      const response = await repoOwner.agent.call(
        'com.sds.repo.getPermissions',
        {
          repo: repoOwner.did,
        },
      )

      expect(response.data.permissions).toEqual({
        read: true,
        write: true,
      })
      expect(response.data.accessType).toBe('owner')
    })

    test('should allow granting and checking permissions', async () => {
      // Grant permissions to collaborator
      await repoOwner.agent.call('com.sds.repo.grantAccess', {
        repo: repoOwner.did,
        userDid: collaborator.did,
        permissions: { read: true, write: false },
      })

      // Check collaborator's permissions
      const collaboratorPermissions = await collaborator.agent.call(
        'com.sds.repo.getPermissions',
        {
          repo: repoOwner.did,
        },
      )

      expect(collaboratorPermissions.data.permissions).toEqual({
        read: true,
        write: false,
      })
      expect(collaboratorPermissions.data.accessType).toBe('shared')
      expect(collaboratorPermissions.data.grantedBy).toBe(repoOwner.did)
    })

    test('should allow listing collaborators', async () => {
      const response = await repoOwner.agent.call(
        'com.sds.repo.listCollaborators',
        {
          repo: repoOwner.did,
        },
      )

      expect(response.data.collaborators).toHaveLength(1)
      expect(response.data.collaborators[0].userDid).toBe(collaborator.did)
      expect(response.data.collaborators[0].permissions).toEqual({
        read: true,
        write: false,
      })
    })

    test('should allow revoking permissions', async () => {
      // Revoke permissions
      await repoOwner.agent.call('com.sds.repo.revokeAccess', {
        repo: repoOwner.did,
        userDid: collaborator.did,
      })

      // Check that permissions are revoked
      const collaboratorPermissions = await collaborator.agent.call(
        'com.sds.repo.getPermissions',
        {
          repo: repoOwner.did,
        },
      )

      expect(collaboratorPermissions.data.permissions).toEqual({
        read: false,
        write: false,
      })
      expect(collaboratorPermissions.data.accessType).toBe('none')
    })
  })

  describe('Standard PDS endpoints compatibility', () => {
    test('should support standard repository operations', async () => {
      // Create a record as repository owner
      const createResponse = await repoOwner.agent.call(
        'com.atproto.repo.createRecord',
        {
          repo: repoOwner.did,
          collection: 'app.bsky.feed.post',
          record: {
            text: 'Hello from SDS!',
            createdAt: new Date().toISOString(),
          },
        },
      )

      expect(createResponse.data.uri).toBeDefined()
      expect(createResponse.data.cid).toBeDefined()

      // Retrieve the record
      const getResponse = await repoOwner.agent.call(
        'com.atproto.repo.getRecord',
        {
          repo: repoOwner.did,
          collection: 'app.bsky.feed.post',
          rkey: createResponse.data.uri.split('/').pop(),
        },
      )

      expect(getResponse.data.value).toMatchObject({
        text: 'Hello from SDS!',
      })
    })

    test('should enforce permissions for shared repository operations', async () => {
      // Grant read-only access to collaborator
      await repoOwner.agent.call('com.sds.repo.grantAccess', {
        repo: repoOwner.did,
        userDid: collaborator.did,
        permissions: { read: true, write: false },
      })

      // Collaborator should be able to read
      const records = await collaborator.agent.call(
        'com.atproto.repo.listRecords',
        {
          repo: repoOwner.did,
          collection: 'app.bsky.feed.post',
        },
      )
      expect(records.data.records).toBeDefined()

      // But not write
      await expect(
        collaborator.agent.call('com.atproto.repo.createRecord', {
          repo: repoOwner.did,
          collection: 'app.bsky.feed.post',
          record: {
            text: 'Unauthorized write attempt',
            createdAt: new Date().toISOString(),
          },
        }),
      ).rejects.toThrow()
    })
  })

  describe('Network components integration', () => {
    test('should have both PDS and SDS available', async () => {
      expect(network.pds).toBeDefined()
      expect(network.sds).toBeDefined()
      expect(network.pds.url).not.toBe(network.sds.url)
    })

    test('should have shared infrastructure', async () => {
      expect(network.plc).toBeDefined()
      expect(network.bsky).toBeDefined()
      expect(network.ozone).toBeDefined()
    })

    test('should process background tasks', async () => {
      await expect(network.processAll()).resolves.not.toThrow()
    })
  })
})
