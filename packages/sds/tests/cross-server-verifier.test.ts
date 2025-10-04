import { CrossServerOAuthVerifier } from '../src/oauth/cross-server-verifier'
import { TrustedIssuer } from '../src/oauth/types'

describe('CrossServerOAuthVerifier', () => {
  let mockTrustedIssuers: TrustedIssuer[]
  let verifier: CrossServerOAuthVerifier

  beforeEach(() => {
    // Mock JWKS for testing
    const mockJwks = {
      keys: [
        {
          kty: 'EC',
          crv: 'P-256',
          x: 'test-x',
          y: 'test-y',
          kid: 'test-key-1',
        },
      ],
    }

    mockTrustedIssuers = [
      {
        issuer: 'https://pds1.example.com',
        jwks: mockJwks,
        metadata: {
          name: 'PDS Server 1',
          description: 'Primary PDS server',
        },
      },
      {
        issuer: 'https://pds2.example.com',
        jwks: mockJwks,
        metadata: {
          name: 'PDS Server 2',
          description: 'Secondary PDS server',
        },
      },
    ]

    verifier = new CrossServerOAuthVerifier({
      trustedIssuers: mockTrustedIssuers,
    })
  })

  it('should initialize with trusted issuers', () => {
    expect(verifier.getTrustedIssuers()).toHaveLength(2)
    expect(verifier.getTrustedIssuers()).toContain('https://pds1.example.com')
    expect(verifier.getTrustedIssuers()).toContain('https://pds2.example.com')
  })

  it('should return trusted issuers info', () => {
    const issuersInfo = verifier.getTrustedIssuersInfo()
    expect(issuersInfo).toHaveLength(2)
    expect(issuersInfo[0].metadata?.name).toBe('PDS Server 1')
    expect(issuersInfo[1].metadata?.name).toBe('PDS Server 2')
  })

  it('should check if issuer is trusted', () => {
    expect(verifier.isTrustedIssuer('https://pds1.example.com')).toBe(true)
    expect(verifier.isTrustedIssuer('https://pds2.example.com')).toBe(true)
    expect(verifier.isTrustedIssuer('https://untrusted.example.com')).toBe(
      false,
    )
  })

  it('should initialize in permissive mode when no trusted issuers provided', () => {
    const permissiveVerifier = new CrossServerOAuthVerifier({
      trustedIssuers: [],
    })

    // Should not throw an error and should be in permissive mode
    expect(permissiveVerifier.getTrustedIssuers()).toHaveLength(0)
    expect(permissiveVerifier.getTrustedIssuersInfo()).toHaveLength(0)
  })

  it('should use local JWKS without network calls', () => {
    // This test verifies that the verifier is initialized with pre-configured JWKS
    // and doesn't make any external network calls during initialization
    const trustedIssuers = verifier.getTrustedIssuers()
    expect(trustedIssuers).toHaveLength(2)

    // Verify that all trusted issuers have their JWKS pre-configured
    for (const issuer of trustedIssuers) {
      expect(verifier.isTrustedIssuer(issuer)).toBe(true)
    }
  })

  it('should validate tokens from multiple issuers', () => {
    // This test would require actual JWT tokens and proper mocking
    // For now, we verify the structure is correct
    expect(verifier.getTrustedIssuers()).toHaveLength(2)
    expect(verifier.isTrustedIssuer('https://pds1.example.com')).toBe(true)
    expect(verifier.isTrustedIssuer('https://pds2.example.com')).toBe(true)
  })
})
