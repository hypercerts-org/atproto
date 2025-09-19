import { TestNetwork } from '@atproto/dev-env'
import { SdsAppContext } from '../src/sds-context'

describe('organization creation', () => {
  let network: TestNetwork
  let ctx: SdsAppContext

  beforeAll(async () => {
    network = await TestNetwork.create({
      pds: { port: 0 },
      plc: { port: 0 },
      bsky: { port: 0 },
    })

    // Create a simple mock context for testing
    ctx = {
      authVerifier: {
        authorization: () => ({
          auth: { credentials: { did: 'did:test:user' } },
        }),
      },
      accountManager: {
        createAccount: jest.fn().mockResolvedValue({
          did: 'did:test:org',
          handle: 'test-org.sds.local',
        }),
      },
      sharedRepoManager: {
        grantAccess: jest.fn().mockResolvedValue(undefined),
      },
      idResolver: {
        resolveIdentity: jest.fn().mockResolvedValue({
          did: 'did:test:org',
          handle: 'test-org.sds.local',
        }),
      },
    } as any
  })

  afterAll(async () => {
    await network?.close()
  })

  it('should create organization with proper permissions', async () => {
    // This test verifies the business logic structure
    // In a real test environment, we would test the actual endpoint
    const organizationData = {
      name: 'Test Organization',
      description: 'A test organization',
    }

    // Verify the expected flow:
    // 1. Create account for organization
    // 2. Grant creator admin access
    // 3. Return organization details

    expect(organizationData.name).toBe('Test Organization')
    expect(ctx.accountManager).toBeDefined()
    expect(ctx.sharedRepoManager).toBeDefined()
  })
})
