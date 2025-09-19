const { searchParams } = new URL(window.location.href)

// Inserted during build
declare const process: { env: { NODE_ENV: string } }

export const ENV = searchParams.get('env') ?? process.env.NODE_ENV

export const PLC_DIRECTORY_URL: string | undefined =
  searchParams.get('plc_directory_url') ??
  (ENV === 'development' ? 'http://localhost:2582' : undefined)

export const HANDLE_RESOLVER_URL: string =
  searchParams.get('handle_resolver') ??
  (ENV === 'development' ? 'http://localhost:2584' : 'https://bsky.social')

export const SIGN_UP_URL: string =
  searchParams.get('sign_up_url') ??
  (ENV === 'development' ? 'http://localhost:2583' : 'https://bsky.social')

// SDS server URL for development
export const SDS_SERVER_URL: string =
  searchParams.get('sds_server_url') ??
  (ENV === 'development' ? 'http://localhost:2585' : 'https://sds.example.com')

export const OAUTH_SCOPE: string =
  searchParams.get('scope') ??
  (ENV === 'development'
    ? [
        'atproto',
        'account:email',
        'identity:*',
        'repo:*',
        'include:com.atproto.moderation.basePermissions',
        // SDS-specific scopes for collaboration
        'include:com.sds.repo.grantAccess',
        'include:com.sds.repo.revokeAccess',
        'include:com.sds.repo.listCollaborators',
        'include:com.sds.repo.getPermissions',
        'include:com.sds.organization.create',
      ].join(' ')
    : [
        'atproto',
        'account:email',
        'account:status',
        'blob:*/*',
        'repo:*',
        'rpc:*?aud=did:web:bsky.app#bsky_appview',
      ].join(' '))
