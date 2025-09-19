import { useState } from 'react'
import { useAuthContext } from '../auth/auth-provider.tsx'
import { useRepositoryContext } from '../contexts/repository-context.tsx'
import {
  type SdsPermissions,
  useGrantAccessMutation,
  useListCollaboratorsQuery,
  useRevokeAccessMutation,
} from '../queries/use-sds-queries.ts'
import { Button } from './button.tsx'
import { Spinner } from './spinner.tsx'

export function CollaborationPanel() {
  const { session } = useAuthContext()
  const { repositories, selectedRepo, setSelectedRepo } = useRepositoryContext()
  const [newCollaboratorDid, setNewCollaboratorDid] = useState('')
  const [newPermissions, setNewPermissions] = useState<SdsPermissions>({
    read: true,
    write: false,
  })

  // Use SDS queries - only if we have a selected repo
  const { data: collaborators = [], isLoading: collaboratorsLoading } =
    useListCollaboratorsQuery(selectedRepo, { enabled: !!selectedRepo })
  const grantAccessMutation = useGrantAccessMutation()
  const revokeAccessMutation = useRevokeAccessMutation()

  const grantAccess = async () => {
    if (!newCollaboratorDid.trim()) return

    try {
      await grantAccessMutation.mutateAsync({
        repo: selectedRepo,
        userDid: newCollaboratorDid,
        permissions: newPermissions,
      })

      setNewCollaboratorDid('')
      setNewPermissions({ read: true, write: false })
      alert(`Access granted to ${newCollaboratorDid}!`)
    } catch (error) {
      console.error('Error granting access:', error)
      alert('Error granting access. Check console for details.')
    }
  }

  const revokeAccess = async (userDid: string) => {
    try {
      await revokeAccessMutation.mutateAsync({
        repo: selectedRepo,
        userDid,
      })

      alert(`Access revoked from ${userDid}!`)
    } catch (error) {
      console.error('Error revoking access:', error)
      alert('Error revoking access. Check console for details.')
    }
  }

  const isLoading =
    grantAccessMutation.isPending || revokeAccessMutation.isPending

  return (
    <div className="space-y-6">
      {/* Repository Selection */}
      <div>
        <label className="mb-2 block text-sm font-medium text-gray-700">
          Select Repository
        </label>
        <select
          value={selectedRepo}
          onChange={(e) => setSelectedRepo(e.target.value)}
          className="w-full rounded-lg border border-gray-300 p-2 focus:border-blue-500 focus:outline-none"
        >
          <option value="">Select an organization...</option>
          {repositories.map((repo) => (
            <option key={repo.did} value={repo.did}>
              {repo.handle} ({repo.accessType === 'owner' ? 'Owner' : 'Shared'})
            </option>
          ))}
        </select>
      </div>

      {/* Empty State */}
      {!selectedRepo && (
        <div className="rounded-lg border-2 border-dashed border-gray-300 p-6 text-center">
          <div className="mx-auto mb-3 h-10 w-10 text-gray-400">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
              />
            </svg>
          </div>
          <h3 className="mb-2 text-sm font-medium text-gray-900">
            No organization selected
          </h3>
          <p className="text-sm text-gray-500">
            Select an organization above to manage its collaborators.
          </p>
        </div>
      )}

      {/* Grant Access Form */}
      {selectedRepo && (
        <div className="rounded-lg bg-gray-50 p-4">
          <h4 className="mb-4 font-medium text-gray-900">
            Grant Repository Access
          </h4>

          <div className="space-y-4">
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">
                User DID or Handle
              </label>
              <input
                type="text"
                value={newCollaboratorDid}
                onChange={(e) => setNewCollaboratorDid(e.target.value)}
                placeholder="did:plc:example123 or user.bsky.social"
                className="w-full rounded-lg border border-gray-300 p-2 focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">
                Permissions
              </label>
              <div className="space-y-2">
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={newPermissions.read}
                    onChange={(e) =>
                      setNewPermissions((prev) => ({
                        ...prev,
                        read: e.target.checked,
                      }))
                    }
                    className="mr-2"
                  />
                  <span className="text-sm">Read access</span>
                </label>
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={newPermissions.write}
                    onChange={(e) =>
                      setNewPermissions((prev) => ({
                        ...prev,
                        write: e.target.checked,
                      }))
                    }
                    className="mr-2"
                  />
                  <span className="text-sm">Write access</span>
                </label>
              </div>
            </div>

            <Button
              onClick={grantAccess}
              disabled={isLoading || !newCollaboratorDid.trim()}
              className="bg-green-600 text-white hover:bg-green-700"
            >
              {isLoading ? <Spinner className="mr-2 h-4 w-4" /> : null}
              Grant Access
            </Button>
          </div>
        </div>
      )}

      {/* Current Collaborators */}
      <div>
        <h4 className="mb-4 font-medium text-gray-900">
          Current Collaborators
        </h4>

        {collaboratorsLoading ? (
          <div className="flex justify-center p-8">
            <Spinner className="h-6 w-6" />
          </div>
        ) : collaborators.length > 0 ? (
          <div className="space-y-3">
            {collaborators.map((collaborator) => (
              <div
                key={collaborator.userDid}
                className="flex items-center justify-between rounded-lg border border-gray-200 p-4"
              >
                <div className="flex-1">
                  <div className="font-medium text-gray-900">
                    {collaborator.handle}
                  </div>
                  <div className="text-sm text-gray-500">
                    {collaborator.userDid.slice(0, 30)}...
                  </div>
                  <div className="mt-1 flex space-x-2">
                    <span
                      className={`rounded px-2 py-1 text-xs ${
                        collaborator.permissions.read
                          ? 'bg-green-100 text-green-700'
                          : 'bg-red-100 text-red-700'
                      }`}
                    >
                      Read: {collaborator.permissions.read ? '✓' : '✗'}
                    </span>
                    <span
                      className={`rounded px-2 py-1 text-xs ${
                        collaborator.permissions.write
                          ? 'bg-green-100 text-green-700'
                          : 'bg-red-100 text-red-700'
                      }`}
                    >
                      Write: {collaborator.permissions.write ? '✓' : '✗'}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-gray-400">
                    Granted on{' '}
                    {new Date(collaborator.grantedAt).toLocaleDateString()}
                  </div>
                </div>

                <Button
                  onClick={() => revokeAccess(collaborator.userDid)}
                  disabled={isLoading}
                  className="bg-red-600 text-white hover:bg-red-700"
                  size="small"
                >
                  {isLoading ? <Spinner className="h-3 w-3" /> : 'Revoke'}
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-lg bg-gray-50 p-6 text-center text-gray-500">
            <p>
              No collaborators yet. Grant access to users to start
              collaborating!
            </p>
          </div>
        )}
      </div>

      {/* Activity Feed */}
      <div>
        <h4 className="mb-4 font-medium text-gray-900">Recent Activity</h4>
        <div className="space-y-2">
          {collaborators.length === 0 ? (
            <div className="rounded-lg bg-gray-50 p-4 text-center text-sm text-gray-500">
              No activity yet. Invite collaborators to get started.
            </div>
          ) : (
            <div className="rounded-lg bg-gray-50 p-4 text-center text-sm text-gray-500">
              Activity feed will show collaboration events here.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
