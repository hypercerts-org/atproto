import { AtpAgent } from '@atproto/api'
import { TestNetworkWithSds } from '@atproto/dev-env'

describe('organization creation', () => {
  let network: TestNetworkWithSds
  let user: { did: string; agent: AtpAgent }

  beforeAll(async () => {
    network = await TestNetworkWithSds.create({
      dbPostgresSchema: 'organization_creation_test',
    })

    // Create test user on PDS
    const sc = network.serviceHeaders
    const pdsAgent = network.pds.getClient()

    const userAccount = await pdsAgent.com.atproto.server.createAccount(
      {
        handle: 'org-creator.test',
        email: 'creator@test.com',
        password: 'password123',
      },
      { headers: sc },
    )

    user = {
      did: userAccount.data.did,
      agent: new AtpAgent({ service: network.pds.url }), // Login to PDS, not SDS
    }
    await user.agent.login({
      identifier: 'org-creator.test',
      password: 'password123',
    })

    // Create a new agent pointing to SDS for organization creation calls
    const sdsAgent = new AtpAgent({ service: network.sds.url })
    // Copy session from PDS login to SDS agent
    if (user.agent.session) {
      sdsAgent.sessionManager.session = user.agent.sessionManager.session
    }
    user.agent = sdsAgent
  })

  afterAll(async () => {
    await network.close()
  })

  it('should require handlePrefix to be provided', async () => {
    await expect(
      user.agent.call('com.sds.organization.create', undefined, {
        name: 'Test Organization',
        creatorDid: user.did,
      }),
    ).rejects.toThrow(/Handle prefix is required/)
  })

  it('should validate handle format', async () => {
    // Invalid handle prefix (contains dot - server will append hostname)
    await expect(
      user.agent.call('com.sds.organization.create', undefined, {
        name: 'Test Organization',
        handlePrefix: 'invalid.handle',
        creatorDid: user.did,
      }),
    ).rejects.toThrow(/InvalidHandle/)

    // Invalid handle format (double dots after server appends hostname)
    await expect(
      user.agent.call('com.sds.organization.create', undefined, {
        name: 'Test Organization',
        handlePrefix: 'invalid..prefix',
        creatorDid: user.did,
      }),
    ).rejects.toThrow(/InvalidHandle/)
  })

  it('should reject duplicate handles', async () => {
    const handlePrefix = 'test-org'

    // Create first organization
    const firstResponse = await user.agent.call(
      'com.sds.organization.create',
      undefined,
      {
        name: 'Test Organization',
        handlePrefix,
        creatorDid: user.did,
      },
    )

    const expectedHandle = `${handlePrefix}.${new URL(network.sds.url).hostname}`
    expect(firstResponse.data.handle).toBe(expectedHandle)

    // Try to create second organization with same prefix
    await expect(
      user.agent.call('com.sds.organization.create', undefined, {
        name: 'Another Organization',
        handlePrefix,
        creatorDid: user.did,
      }),
    ).rejects.toThrow(/Handle already taken/)
  })

  it('should create organization with valid handle prefix', async () => {
    const handlePrefix = 'valid-org'
    const sdsHostname = new URL(network.sds.url).host
    const expectedHandle = `${handlePrefix}.${sdsHostname}`

    const response = await user.agent.call(
      'com.sds.organization.create',
      undefined,
      {
        name: 'Valid Organization',
        description: 'A valid test organization',
        handlePrefix,
        creatorDid: user.did,
      },
    )

    expect(response.data).toMatchObject({
      handle: expectedHandle,
      name: 'Valid Organization',
      description: 'A valid test organization',
      permissions: {
        read: true,
        create: true,
        update: true,
        delete: true,
        admin: true,
        owner: true,
      },
      accessType: 'owner',
    })
    expect(response.data.did).toBeDefined()
    expect(response.data.createdAt).toBeDefined()
  })
})
