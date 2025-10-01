// React Query hooks for repository collaboration operations
// These hooks manage server state for granting access, listing collaborators, etc.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuthContext } from '../auth/auth-provider.tsx'
import {
  grantRepositoryAccess,
  revokeRepositoryAccess,
  listRepositoryCollaborators,
  getRepositoryPermissions,
  type GrantAccessRequest,
  type GrantAccessResponse,
  type Collaborator,
  type ListCollaboratorsResponse,
  type GetPermissionsResponse,
} from '../services/collaboration-service.ts'

// Query key factory for collaboration-related queries
export const collaborationKeys = {
  all: ['collaboration'] as const,
  collaborators: (repoDid: string) => ['collaboration', 'collaborators', repoDid] as const,
  permissions: (repoDid: string, userDid?: string) =>
    ['collaboration', 'permissions', repoDid, userDid] as const,
}

/**
 * Hook to grant repository access to a user
 * Uses optimistic updates to immediately show the granted access in the UI
 */
export function useGrantAccessMutation() {
  const queryClient = useQueryClient()
  const auth = useAuthContext()

  return useMutation({
    mutationFn: async (request: GrantAccessRequest): Promise<GrantAccessResponse> => {
      if (!auth.signedIn || !auth.agent) {
        throw new Error('Must be signed in to grant repository access')
      }
      return await grantRepositoryAccess(request, auth.agent)
    },
    onMutate: async (request) => {
      // Cancel any outgoing refetches so they don't overwrite our optimistic update
      await queryClient.cancelQueries({
        queryKey: collaborationKeys.collaborators(request.repo),
      })

      // Snapshot the previous value
      const previousCollaborators = queryClient.getQueryData<ListCollaboratorsResponse>(
        collaborationKeys.collaborators(request.repo)
      )

      // Optimistically update the collaborators list
      if (previousCollaborators) {
        const optimisticCollaborator: Collaborator = {
          userDid: request.userDid,
          permissions: request.permissions,
          grantedBy: auth.signedIn ? auth.session.did : 'unknown',
          grantedAt: new Date().toISOString(),
        }

        queryClient.setQueryData<ListCollaboratorsResponse>(
          collaborationKeys.collaborators(request.repo),
          {
            ...previousCollaborators,
            collaborators: [...previousCollaborators.collaborators, optimisticCollaborator],
          }
        )
      }

      // Return a context object with the snapshotted value
      return { previousCollaborators }
    },
    onError: (error, request, context) => {
      // If the mutation fails, use the context returned from onMutate to roll back
      if (context?.previousCollaborators) {
        queryClient.setQueryData(
          collaborationKeys.collaborators(request.repo),
          context.previousCollaborators
        )
      }
      console.error('Failed to grant repository access:', error)
    },
    onSuccess: (data, request) => {
      console.log('Successfully granted repository access:', data)

      // Update the collaborators list with the actual server response
      queryClient.setQueryData<ListCollaboratorsResponse>(
        collaborationKeys.collaborators(request.repo),
        (old) => {
          if (!old) return { collaborators: [data.collaborator] }

          // Replace the optimistic update with the real data
          const updatedCollaborators = old.collaborators.map(collab =>
            collab.userDid === data.collaborator.userDid ? data.collaborator : collab
          )

          // If this is a new collaborator, add them
          if (!old.collaborators.some(c => c.userDid === data.collaborator.userDid)) {
            updatedCollaborators.push(data.collaborator)
          }

          return { ...old, collaborators: updatedCollaborators }
        }
      )
    },
    onSettled: (data, error, request) => {
      // Always refetch after error or success to ensure we have the latest data
      queryClient.invalidateQueries({
        queryKey: collaborationKeys.collaborators(request.repo),
      })
    },
  })
}

/**
 * Hook to revoke repository access from a user
 * Uses pessimistic updates - waits for server confirmation before updating UI
 */
export function useRevokeAccessMutation() {
  const queryClient = useQueryClient()
  const auth = useAuthContext()

  return useMutation({
    mutationFn: async ({ repoDid, userDid }: { repoDid: string; userDid: string }) => {
      if (!auth.signedIn || !auth.agent) {
        throw new Error('Must be signed in to revoke repository access')
      }
      return await revokeRepositoryAccess(repoDid, userDid, auth.agent)
    },
    onSuccess: (data, { repoDid, userDid }) => {
      console.log('Successfully revoked repository access:', data)

      // Remove the collaborator from the list
      queryClient.setQueryData<ListCollaboratorsResponse>(
        collaborationKeys.collaborators(repoDid),
        (old) => {
          if (!old) return old

          return {
            ...old,
            collaborators: old.collaborators.filter(collab => collab.userDid !== userDid),
          }
        }
      )
    },
    onError: (error) => {
      console.error('Failed to revoke repository access:', error)
    },
    onSettled: (data, error, { repoDid }) => {
      // Refetch to ensure we have the latest data
      queryClient.invalidateQueries({
        queryKey: collaborationKeys.collaborators(repoDid),
      })
    },
  })
}

/**
 * Hook to list all collaborators for a repository
 */
export function useListCollaboratorsQuery(repoDid: string, enabled = true) {
  const auth = useAuthContext()

  return useQuery({
    queryKey: collaborationKeys.collaborators(repoDid),
    queryFn: async (): Promise<ListCollaboratorsResponse> => {
      return await listRepositoryCollaborators(repoDid)
    },
    enabled: enabled && !!repoDid,
    staleTime: 30 * 1000, // Consider data fresh for 30 seconds
    cacheTime: 5 * 60 * 1000, // Keep in cache for 5 minutes
    retry: (failureCount, error) => {
      // Don't retry on authentication errors
      if (error instanceof Error && error.message.includes('authentication')) {
        return false
      }
      return failureCount < 3
    },
  })
}

/**
 * Hook to get permissions for a specific user on a repository
 */
export function useGetPermissionsQuery(repoDid: string, userDid?: string, enabled = true) {
  const auth = useAuthContext()

  const shouldEnable = enabled && !!repoDid && !!userDid

  console.log('[useGetPermissionsQuery] Debug:', {
    repoDid,
    userDid,
    enabled,
    shouldEnable,
    hasRepoDid: !!repoDid,
    hasUserDid: !!userDid,
    userDidType: typeof userDid,
    userDidValue: userDid
  })

  return useQuery({
    queryKey: collaborationKeys.permissions(repoDid, userDid),
    queryFn: async (): Promise<GetPermissionsResponse> => {
      console.log('[useGetPermissionsQuery] Running queryFn with:', { repoDid, userDid })
      return await getRepositoryPermissions(repoDid, userDid)
    },
    enabled: shouldEnable,
    staleTime: 60 * 1000, // Consider data fresh for 1 minute
    cacheTime: 10 * 60 * 1000, // Keep in cache for 10 minutes
    retry: (failureCount, error) => {
      // Don't retry on authentication errors
      if (error instanceof Error && error.message.includes('authentication')) {
        return false
      }
      return failureCount < 3
    },
  })
}

/**
 * Hook to get the current user's permissions for a repository
 * This is a convenience wrapper around useGetPermissionsQuery
 */
export function useMyPermissionsQuery(repoDid: string, enabled = true) {
  const auth = useAuthContext()
  const userDid = auth.signedIn ? auth.session.did : undefined

  return useGetPermissionsQuery(repoDid, userDid, enabled)
}

/**
 * Utility hook to check if the current user can manage a repository (grant/revoke access)
 */
export function useCanManageRepository(repoDid: string) {
  const auth = useAuthContext()
  const permissionsQuery = useMyPermissionsQuery(repoDid)

  // Primary check: if the repository DID matches the user DID, they own it
  const isDirectOwner = auth.signedIn && auth.session?.did === repoDid

  // If user is not signed in, they cannot manage
  if (!auth.signedIn) {
    return {
      canManage: false,
      isLoading: false,
      error: null,
      isDirectOwner: false,
    }
  }

  return {
    canManage: isDirectOwner ||
               permissionsQuery.data?.accessType === 'owner' ||
               permissionsQuery.data?.permissions?.admin === true,
    isLoading: permissionsQuery.isLoading,
    error: permissionsQuery.error,
    isDirectOwner,
  }
}

/**
 * Utility hook to invalidate all collaboration queries for a repository
 * Useful when you know data has changed and want to refresh everything
 */
export function useInvalidateCollaborationQueries() {
  const queryClient = useQueryClient()

  return (repoDid: string) => {
    queryClient.invalidateQueries({
      queryKey: collaborationKeys.collaborators(repoDid),
    })
    queryClient.invalidateQueries({
      queryKey: collaborationKeys.permissions(repoDid),
    })
  }
}