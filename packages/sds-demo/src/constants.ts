const { searchParams } = new URL(window.location.href)

// Inserted during build
declare const process: {
  env: {
    NODE_ENV: string
    PLC_DIRECTORY_URL?: string
    HANDLE_RESOLVER_URL?: string
    SIGN_UP_URL?: string
    SDS_SERVER_URL?: string
  }
}

// Force development mode when running on localhost
const isLocalhost =
  window.location.hostname === 'localhost' ||
  window.location.hostname === '127.0.0.1'

export const ENV =
  searchParams.get('env') ??
  (isLocalhost ? 'development' : process.env.NODE_ENV)

export const PLC_DIRECTORY_URL: string | undefined =
  searchParams.get('plc_directory_url') ??
  process.env.PLC_DIRECTORY_URL ??
  (ENV === 'development' ? 'http://localhost:2582' : 'https://plc.directory')

export const HANDLE_RESOLVER_URL: string =
  searchParams.get('handle_resolver') ??
  process.env.HANDLE_RESOLVER_URL ??
  (ENV === 'development' ? 'http://localhost:2584' : 'https://bsky.social')

export const SIGN_UP_URL: string =
  searchParams.get('sign_up_url') ??
  process.env.SIGN_UP_URL ??
  (ENV === 'development' ? 'http://localhost:2583' : 'https://bsky.social')

// SDS server URL - must be configured via env var in production
export const SDS_SERVER_URL: string =
  searchParams.get('sds_server_url') ??
  process.env.SDS_SERVER_URL ??
  (ENV === 'development' ? 'http://localhost:2585' : '')

// OAuth scopes for PDS authentication
// Note: These scopes are issued by PDS but NOT validated by SDS during authorization.
// SDS uses federated JWT validation (fetches JWKS from PDS) to verify token authenticity,
// then authorizes access solely based on SDS database permissions.
// Note: include:com.atproto.moderation.basePermissions is only available in local dev environment
// (localhost:2583) where the lexicon is registered via dev-env service profile.
// External PDS instances don't have this lexicon, so we only include it for localhost.
const isLocalDevPds =
  ENV === 'development' &&
  (SIGN_UP_URL.includes('localhost') || SIGN_UP_URL.includes('127.0.0.1'))

export const OAUTH_SCOPE: string =
  searchParams.get('scope') ??
  [
    // Basic atproto scope - required for all AT Protocol operations
    'atproto',
    // Read account email address - used to display user email in UI
    'account:email',
    // Repository operations - needed for creating records in shared repositories
    // via com.atproto.repo.createRecord and reading records via com.atproto.repo.getRecord
    'repo:*',
    // Only include moderation permissions lexicon if using local dev PDS
    // (this lexicon is only registered in dev-env lexicon authority)
    ...(isLocalDevPds
      ? ['include:com.atproto.moderation.basePermissions']
      : []),
  ].join(' ')

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
