// Repository Collaboration Modal - Manage repository access and collaborators
import { useState } from 'react'
import {
  useCanManageRepository,
  useGrantAccessMutation,
  useListCollaboratorsQuery,
  useRevokeAccessMutation,
} from '../queries/use-collaboration-queries.ts'
import {
  type RepositoryPermissions,
  formatCollaboratorName,
  getPermissionLevel,
  validateDid,
} from '../services/collaboration-service.ts'
import { Button } from './button.tsx'
import { Spinner } from './spinner.tsx'

interface CollaborationModalProps {
  isOpen: boolean
  onClose: () => void
  repositoryDid: string
  repositoryHandle: string
}

export function CollaborationModal({
  isOpen,
  onClose,
  repositoryDid,
  repositoryHandle,
}: CollaborationModalProps) {
  const [activeTab, setActiveTab] = useState<'collaborators' | 'add'>(
    'collaborators',
  )
  const [userDid, setUserDid] = useState('')
  const [permissions, setPermissions] = useState<RepositoryPermissions>({
    read: true,
    write: false,
  })
  const [selectedRole, setSelectedRole] = useState<
    'viewer' | 'contributor' | 'admin'
  >('viewer')

  // Role definitions for collaborators (owner role is handled separately)
  const roles = {
    viewer: {
      name: 'Viewer',
      description: 'Can view repository content',
      permissions: { read: true, write: false, admin: false },
    },
    contributor: {
      name: 'Contributor',
      description: 'Can view and modify repository content',
      permissions: { read: true, write: true, admin: false },
    },
    admin: {
      name: 'Admin',
      description: 'Full access including user management',
      permissions: { read: true, write: true, admin: true },
    },
  }

  // Query hooks
  const collaboratorsQuery = useListCollaboratorsQuery(repositoryDid, isOpen)
  const {
    canManage,
    isDirectOwner,
    isLoading: canManageLoading,
  } = useCanManageRepository(repositoryDid)

  // Mutation hooks
  const grantAccessMutation = useGrantAccessMutation()
  const revokeAccessMutation = useRevokeAccessMutation()

  if (!isOpen) return null

  const handleGrantAccess = async () => {
    if (!validateDid(userDid.trim())) {
      alert('Please enter a valid DID (must start with "did:")')
      return
    }

    try {
      const rolePermissions = roles[selectedRole].permissions
      await grantAccessMutation.mutateAsync({
        repo: repositoryDid,
        userDid: userDid.trim(),
        permissions: rolePermissions,
      })

      // Reset form
      setUserDid('')
      setSelectedRole('viewer')
      setPermissions({ read: true, write: false })
      setActiveTab('collaborators') // Switch back to collaborators tab
    } catch (error) {
      console.error('Failed to grant access:', error)
      console.error('Full error object:', JSON.stringify(error, null, 2))

      let errorMessage = 'Unknown error'
      if (error instanceof Error) {
        errorMessage = error.message
      } else if (typeof error === 'object' && error !== null) {
        errorMessage = JSON.stringify(error)
      }

      alert(`Failed to grant access: ${errorMessage}`)
    }
  }

  const handleRevokeAccess = async (collaboratorDid: string) => {
    if (
      !window.confirm(
        `Are you sure you want to revoke access for ${collaboratorDid}?`,
      )
    ) {
      return
    }

    try {
      await revokeAccessMutation.mutateAsync({
        repoDid: repositoryDid,
        userDid: collaboratorDid,
      })
    } catch (error) {
      console.error('Failed to revoke access:', error)
      alert(
        `Failed to revoke access: ${error instanceof Error ? error.message : 'Unknown error'}`,
      )
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white p-6 shadow-xl">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">
              Repository Collaboration
            </h2>
            <p className="text-sm text-gray-600">
              Manage access to{' '}
              <span className="font-medium">{repositoryHandle}</span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
            aria-label="Close"
          >
            <svg
              className="h-6 w-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="mb-6 flex space-x-1 border-b">
          <button
            onClick={() => setActiveTab('collaborators')}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === 'collaborators'
                ? 'border-b-2 border-blue-500 text-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Collaborators ({collaboratorsQuery.data?.collaborators?.length || 0}
            )
          </button>

          <button
            onClick={() => setActiveTab('add')}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === 'add'
                ? 'border-b-2 border-blue-500 text-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
            disabled={!canManage}
          >
            Add Collaborator {!canManage && '(Owner Only)'}
          </button>
        </div>

        {/* Tab Content */}
        {activeTab === 'collaborators' && (
          <div>
            {/* Debug Info */}
            <div className="mb-4 rounded border bg-blue-50 p-3 text-sm">
              <div>
                <strong>Repository DID:</strong> {repositoryDid}
              </div>
              <div>
                <strong>Is Direct Owner:</strong> {isDirectOwner ? 'Yes' : 'No'}
              </div>
              <div>
                <strong>Can Manage:</strong>{' '}
                {canManageLoading ? 'Loading...' : canManage ? 'Yes' : 'No'}
              </div>
              <div>
                <strong>Query Status:</strong>{' '}
                {collaboratorsQuery.isLoading
                  ? 'Loading'
                  : collaboratorsQuery.error
                    ? 'Error'
                    : 'Success'}
              </div>
              {collaboratorsQuery.error && (
                <div className="mt-1 text-red-600">
                  <strong>Error:</strong>{' '}
                  {collaboratorsQuery.error instanceof Error
                    ? collaboratorsQuery.error.message
                    : 'Unknown error'}
                </div>
              )}
              {collaboratorsQuery.data && (
                <div>
                  <strong>Collaborators Found:</strong>{' '}
                  {collaboratorsQuery.data.collaborators?.length || 0}
                </div>
              )}
            </div>

            {/* Loading State */}
            {collaboratorsQuery.isLoading && (
              <div className="flex items-center justify-center py-8">
                <Spinner />
                <span className="ml-2 text-gray-600">
                  Loading collaborators...
                </span>
              </div>
            )}

            {/* Error State */}
            {collaboratorsQuery.error && (
              <div className="rounded-lg bg-red-50 p-4 text-red-800">
                <p className="font-medium">Failed to load collaborators</p>
                <p className="mt-1 text-sm">
                  {collaboratorsQuery.error instanceof Error
                    ? collaboratorsQuery.error.message
                    : 'Unknown error occurred'}
                </p>
              </div>
            )}

            {/* Collaborators List */}
            {collaboratorsQuery.data && (
              <>
                {collaboratorsQuery.data.collaborators.length === 0 ? (
                  <div className="rounded-lg bg-gray-50 p-8 text-center text-gray-600">
                    <svg
                      className="mx-auto h-12 w-12 text-gray-400"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z"
                      />
                    </svg>
                    <h3 className="mt-2 text-sm font-medium text-gray-900">
                      No collaborators
                    </h3>
                    <p className="mt-1 text-sm text-gray-500">
                      {canManage
                        ? 'Grant access to other users to start collaborating.'
                        : 'This repository has no additional collaborators.'}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {collaboratorsQuery.data.collaborators.map(
                      (collaborator) => (
                        <div
                          key={collaborator.userDid}
                          className="flex items-center justify-between rounded-lg border border-gray-200 p-4"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center space-x-2">
                              <p className="truncate font-medium text-gray-900">
                                {formatCollaboratorName(collaborator)}
                              </p>
                              <span className="rounded-full bg-blue-100 px-2 py-1 text-xs font-medium text-blue-800">
                                {getPermissionLevel(collaborator.permissions)}
                              </span>
                            </div>
                            <p className="truncate text-sm text-gray-500">
                              {collaborator.userDid}
                            </p>
                            <p className="text-xs text-gray-400">
                              Granted{' '}
                              {new Date(
                                collaborator.grantedAt,
                              ).toLocaleDateString()}
                            </p>
                          </div>
                          {canManage && (
                            <Button
                              onClick={() =>
                                handleRevokeAccess(collaborator.userDid)
                              }
                              size="small"
                              disabled={revokeAccessMutation.isLoading}
                              className="ml-4 bg-red-600 text-white hover:bg-red-700"
                            >
                              {revokeAccessMutation.isLoading &&
                              revokeAccessMutation.variables?.userDid ===
                                collaborator.userDid ? (
                                <Spinner className="h-4 w-4" />
                              ) : (
                                'Revoke'
                              )}
                            </Button>
                          )}
                        </div>
                      ),
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {activeTab === 'add' &&
          (canManage ? (
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  User DID
                </label>
                <input
                  type="text"
                  value={userDid}
                  onChange={(e) => setUserDid(e.target.value)}
                  placeholder="did:plc:example123..."
                  className="mt-1 w-full rounded-lg border border-gray-300 p-3 focus:border-blue-500 focus:outline-none"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Enter the DID of the user you want to grant access to
                </p>
              </div>

              <div>
                <label className="mb-3 block text-sm font-medium text-gray-700">
                  Role
                </label>
                <div className="space-y-3">
                  {Object.entries(roles).map(([roleKey, role]) => (
                    <label key={roleKey} className="flex items-start">
                      <input
                        type="radio"
                        name="role"
                        value={roleKey}
                        checked={selectedRole === roleKey}
                        onChange={(e) =>
                          setSelectedRole(
                            e.target.value as
                              | 'viewer'
                              | 'contributor'
                              | 'admin',
                          )
                        }
                        className="mt-0.5 h-4 w-4 border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <div className="ml-3">
                        <div className="text-sm font-medium text-gray-900">
                          {role.name}
                        </div>
                        <div className="text-xs text-gray-500">
                          {role.description}
                        </div>
                        <div className="mt-1 text-xs text-gray-400">
                          Permissions:{' '}
                          {Object.entries(role.permissions)
                            .filter(([, value]) => value)
                            .map(([key]) => key)
                            .join(', ')}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex justify-end space-x-3">
                <Button
                  onClick={() => setActiveTab('collaborators')}
                  disabled={grantAccessMutation.isLoading}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleGrantAccess}
                  disabled={
                    !userDid.trim() ||
                    !validateDid(userDid.trim()) ||
                    grantAccessMutation.isLoading
                  }
                  className="bg-blue-600 text-white hover:bg-blue-700"
                >
                  {grantAccessMutation.isLoading ? (
                    <>
                      <Spinner className="mr-2 h-4 w-4" />
                      Adding Collaborator...
                    </>
                  ) : (
                    `Add as ${roles[selectedRole].name}`
                  )}
                </Button>
              </div>
            </div>
          ) : (
            <div className="rounded-lg bg-gray-50 p-8 text-center text-gray-600">
              <div className="mx-auto mb-4 h-12 w-12 text-gray-400">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                  />
                </svg>
              </div>
              <h3 className="mb-2 text-sm font-medium text-gray-900">
                Owner Access Required
              </h3>
              <p className="text-sm text-gray-500">
                Only repository owners can add new collaborators.
              </p>
            </div>
          ))}

        {/* Footer */}
        <div className="mt-6 flex justify-end">
          <Button onClick={onClose}>Close</Button>
        </div>
      </div>
    </div>
  )
}
