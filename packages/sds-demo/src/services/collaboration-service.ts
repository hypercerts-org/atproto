// Repository Collaboration Service - Direct HTTP calls for collaboration
// This service handles granting, revoking, and listing repository access permissions

import { SDS_SERVER_URL } from '../constants.ts'

export interface RepositoryPermissions {
  read: boolean
  create: boolean
  update: boolean
  delete: boolean
  admin?: boolean
  owner?: boolean
}

export interface Collaborator {
  userDid: string
  handle?: string
  permissions: RepositoryPermissions
  grantedBy: string
  grantedAt: string
  revokedAt?: string
}

export interface GrantAccessRequest {
  repo: string // Repository DID or handle
  userDid: string
  permissions: RepositoryPermissions
}

export interface GrantAccessResponse {
  success: boolean
  grantedAt: string
  collaborator: Collaborator
}

export interface ListCollaboratorsResponse {
  collaborators: Collaborator[]
  cursor?: string
}

export interface GetPermissionsResponse {
  permissions: RepositoryPermissions
  accessType: 'owner' | 'shared' | 'none'
  grantedBy?: string
}

/**
 * Grant access to a repository for a specific user
 * Uses authenticated SDS agent for proper authorization
 */
export async function grantRepositoryAccess(
  request: GrantAccessRequest,
  agent: any,
): Promise<GrantAccessResponse> {
  console.log('[CollabService] Granting access:', request)

  try {
    // The agent.call method expects (lexicon, params, data)
    // For procedures that take input in the body, pass undefined for params and the body data as the third argument
    const response = await agent.call(
      'com.sds.repo.grantAccess',
      undefined,
      request,
    )
    console.log('[CollabService] Access granted successfully:', response.data)
    return response.data
  } catch (error) {
    console.error('[CollabService] Grant access failed:', error)
    console.error('[CollabService] Error details:', {
      message: error?.message,
      status: error?.status,
      error: error?.error,
      response: error?.response?.data || error?.response,
    })
    throw error
  }
}

/**
 * Revoke access from a repository for a specific user
 */
export async function revokeRepositoryAccess(
  repoDid: string,
  userDid: string,
  agent: any,
): Promise<{ success: boolean }> {
  console.log('[CollabService] Revoking access:', { repoDid, userDid })

  try {
    const response = await agent.call('com.sds.repo.revokeAccess', undefined, {
      repo: repoDid,
      userDid: userDid,
    })
    console.log('[CollabService] Access revoked successfully:', response.data)
    return response.data
  } catch (error) {
    console.error('[CollabService] Revoke access failed:', error)
    console.error('[CollabService] Revoke error details:', {
      message: error?.message,
      status: error?.status,
      error: error?.error,
      response: error?.response?.data || error?.response,
    })
    throw error
  }
}

/**
 * List all collaborators for a repository
 * Uses authenticated SDS agent for proper authorization
 */
export async function listRepositoryCollaborators(
  repoDid: string,
  agent: any,
  limit = 50,
  cursor?: string,
): Promise<ListCollaboratorsResponse> {
  console.log('[CollabService] Listing collaborators:', {
    repoDid,
    limit,
    cursor,
  })

  try {
    const params: any = {
      repo: repoDid,
      limit: limit,
    }
    if (cursor) {
      params.cursor = cursor
    }

    const response = await agent.call('com.sds.repo.listCollaborators', params)
    console.log(
      '[CollabService] Collaborators listed successfully:',
      response.data,
    )
    return response.data
  } catch (error) {
    console.error('[CollabService] List collaborators failed:', error)
    console.error('[CollabService] Error details:', {
      message: error?.message,
      status: error?.status,
      error: error?.error,
      response: error?.response?.data || error?.response,
    })
    throw error
  }
}

/**
 * Get specific permissions for a user on a repository
 * Uses authenticated SDS agent for proper authorization
 */
export async function getRepositoryPermissions(
  repoDid: string,
  agent: any,
  userDid?: string,
): Promise<GetPermissionsResponse> {
  console.log('[CollabService] Getting permissions:', { repoDid, userDid })

  // Backend requires userDid parameter
  if (!userDid) {
    throw new Error('userDid is required for getPermissions call')
  }

  try {
    const response = await agent.call('com.sds.repo.getPermissions', {
      repo: repoDid,
      userDid: userDid,
    })
    console.log(
      '[CollabService] Permissions retrieved successfully:',
      response.data,
    )
    const permissions = response.data.permissions || {}

    return {
      ...response.data,
      permissions: {
        read: permissions.read ?? false,
        create: permissions.create ?? false,
        update: permissions.update ?? false,
        delete: permissions.delete ?? false,
        admin: permissions.admin ?? false,
        owner: permissions.owner ?? false,
      },
    }
  } catch (error) {
    console.error('[CollabService] Get permissions failed:', error)
    console.error('[CollabService] Error details:', {
      message: error?.message,
      status: error?.status,
      error: error?.error,
      response: error?.response?.data || error?.response,
    })
    throw error
  }
}

/**
 * Utility function to validate DID format
 */
export function validateDid(did: string): boolean {
  return did.startsWith('did:') && did.length > 10
}

/**
 * Utility function to format collaborator display name
 */
export function formatCollaboratorName(collaborator: Collaborator): string {
  if (collaborator.handle) {
    return `@${collaborator.handle}`
  }
  return `${collaborator.userDid.slice(0, 20)}...`
}

/**
 * Utility function to get permission level display text
 */
export function getPermissionLevel(permissions: RepositoryPermissions): string {
  if (permissions.owner) return 'Owner'
  if (permissions.admin) return 'Admin'
  const hasWriteAccess =
    permissions.create === true ||
    permissions.update === true ||
    permissions.delete === true

  if (permissions.read && hasWriteAccess) return 'Read & Write'
  if (hasWriteAccess) return 'Write Only'
  if (permissions.read) return 'Read Only'
  return 'No Access'
}
