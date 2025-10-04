import { AtpAgent } from '@atproto/api'
import { TestNetworkWithSds } from '@atproto/dev-env'
import { CrossServerOAuthVerifier } from '../src/oauth/cross-server-verifier'
import { OAuthConfigManager } from '../src/oauth/oauth-config'

describe('OAuth Integration', () => {
  let network: TestNetworkWithSds
  let agent: AtpAgent
  let repoOwner: { did: string; agent: AtpAgent }
  let collaborator: { did: string; agent: AtpAgent }

  beforeAll(async () => {
    // Configure trusted issuers directly through config object
    const trustedIssuersConfig = [
      {
        issuer: 'https://pds1.example.com',
        jwks: {
          keys: [
            {
              kty: 'EC',
              crv: 'P-256',
              x: 'test-x-1',
              y: 'test-y-1',
              kid: 'key-1',
            },
          ],
        },
        metadata: {
          name: 'PDS Server 1',
          description: 'Primary PDS server',
          contact: 'admin@pds1.example.com',
        },
      },
    ]

    network = await TestNetworkWithSds.create({
      dbPostgresSchema: 'oauth_integration_test',
      sds: {
        trustedOAuthIssuersConfig: JSON.stringify(trustedIssuersConfig),
      },
    })

    // Create test users on PDS (account management is still handled by PDS)
    const adminHeaders = await network.adminHeaders()
    const pdsAgent = network.pds.getClient()
    agent = network.sds.getClient()

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

  describe('OAuth Configuration Integration', () => {
    it('should have OAuth components in SDS context', () => {
      const ctx = network.sds.ctx
      expect(ctx.oauthConfigManager).toBeDefined()
      expect(ctx.crossServerVerifier).toBeDefined()
    })

    it('should have OAuth configuration manager with trusted issuers', () => {
      const configManager = network.sds.ctx.oauthConfigManager
      expect(configManager).toBeInstanceOf(OAuthConfigManager)

      const trustedIssuers = configManager.getTrustedIssuers()
      expect(Array.isArray(trustedIssuers)).toBe(true)
    })

    it('should have static multi-issuer OAuth verifier', () => {
      const verifier = network.sds.ctx.crossServerVerifier
      expect(verifier).toBeInstanceOf(CrossServerOAuthVerifier)

      const trustedIssuers = verifier.getTrustedIssuers()
      expect(Array.isArray(trustedIssuers)).toBe(true)
    })

    it('should support resource server metadata', () => {
      const configManager = network.sds.ctx.oauthConfigManager
      const metadata = configManager.getResourceServerMetadata()

      expect(metadata.scopes).toEqual([
        'atproto',
        'sds:read',
        'sds:write',
        'sds:admin',
      ])
      expect(metadata.documentation).toBe('https://atproto.com/specs/sds')
    })
  })

  describe('SDS Server OAuth Integration', () => {
    it('should have OAuth configuration in server config', () => {
      const cfg = network.sds.ctx.cfg
      expect(cfg.oauth.trustedIssuersConfig).toBeDefined()
      expect(Array.isArray(cfg.oauth.trustedIssuersConfig)).toBe(true)
    })

    it('should support development mode configuration', () => {
      const cfg = network.sds.ctx.cfg
      expect(cfg.service.devMode).toBeDefined()
    })

    it('should have OAuth components properly initialized', () => {
      const ctx = network.sds.ctx
      expect(ctx.oauthConfigManager).toBeDefined()
      expect(ctx.crossServerVerifier).toBeDefined()

      // Verify they are properly connected
      const configManager = ctx.oauthConfigManager
      const verifier = ctx.crossServerVerifier

      expect(configManager.getTrustedIssuers()).toEqual(
        verifier.getTrustedIssuers(),
      )
    })
  })

  describe('Cross-Server Authentication', () => {
    it('should support tokens from trusted issuers', () => {
      const verifier = network.sds.ctx.crossServerVerifier
      const trustedIssuers = verifier.getTrustedIssuers()

      expect(Array.isArray(trustedIssuers)).toBe(true)
      expect(verifier.isTrustedIssuer).toBeInstanceOf(Function)
    })

    it('should reject tokens from untrusted issuers', () => {
      const verifier = network.sds.ctx.crossServerVerifier
      const untrustedIssuer = 'https://untrusted.example.com'

      expect(verifier.isTrustedIssuer(untrustedIssuer)).toBe(false)
    })

    it('should provide detailed issuer information', () => {
      const verifier = network.sds.ctx.crossServerVerifier
      const issuersInfo = verifier.getTrustedIssuersInfo()

      expect(Array.isArray(issuersInfo)).toBe(true)
      if (issuersInfo.length > 0) {
        expect(issuersInfo[0]).toHaveProperty('issuer')
        expect(issuersInfo[0]).toHaveProperty('jwks')
        expect(issuersInfo[0]).toHaveProperty('metadata')
      }
    })
  })

  describe('SDS API with OAuth', () => {
    it('should allow repository owner to create organization', async () => {
      const response = await repoOwner.agent.api.com.sds.organization.create(
        {
          name: 'Test Organization',
          description: 'A test organization for OAuth integration',
        },
        { headers: await repoOwner.agent.getHeaders() },
      )

      expect(response.data).toBeDefined()
      expect(response.data.organization).toBeDefined()
      expect(response.data.organization.name).toBe('Test Organization')
    })

    it('should allow repository owner to grant access', async () => {
      // First create an organization
      const orgResponse = await repoOwner.agent.api.com.sds.organization.create(
        {
          name: 'Test Organization for Access',
          description: 'A test organization for access testing',
        },
        { headers: await repoOwner.agent.getHeaders() },
      )

      const orgDid = orgResponse.data.organization.did

      // Grant access to collaborator
      const accessResponse = await repoOwner.agent.api.com.sds.repo.grantAccess(
        {
          repo: orgDid,
          user: collaborator.did,
          permissions: ['read', 'write'],
        },
        { headers: await repoOwner.agent.getHeaders() },
      )

      expect(accessResponse.data).toBeDefined()
      expect(accessResponse.data.success).toBe(true)
    })
  })
})
