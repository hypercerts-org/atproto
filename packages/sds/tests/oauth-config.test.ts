import { OAuthConfigManager } from '../src/oauth/oauth-config'
import { OAuthConfig, TrustedIssuer } from '../src/oauth/types'

describe('OAuthConfigManager', () => {
  let mockConfig: OAuthConfig
  let configManager: OAuthConfigManager

  beforeEach(() => {
    const mockTrustedIssuers: TrustedIssuer[] = [
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
      {
        issuer: 'https://pds2.example.com',
        jwks: {
          keys: [
            {
              kty: 'EC',
              crv: 'P-256',
              x: 'test-x-2',
              y: 'test-y-2',
              kid: 'key-2',
            },
          ],
        },
        metadata: {
          name: 'PDS Server 2',
          description: 'Secondary PDS server',
          contact: 'admin@pds2.example.com',
        },
      },
    ]

    mockConfig = {
      trustedIssuers: mockTrustedIssuers,
      resourceServerMetadata: {
        scopes: ['atproto', 'sds:read', 'sds:write', 'sds:admin'],
        documentation: 'https://atproto.com/specs/sds',
      },
    }

    configManager = new OAuthConfigManager(mockConfig)
  })

  it('should initialize with trusted issuers', () => {
    expect(configManager.getTrustedIssuers()).toHaveLength(2)
    expect(configManager.getTrustedIssuers()).toContain(
      'https://pds1.example.com',
    )
    expect(configManager.getTrustedIssuers()).toContain(
      'https://pds2.example.com',
    )
  })

  it('should return trusted issuers list', () => {
    const trustedIssuers = configManager.getTrustedIssuers()
    expect(trustedIssuers).toEqual([
      'https://pds1.example.com',
      'https://pds2.example.com',
    ])
  })

  it('should check if issuer is trusted', () => {
    expect(configManager.isTrustedIssuer('https://pds1.example.com')).toBe(true)
    expect(configManager.isTrustedIssuer('https://pds2.example.com')).toBe(true)
    expect(configManager.isTrustedIssuer('https://untrusted.example.com')).toBe(
      false,
    )
  })

  it('should return resource server metadata', () => {
    const metadata = configManager.getResourceServerMetadata()
    expect(metadata.scopes).toEqual([
      'atproto',
      'sds:read',
      'sds:write',
      'sds:admin',
    ])
    expect(metadata.documentation).toBe('https://atproto.com/specs/sds')
  })

  it('should return trusted issuer information', () => {
    const issuerInfo = configManager.getTrustedIssuer(
      'https://pds1.example.com',
    )
    expect(issuerInfo).toBeDefined()
    expect(issuerInfo?.metadata?.name).toBe('PDS Server 1')
    expect(issuerInfo?.metadata?.description).toBe('Primary PDS server')
    expect(issuerInfo?.metadata?.contact).toBe('admin@pds1.example.com')
  })

  it('should return undefined for untrusted issuer', () => {
    const issuerInfo = configManager.getTrustedIssuer(
      'https://untrusted.example.com',
    )
    expect(issuerInfo).toBeUndefined()
  })

  it('should return detailed trusted issuers info', () => {
    const issuersInfo = configManager.getTrustedIssuersInfo()
    expect(issuersInfo).toHaveLength(2)
    expect(issuersInfo[0].issuer).toBe('https://pds1.example.com')
    expect(issuersInfo[1].issuer).toBe('https://pds2.example.com')
  })

  it('should return the full configuration', () => {
    const config = configManager.getConfig()
    expect(config).toEqual(mockConfig)
    expect(config.trustedIssuers).toHaveLength(2)
    expect(config.resourceServerMetadata.scopes).toHaveLength(4)
  })
})
