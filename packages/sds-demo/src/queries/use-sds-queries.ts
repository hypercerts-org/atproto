import { useMutation, useQuery } from '@tanstack/react-query'
import { useAuthContext } from '../auth/auth-provider.tsx'
import { RepositoryPermissions } from '../services/collaboration-service.ts'

// Check if a handle is available (not taken)
export function useCheckHandleAvailabilityQuery(
  handle: string | null,
  enabled: boolean,
) {
  const auth = useAuthContext()

  return useQuery({
    queryKey: ['sds', 'handle-availability', handle],
    queryFn: async (): Promise<boolean> => {
      if (!handle || !auth.signedIn || !auth.agent) {
        throw new Error('Handle or agent not available')
      }

      try {
        // Try to resolve the handle - if it succeeds, handle is taken
        await auth.agent.call('com.atproto.identity.resolveHandle', {
          handle,
        })
        // If resolveHandle succeeds, handle is taken
        return false
      } catch (error: any) {
        // If resolveHandle fails with "Unable to resolve handle", handle is available
        if (
          error?.message?.includes('Unable to resolve handle') ||
          error?.status === 400
        ) {
          return true
        }
        // Re-throw other errors
        throw error
      }
    },
    enabled: enabled && !!handle && auth.signedIn && !!auth.agent,
    retry: false, // Don't retry availability checks
    staleTime: 30 * 1000, // Consider availability fresh for 30 seconds
  })
}

export interface SdsCollaborator {
  userDid: string
  handle?: string
  permissions: RepositoryPermissions
  grantedBy: string
  grantedAt: string
}

export interface SdsPermissionInfo {
  permissions: RepositoryPermissions
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
        if (!auth.session?.did) {
          throw new Error('No authenticated DID available')
        }

        const response = await auth.agent.call('com.sds.repo.getPermissions', {
          repo: repoDid,
          userDid: auth.session.did,
        })

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
        console.error('Error fetching permissions:', error)
        // Return no permissions for greenfield demo
        return {
          permissions: {
            read: false,
            create: false,
            update: false,
            delete: false,
            admin: false,
            owner: false,
          },
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
      if (!auth.signedIn || !auth.session?.did || !auth.agent)
        throw new Error('No authenticated user or agent')

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
    // Retry with exponential backoff, but don't retry on session/token errors
    retry: (failureCount, error) => {
      if (error instanceof Error) {
        const errorMsg = error.message.toLowerCase()
        if (
          errorMsg.includes('authentication') ||
          errorMsg.includes('token') ||
          errorMsg.includes('session was deleted')
        ) {
          return false
        }
      }
      return failureCount < 3
    },
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
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
