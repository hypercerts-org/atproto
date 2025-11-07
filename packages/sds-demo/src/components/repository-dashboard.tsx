import { useEffect, useMemo, useState } from 'react'
import { InvalidHandleError, ensureValidHandle } from '@atproto/syntax'
import { useAuthContext } from '../auth/auth-provider.tsx'
import { SDS_SERVER_URL } from '../constants.ts'
import {
  Repository,
  useRepositoryContext,
} from '../contexts/repository-context.tsx'
import {
  useCheckHandleAvailabilityQuery,
  useListOrganizationsQuery,
} from '../queries/use-sds-queries.ts'
import { RepositoryPermissions } from '../services/collaboration-service.ts'
import { retryApiCall } from '../utils/api-retry.ts'
import { Button } from './button.tsx'
import { CollaborationDebug } from './collaboration-debug.tsx'
import { CollaborationModal } from './collaboration-modal.tsx'
import { RepositoryCard } from './repository-card.tsx'
import { Spinner } from './spinner.tsx'

const normalizePermissions = (
  permissions?: Partial<RepositoryPermissions>,
): RepositoryPermissions => ({
  read: permissions?.read ?? false,
  create: permissions?.create ?? false,
  update: permissions?.update ?? false,
  delete: permissions?.delete ?? false,
  admin: permissions?.admin ?? false,
  owner: permissions?.owner ?? false,
})

const deriveAccessType = (
  rawAccessType: Repository['accessType'] | undefined,
  permissions: RepositoryPermissions,
): Repository['accessType'] => {
  if (permissions.owner) return 'owner'
  if (permissions.admin) return 'owner'
  if (
    permissions.read ||
    permissions.create ||
    permissions.update ||
    permissions.delete
  ) {
    return 'shared'
  }
  return rawAccessType ?? 'none'
}

export function RepositoryDashboard() {
  const auth = useAuthContext()
  const { session } = auth
  const { repositories, addRepository, setSelectedRepo } =
    useRepositoryContext()
  const [loading, setLoading] = useState(false)
  const [selectedRepo] = useState<string | null>(null)
  const [newPostText, setNewPostText] = useState('')
  const [showCreateOrg, setShowCreateOrg] = useState(false)
  const [newOrgName, setNewOrgName] = useState('')
  const [newOrgDescription, setNewOrgDescription] = useState('')
  const [handleValidationError, setHandleValidationError] = useState<
    string | null
  >(null)
  const [debouncedHandle, setDebouncedHandle] = useState<string | null>(null)
  const [collaborationModal, setCollaborationModal] = useState<{
    isOpen: boolean
    repositoryDid: string
    repositoryHandle: string
  }>({
    isOpen: false,
    repositoryDid: '',
    repositoryHandle: '',
  })

  const organizationsQuery = useListOrganizationsQuery()

  // Debounce handle input for availability checking (1 second delay)
  useEffect(() => {
    if (!newOrgName.trim()) {
      setDebouncedHandle(null)
      return
    }

    const sdsHostname = new URL(SDS_SERVER_URL).hostname
    const fullHandle = `${newOrgName.trim()}.${sdsHostname}`

    // Validate format first
    try {
      ensureValidHandle(fullHandle)
    } catch {
      // Invalid format - don't check availability
      setDebouncedHandle(null)
      return
    }

    const timer = setTimeout(() => {
      setDebouncedHandle(fullHandle)
    }, 1000)

    return () => clearTimeout(timer)
  }, [newOrgName])

  // Check handle availability (only when debounced handle is set and format is valid)
  const handleAvailabilityQuery = useCheckHandleAvailabilityQuery(
    debouncedHandle,
    debouncedHandle !== null && handleValidationError === null,
  )

  // Validate handle in real-time
  const handleOrgNameChange = (value: string) => {
    setNewOrgName(value)

    if (!value.trim()) {
      setHandleValidationError(null)
      return
    }

    // Construct the full repository handle with hostname suffix
    // Use hostname (not host) to exclude port number, as handles cannot contain ports
    const sdsHostname = new URL(SDS_SERVER_URL).hostname
    const fullHandle = `${value.trim()}.${sdsHostname}`

    // Validate the handle according to ATProto handle specification
    try {
      ensureValidHandle(fullHandle)
      setHandleValidationError(null)
    } catch (err) {
      if (err instanceof InvalidHandleError) {
        setHandleValidationError(err.message)
      } else {
        setHandleValidationError('Unknown validation error')
      }
    }
  }

  // Check if handle is valid (format valid AND available)
  const isHandleFormatValid =
    newOrgName.trim() !== '' && handleValidationError === null
  const isHandleTaken =
    debouncedHandle !== null &&
    !handleAvailabilityQuery.isFetching &&
    handleAvailabilityQuery.data === false
  const isHandleAvailable =
    debouncedHandle !== null && // Must have debounced (user stopped typing)
    !handleAvailabilityQuery.isFetching && // Must have finished checking
    handleAvailabilityQuery.data === true // Must be available
  const isHandleValid =
    isHandleFormatValid && isHandleAvailable && !isHandleTaken

  // Helper functions for collaboration modal
  const openCollaborationModal = (
    repositoryDid: string,
    repositoryHandle: string,
  ) => {
    setCollaborationModal({
      isOpen: true,
      repositoryDid,
      repositoryHandle,
    })
  }

  const closeCollaborationModal = () => {
    setCollaborationModal({
      isOpen: false,
      repositoryDid: '',
      repositoryHandle: '',
    })
  }

  // Normalize organizations returned from API for repository context
  useEffect(() => {
    if (!organizationsQuery.data || organizationsQuery.data.length === 0) {
      return
    }

    const existingOrgs: Repository[] = organizationsQuery.data.map(
      (org: any) => {
        const permissions = normalizePermissions(org.permissions)

        return {
          did: org.did,
          handle: org.handle,
          accessType: deriveAccessType(org.accessType, permissions),
          permissions,
          collaboratorCount: org.collaboratorCount ?? 1,
          isOwner: permissions.owner ?? false,
        }
      },
    )

    existingOrgs.forEach((org) => {
      const exists = repositories.some(
        (repo) => repo.did === org.did && repo.handle === org.handle,
      )
      if (!exists) {
        addRepository(org)
      }
    })
  }, [organizationsQuery.data, repositories, addRepository])

  // Start with empty state - users will create their own organizations

  const createOrganization = async () => {
    if (!newOrgName.trim() || !session?.did || !auth.agent) return

    setLoading(true)
    try {
      // Create a new shared repository on the SDS server using proper lexicon call
      const response = await retryApiCall(async () => {
        console.log('[SDS Demo] Creating organization for user:', session.did)

        // Send only the handle prefix - server will append hostname suffix
        const requestPayload = {
          name: newOrgName.trim(),
          handlePrefix: newOrgName.trim(), // Prefix only - server appends hostname
          description: newOrgDescription.trim() || undefined,
          creatorDid: session.did,
        }

        console.log(
          '[SDS Demo] Making organization creation request via agent...',
        )
        console.log('[SDS Demo] Request payload:', requestPayload)

        // Use the SDS agent to make the call with proper lexicon routing
        const agentResponse = await auth.agent.call(
          'com.sds.organization.create',
          undefined,
          requestPayload,
        )

        console.log(
          '[SDS Demo] Organization created successfully:',
          agentResponse.data,
        )
        return agentResponse
      })

      if (!response?.data) {
        throw new Error('No response data from organization creation')
      }

      const orgData = response.data
      const permissions = normalizePermissions(
        orgData.permissions ?? {
          read: true,
          create: true,
          update: true,
          delete: true,
          admin: true,
          owner: true,
        },
      )

      // Add the new organization to the local state
      const newOrg: Repository = {
        did: orgData.did,
        handle: orgData.handle,
        accessType: deriveAccessType(orgData.accessType, permissions),
        permissions,
        collaboratorCount: 1,
        isOwner: permissions.owner ?? false,
      }

      addRepository(newOrg)
      setSelectedRepo(newOrg.did)
      setNewOrgName('')
      setNewOrgDescription('')
      setHandleValidationError(null)
      setShowCreateOrg(false)

      alert(`Repository "${orgData.name}" created successfully!

Handle: ${orgData.handle}
You are the owner and can now invite collaborators to share this repository.`)
    } catch (error: any) {
      console.error('Error creating organization:', error)

      // Check if this is an OAuth/authentication error
      if (
        error?.message?.includes('Invalid identifier or password') ||
        error?.message?.includes('authentication') ||
        error?.status === 401
      ) {
        alert(
          'Authentication expired. Please sign out and sign back in to continue.',
        )
      } else {
        alert(
          `Failed to create repository: ${error?.message || 'Unknown error'}. Please try again.`,
        )
      }
    } finally {
      setLoading(false)
    }
  }

  const createPost = async (repoDid: string) => {
    if (!newPostText.trim()) return

    setLoading(true)
    try {
      // In a real app, this would call the SDS API
      // await agent.com.atproto.repo.createRecord({
      //   repo: repoDid,
      //   collection: 'app.bsky.feed.post',
      //   record: {
      //     text: newPostText,
      //     createdAt: new Date().toISOString(),
      //   },
      // })

      console.log(`Creating post in ${repoDid}:`, newPostText)
      setNewPostText('')
      alert(`Post created successfully in ${repoDid}!`)
    } catch (error) {
      console.error('Error creating post:', error)
      alert('Error creating post. Check console for details.')
    } finally {
      setLoading(false)
    }
  }

  const selectedRepository = useMemo(
    () => repositories.find((r) => r.did === selectedRepo),
    [repositories, selectedRepo],
  )

  return (
    <div className="space-y-6">
      {/* Debug Info */}
      <CollaborationDebug />

      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">
          Your Shared Repositories
        </h2>
        <div className="flex items-center space-x-4">
          <div className="text-sm text-gray-500">
            {repositories.length} repositories
          </div>
          <Button
            onClick={() => {
              setShowCreateOrg(true)
              setHandleValidationError(null)
            }}
            size="small"
            disabled={loading}
          >
            Create Repository
          </Button>
        </div>
      </div>

      {/* Create Shared Repository Modal */}
      {showCreateOrg && (
        <div className="rounded-lg border border-gray-300 bg-gray-50 p-4">
          <h3 className="mb-4 text-lg font-medium text-gray-900">
            Create Shared Repository
          </h3>
          <p className="mb-4 text-sm text-gray-600">
            Create a new repository on the SDS that you own and can share with
            collaborators.
          </p>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Repository Handle *
              </label>
              <input
                type="text"
                value={newOrgName}
                onChange={(e) => handleOrgNameChange(e.target.value)}
                placeholder="Enter repository handle"
                className={`mt-1 w-full rounded-lg border p-2 focus:outline-none ${
                  handleValidationError || isHandleTaken
                    ? 'border-red-500 focus:border-red-600'
                    : isHandleFormatValid &&
                        isHandleAvailable &&
                        !handleAvailabilityQuery.isFetching
                      ? 'border-green-500 focus:border-green-600'
                      : 'border-gray-300 focus:border-blue-500'
                }`}
              />
              <div className="mt-1 text-sm text-gray-600">
                Your repository handle will be:{' '}
                <span className="font-medium text-gray-900">
                  {newOrgName || '[handle]'}.{new URL(SDS_SERVER_URL).hostname}
                </span>
              </div>
              {handleValidationError && (
                <div className="mt-1 text-sm text-red-600">
                  <span className="font-medium">Invalid handle:</span>{' '}
                  {handleValidationError}
                </div>
              )}
              {isHandleFormatValid && (
                <>
                  {handleAvailabilityQuery.isFetching && (
                    <div className="mt-1 text-sm text-gray-500">
                      Checking availability...
                    </div>
                  )}
                  {isHandleTaken && (
                    <div className="mt-1 text-sm text-red-600">
                      <span className="font-medium">Handle already taken:</span>{' '}
                      This handle is already in use. Please choose another.
                    </div>
                  )}
                  {isHandleAvailable &&
                    !handleAvailabilityQuery.isFetching &&
                    debouncedHandle !== null && (
                      <div className="mt-1 text-sm text-green-600">
                        ✓ Valid handle and available
                      </div>
                    )}
                </>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Description (optional)
              </label>
              <textarea
                value={newOrgDescription}
                onChange={(e) => setNewOrgDescription(e.target.value)}
                placeholder="Describe your repository"
                rows={3}
                className="mt-1 w-full rounded-lg border border-gray-300 p-2 focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div className="flex space-x-2">
              <Button
                onClick={createOrganization}
                disabled={!isHandleValid || loading}
                size="small"
              >
                {loading ? <Spinner /> : 'Create Repository'}
              </Button>
              <Button
                onClick={() => {
                  setShowCreateOrg(false)
                  setNewOrgName('')
                  setNewOrgDescription('')
                  setHandleValidationError(null)
                }}
                size="small"
                disabled={loading}
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Empty State */}
      {repositories.length === 0 && !showCreateOrg && (
        <div className="rounded-lg border-2 border-dashed border-gray-300 p-8 text-center">
          <div className="mx-auto mb-4 h-12 w-12 text-gray-400">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
              />
            </svg>
          </div>
          <h3 className="mb-2 text-lg font-medium text-gray-900">
            No shared repositories yet
          </h3>
          <p className="mb-4 text-gray-500">
            Create your first shared repository to start collaborating with
            others.
          </p>
          <Button
            onClick={() => {
              setShowCreateOrg(true)
              setHandleValidationError(null)
            }}
          >
            Create Your First Repository
          </Button>
        </div>
      )}

      {/* Repository List */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {repositories.map((repo) => (
          <RepositoryCard
            key={repo.did}
            repository={repo}
            isSelected={selectedRepo === repo.did}
            onSelect={() => setSelectedRepo(repo.did)}
            onManageCollaborators={() =>
              openCollaborationModal(repo.did, repo.handle)
            }
          />
        ))}
      </div>

      {/* Content Creation Panel */}
      {selectedRepo && selectedRepository && (
        <div className="rounded-lg bg-gray-50 p-4">
          <h4 className="mb-3 font-medium text-gray-900">
            Create Content in {selectedRepository.handle}
          </h4>

          {selectedRepository.permissions &&
          (selectedRepository.permissions.create ||
            selectedRepository.permissions.update ||
            selectedRepository.permissions.delete) ? (
            <div className="space-y-3">
              <textarea
                value={newPostText}
                onChange={(e) => setNewPostText(e.target.value)}
                placeholder="What's happening?"
                className="w-full rounded-lg border border-gray-300 p-3 focus:border-blue-500 focus:outline-none"
                rows={3}
              />
              <div className="flex justify-end">
                <Button
                  onClick={() => createPost(selectedRepo)}
                  disabled={loading || !newPostText.trim()}
                  className="bg-blue-600 text-white hover:bg-blue-700"
                >
                  {loading ? <Spinner className="mr-2 h-4 w-4" /> : null}
                  Post
                </Button>
              </div>
            </div>
          ) : (
            <div className="rounded-lg bg-yellow-50 p-3 text-yellow-800">
              <p>You have read-only access to this repository.</p>
            </div>
          )}
        </div>
      )}

      {!selectedRepo && (
        <div className="rounded-lg bg-gray-50 p-6 text-center text-gray-500">
          <p>Select a repository to view details and create content</p>
        </div>
      )}

      {/* Collaboration Modal */}
      <CollaborationModal
        isOpen={collaborationModal.isOpen}
        onClose={closeCollaborationModal}
        repositoryDid={collaborationModal.repositoryDid}
        repositoryHandle={collaborationModal.repositoryHandle}
      />
    </div>
  )
}
