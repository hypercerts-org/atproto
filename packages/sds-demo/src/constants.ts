const { searchParams } = new URL(window.location.href)

// Inserted during build
declare const process: { env: { NODE_ENV: string } }

// Force development mode when running on localhost
const isLocalhost =
  window.location.hostname === 'localhost' ||
  window.location.hostname === '127.0.0.1'

export const ENV =
  searchParams.get('env') ??
  (isLocalhost ? 'development' : process.env.NODE_ENV)

export const PLC_DIRECTORY_URL: string | undefined =
  searchParams.get('plc_directory_url') ??
  (ENV === 'development' ? 'http://localhost:2582' : undefined)

export const HANDLE_RESOLVER_URL: string =
  searchParams.get('handle_resolver') ??
  (ENV === 'development' ? 'http://localhost:2584' : 'https://bsky.social')

export const SIGN_UP_URL: string =
  searchParams.get('sign_up_url') ??
  (ENV === 'development' ? 'http://localhost:2583' : 'https://bsky.social') // Use PDS server for user auth

// SDS server URL for development
export const SDS_SERVER_URL: string =
  searchParams.get('sds_server_url') ??
  (ENV === 'development' ? 'http://localhost:2585' : 'https://sds.example.com')

// OAuth scopes for PDS authentication
// Note: These scopes are issued by PDS but NOT validated by SDS during authorization.
// SDS uses federated JWT validation (fetches JWKS from PDS) to verify token authenticity,
// then authorizes access solely based on SDS database permissions.
export const OAUTH_SCOPE: string =
  searchParams.get('scope') ??
  (ENV === 'development'
    ? [
        'atproto',
        'account:email',
        'identity:*',
        'repo:*',
        'include:com.atproto.moderation.basePermissions',
      ].join(' ')
    : [
        'atproto',
        'account:email',
        'account:status',
        'blob:*/*',
        'repo:*',
        'rpc:*?aud=did:web:bsky.app#bsky_appview',
      ].join(' '))

// Debug logging for configuration
console.log('[SDS Demo Config]', {
  ENV,
  isLocalhost,
  hostname: window.location.hostname,
  origin: window.location.origin,
  PLC_DIRECTORY_URL,
  HANDLE_RESOLVER_URL,
  SIGN_UP_URL,
  SDS_SERVER_URL,
})
