// Repository Collaboration Service - Direct HTTP calls for collaboration
// This service handles granting, revoking, and listing repository access permissions

import { SDS_SERVER_URL } from '../constants.ts'

export interface RepositoryPermissions {
  read: boolean
  write: boolean
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
  agent: any
): Promise<GrantAccessResponse> {
  console.log('[CollabService] Granting access:', request)

  try {
    // The agent.call method expects (lexicon, params, data)
    // For procedures that take input in the body, pass undefined for params and the body data as the third argument
    const response = await agent.call('com.sds.repo.grantAccess', undefined, request)
    console.log('[CollabService] Access granted successfully:', response.data)
    return response.data
  } catch (error) {
    console.error('[CollabService] Grant access failed:', error)
    console.error('[CollabService] Error details:', {
      message: error?.message,
      status: error?.status,
      error: error?.error,
      response: error?.response?.data || error?.response
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
  agent: any
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
      response: error?.response?.data || error?.response
    })
    throw error
  }
}

/**
 * List all collaborators for a repository
 */
export async function listRepositoryCollaborators(
  repoDid: string,
  limit = 50,
  cursor?: string
): Promise<ListCollaboratorsResponse> {
  console.log('[CollabService] Listing collaborators:', { repoDid, limit, cursor })

  let url = `${SDS_SERVER_URL}/xrpc/com.sds.repo.listCollaborators?repo=${encodeURIComponent(repoDid)}&limit=${limit}`
  if (cursor) {
    url += `&cursor=${encodeURIComponent(cursor)}`
  }

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  })

  if (!response.ok) {
    const errorText = await response.text()
    console.error(`[CollabService] List collaborators failed: ${response.status} ${errorText}`)
    throw new Error(`HTTP ${response.status}: ${errorText}`)
  }

  const responseData: ListCollaboratorsResponse = await response.json()
  console.log('[CollabService] Collaborators listed successfully:', responseData)
  return responseData
}

/**
 * Get specific permissions for a user on a repository
 */
export async function getRepositoryPermissions(
  repoDid: string,
  userDid?: string
): Promise<GetPermissionsResponse> {
  console.log('[CollabService] Getting permissions:', { repoDid, userDid })

  // Backend requires userDid parameter
  if (!userDid) {
    throw new Error('userDid is required for getPermissions call')
  }

  let url = `${SDS_SERVER_URL}/xrpc/com.sds.repo.getPermissions?repo=${encodeURIComponent(repoDid)}&userDid=${encodeURIComponent(userDid)}`

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  })

  if (!response.ok) {
    const errorText = await response.text()
    console.error(`[CollabService] Get permissions failed: ${response.status} ${errorText}`)
    throw new Error(`HTTP ${response.status}: ${errorText}`)
  }

  const responseData: GetPermissionsResponse = await response.json()
  console.log('[CollabService] Permissions retrieved successfully:', responseData)
  return responseData
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
  if (permissions.write) return 'Read & Write'
  if (permissions.read) return 'Read Only'
  return 'No Access'
}