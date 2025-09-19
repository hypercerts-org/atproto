import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuthContext } from '../auth/auth-provider.tsx'

export interface SdsPermissions {
  read: boolean
  write: boolean
}

export interface SdsCollaborator {
  userDid: string
  handle?: string
  permissions: SdsPermissions
  grantedBy: string
  grantedAt: string
}

export interface SdsPermissionInfo {
  permissions: SdsPermissions
  accessType: 'owner' | 'shared' | 'none'
  grantedBy?: string
}

// Get user's permissions for a repository
export function useGetPermissionsQuery(repoDid: string) {
  const auth = useAuthContext()

  return useQuery({
    queryKey: ['sds', 'permissions', repoDid],
    queryFn: async (): Promise<SdsPermissionInfo> => {
      if (!auth.signedIn || !auth.agent) throw new Error('No agent available')

      try {
        const response = await auth.agent.call('com.sds.repo.getPermissions', {
          repo: repoDid,
        })
        return response.data
      } catch (error) {
        console.error('Error fetching permissions:', error)
        // Return no permissions for greenfield demo
        return {
          permissions: { read: false, write: false },
          accessType: 'none',
        }
      }
    },
    enabled: auth.signedIn && !!auth.agent && !!repoDid,
  })
}

// List collaborators for a repository
export function useListCollaboratorsQuery(
  repoDid: string,
  options?: { enabled?: boolean },
) {
  const auth = useAuthContext()

  return useQuery({
    queryKey: ['sds', 'collaborators', repoDid],
    queryFn: async (): Promise<SdsCollaborator[]> => {
      if (!auth.signedIn || !auth.agent) throw new Error('No agent available')

      try {
        const response = await auth.agent.call(
          'com.sds.repo.listCollaborators',
          {
            repo: repoDid,
          },
        )
        return response.data.collaborators
      } catch (error) {
        console.error('Error fetching collaborators:', error)
        // Return empty array for greenfield demo
        return []
      }
    },
    enabled:
      (options?.enabled ?? true) && auth.signedIn && !!auth.agent && !!repoDid,
  })
}

// Grant access mutation
export function useGrantAccessMutation() {
  const auth = useAuthContext()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      repo,
      userDid,
      permissions,
    }: {
      repo: string
      userDid: string
      permissions: SdsPermissions
    }) => {
      if (!auth.signedIn || !auth.agent) throw new Error('No agent available')

      try {
        return await auth.agent.call('com.sds.repo.grantAccess', {
          repo,
          userDid,
          permissions,
        })
      } catch (error) {
        console.error('Error granting access:', error)
        throw error
      }
    },
    onSuccess: (_, variables) => {
      // Invalidate and refetch collaborators list
      queryClient.invalidateQueries({
        queryKey: ['sds', 'collaborators', variables.repo],
      })
    },
  })
}

// Revoke access mutation
export function useRevokeAccessMutation() {
  const auth = useAuthContext()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      repo,
      userDid,
    }: {
      repo: string
      userDid: string
    }) => {
      if (!auth.signedIn || !auth.agent) throw new Error('No agent available')

      try {
        return await auth.agent.call('com.sds.repo.revokeAccess', {
          repo,
          userDid,
        })
      } catch (error) {
        console.error('Error revoking access:', error)
        throw error
      }
    },
    onSuccess: (_, variables) => {
      // Invalidate and refetch collaborators list
      queryClient.invalidateQueries({
        queryKey: ['sds', 'collaborators', variables.repo],
      })
    },
  })
}

// Create record in shared repository
export function useCreateRecordMutation() {
  const auth = useAuthContext()

  return useMutation({
    mutationFn: async ({
      repo,
      collection,
      record,
    }: {
      repo: string
      collection: string
      record: any
    }) => {
      if (!auth.signedIn || !auth.agent) throw new Error('No agent available')

      try {
        return await auth.agent.call(
          'com.atproto.repo.createRecord',
          undefined,
          {
            repo,
            collection,
            record,
          },
        )
      } catch (error) {
        console.error('Error creating record:', error)
        throw error
      }
    },
  })
}
