import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useAuthContext } from '../auth/auth-provider.tsx'
import {
  Repository,
  useRepositoryContext,
} from '../contexts/repository-context.tsx'
import {
  useCreateRecordMutation,
  useListOrganizationsQuery,
} from '../queries/use-sds-queries.ts'
import { retryApiCall } from '../utils/api-retry.ts'
import { Button } from './button.tsx'
import { Spinner } from './spinner.tsx'

export function RepositoryDashboard() {
  const auth = useAuthContext()
  const { session } = auth
  const { repositories, addRepository, setSelectedRepo } =
    useRepositoryContext()
  const [loading, setLoading] = useState(false)
  const [selectedRepo, setSelectedRepoLocal] = useState<string | null>(null)
  const [newPostText, setNewPostText] = useState('')
  const [showCreateOrg, setShowCreateOrg] = useState(false)
  const [newOrgName, setNewOrgName] = useState('')
  const [newOrgDescription, setNewOrgDescription] = useState('')

  const createRecordMutation = useCreateRecordMutation()
  const organizationsQuery = useListOrganizationsQuery()

  // Load existing organizations on component mount
  useEffect(() => {
    if (organizationsQuery.data && organizationsQuery.data.length > 0) {
      const existingOrgs: Repository[] = organizationsQuery.data.map(
        (record: any) => ({
          did: session?.did || '',
          handle:
            record.value.name.toLowerCase().replace(/\s+/g, '-') + '.sds.local',
          accessType: 'owner' as const,
          permissions: { read: true, write: true },
          collaboratorCount: 1,
        }),
      )

      // Add organizations that aren't already in the repository list
      existingOrgs.forEach((org) => {
        const exists = repositories.some(
          (repo) => repo.did === org.did && repo.handle === org.handle,
        )
        if (!exists) {
          addRepository(org)
        }
      })
    }
  }, [organizationsQuery.data, session?.did, repositories, addRepository])

  // Start with empty state - users will create their own organizations

  const createOrganization = async () => {
    if (!newOrgName.trim() || !session?.did) return

    setLoading(true)
    try {
      // Create a new organization using the SDS organization creation endpoint
      const response = await retryApiCall(async () => {
        return auth.agent?.call('com.sds.organization.create', undefined, {
          name: newOrgName.trim(),
          description: newOrgDescription.trim() || undefined,
        })
      })

      if (!response?.data) {
        throw new Error('No response data from organization creation')
      }

      const orgData = response.data

      // Add the new organization to the local state
      const newOrg: Repository = {
        did: orgData.did,
        handle: orgData.handle,
        accessType: orgData.accessType,
        permissions: orgData.permissions,
        collaboratorCount: 1,
      }

      addRepository(newOrg)
      setSelectedRepo(newOrg.did) // Auto-select the new organization
      setNewOrgName('')
      setNewOrgDescription('')
      setShowCreateOrg(false)

      // Invalidate the organizations query to refetch
      await queryClient.invalidateQueries({
        queryKey: ['sds', 'organizations'],
      })

      alert(`Organization "${orgData.name}" created successfully!

Repository: ${orgData.handle}
You are the owner with full admin privileges and can now invite collaborators.`)
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
          `Failed to create organization: ${error?.message || 'Unknown error'}. Please try again.`,
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">Your Organizations</h2>
        <div className="flex items-center space-x-4">
          <div className="text-sm text-gray-500">
            {repositories.length} organizations
          </div>
          <Button
            onClick={() => setShowCreateOrg(true)}
            size="small"
            disabled={loading}
          >
            Create Organization
          </Button>
        </div>
      </div>

      {/* Create Organization Modal */}
      {showCreateOrg && (
        <div className="rounded-lg border border-gray-300 bg-gray-50 p-4">
          <h3 className="mb-4 text-lg font-medium text-gray-900">
            Create New Organization
          </h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Organization Name *
              </label>
              <input
                type="text"
                value={newOrgName}
                onChange={(e) => setNewOrgName(e.target.value)}
                placeholder="Enter organization name"
                className="mt-1 w-full rounded-lg border border-gray-300 p-2 focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Description (optional)
              </label>
              <textarea
                value={newOrgDescription}
                onChange={(e) => setNewOrgDescription(e.target.value)}
                placeholder="Describe your organization"
                rows={3}
                className="mt-1 w-full rounded-lg border border-gray-300 p-2 focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div className="flex space-x-2">
              <Button
                onClick={createOrganization}
                disabled={!newOrgName.trim() || loading}
                size="small"
              >
                {loading ? <Spinner /> : 'Create'}
              </Button>
              <Button
                onClick={() => {
                  setShowCreateOrg(false)
                  setNewOrgName('')
                  setNewOrgDescription('')
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
            No organizations yet
          </h3>
          <p className="mb-4 text-gray-500">
            Create your first organization to start collaborating with others.
          </p>
          <Button onClick={() => setShowCreateOrg(true)}>
            Create Your First Organization
          </Button>
        </div>
      )}

      {/* Repository List */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {repositories.map((repo) => (
          <div
            key={repo.did}
            className={`cursor-pointer rounded-lg border-2 p-4 transition-all ${
              selectedRepo === repo.did
                ? 'border-blue-500 bg-blue-50'
                : 'border-gray-200 hover:border-gray-300'
            }`}
            onClick={() => setSelectedRepo(repo.did)}
          >
            <div className="mb-2 flex items-center justify-between">
              <h3 className="font-medium text-gray-900">{repo.handle}</h3>
              <span
                className={`rounded-full px-2 py-1 text-xs font-medium ${
                  repo.accessType === 'owner'
                    ? 'bg-green-100 text-green-800'
                    : repo.accessType === 'shared'
                      ? 'bg-blue-100 text-blue-800'
                      : 'bg-gray-100 text-gray-800'
                }`}
              >
                {repo.accessType}
              </span>
            </div>

            <div className="mb-2 text-xs text-gray-500">
              {repo.did.slice(0, 20)}...
            </div>

            <div className="flex items-center justify-between text-sm">
              <div className="flex space-x-2">
                <span
                  className={`rounded px-2 py-1 ${
                    repo.permissions.read
                      ? 'bg-green-100 text-green-700'
                      : 'bg-red-100 text-red-700'
                  }`}
                >
                  Read: {repo.permissions.read ? '✓' : '✗'}
                </span>
                <span
                  className={`rounded px-2 py-1 ${
                    repo.permissions.write
                      ? 'bg-green-100 text-green-700'
                      : 'bg-red-100 text-red-700'
                  }`}
                >
                  Write: {repo.permissions.write ? '✓' : '✗'}
                </span>
              </div>
              {repo.collaboratorCount && (
                <span className="text-gray-500">
                  {repo.collaboratorCount} collaborators
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Content Creation Panel */}
      {selectedRepo && (
        <div className="rounded-lg bg-gray-50 p-4">
          <h4 className="mb-3 font-medium text-gray-900">
            Create Content in{' '}
            {repositories.find((r) => r.did === selectedRepo)?.handle}
          </h4>

          {repositories.find((r) => r.did === selectedRepo)?.permissions
            .write ? (
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
    </div>
  )
}
