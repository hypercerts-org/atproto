export interface TrustedIssuer {
  issuer: string
  jwks: any
  metadata?: {
    name?: string
    description?: string
    contact?: string
  }
}

export interface OAuthConfig {
  trustedIssuers: TrustedIssuer[]
  resourceServerMetadata: {
    scopes: string[]
    documentation?: string
  }
}

export interface CrossServerOAuthVerifierOptions {
  trustedIssuers: TrustedIssuer[]
  dpopSecret?: string
  redis?: any
}

export interface OAuthAuthorizationServerMetadata {
  issuer: string
  jwks_uri: string
  authorization_endpoint: string
  token_endpoint: string
  [key: string]: any
}
