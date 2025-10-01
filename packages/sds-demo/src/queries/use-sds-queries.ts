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


// List organizations for the current user
export function useListOrganizationsQuery() {
  const auth = useAuthContext()

  return useQuery({
    queryKey: ['sds', 'organizations'],
    queryFn: async (): Promise<any[]> => {
      if (!auth.signedIn || !auth.session?.did || !auth.agent) throw new Error('No authenticated user or agent')

      try {
        // Use the SDS agent to make the call with proper lexicon routing
        const response = await auth.agent.call('com.sds.organization.list', {
          userDid: auth.session.did,
        })

        console.log('[SDS Demo] Fetched organizations:', response.data)
        return response.data.organizations || []
      } catch (error) {
        console.error('Error fetching organizations:', error)
        // Return empty array for graceful fallback
        return []
      }
    },
    enabled: auth.signedIn && !!auth.session?.did && !!auth.agent,
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
