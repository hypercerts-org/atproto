// Repository Card Component - Display repository info with collaboration features
import { Repository } from '../contexts/repository-context.tsx'
import { useListCollaboratorsQuery } from '../queries/use-collaboration-queries.ts'
import { Button } from './button.tsx'
import {
  DetailedPermissionBadges,
  PermissionBadge,
} from './permission-badge.tsx'

interface RepositoryCardProps {
  repository: Repository
  isSelected: boolean
  onSelect: () => void
  onManageCollaborators: () => void
}

export function RepositoryCard({
  repository,
  isSelected,
  onSelect,
  onManageCollaborators,
}: RepositoryCardProps) {
  const canManage = Boolean(
    repository.permissions?.owner || repository.permissions?.admin,
  )

  const collaboratorsQuery = useListCollaboratorsQuery(
    repository.did,
    canManage,
  )
  const collaboratorCount = collaboratorsQuery.data?.collaborators?.length || 0

  return (
    <div
      className={`rounded-lg border-2 p-4 transition-all ${
        isSelected
          ? 'border-blue-500 bg-blue-50'
          : 'border-gray-200 hover:border-gray-300'
      }`}
    >
      {/* Repository Header */}
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <h3
            className="cursor-pointer font-medium text-gray-900"
            onClick={onSelect}
          >
            {repository.handle}
          </h3>
          {repository.permissions && (
            <PermissionBadge
              permissions={repository.permissions}
              size="small"
            />
          )}
        </div>
        <span
          className={`rounded-full px-2 py-1 text-xs font-medium ${
            repository.accessType === 'owner'
              ? 'bg-green-100 text-green-800'
              : repository.accessType === 'shared'
                ? 'bg-blue-100 text-blue-800'
                : 'bg-gray-100 text-gray-800'
          }`}
        >
          {repository.accessType}
        </span>
      </div>

      {/* Repository DID */}
      <div
        className="mb-2 cursor-pointer text-xs text-gray-500"
        onClick={onSelect}
      >
        {repository.did.slice(0, 20)}...
      </div>

      {/* Permissions and Actions */}
      <div className="flex flex-col space-y-3">
        {/* Permissions Display */}
        {repository.permissions && (
          <DetailedPermissionBadges permissions={repository.permissions} />
        )}

        {/* Collaborator Info and Management */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-500">
            {collaboratorCount > 0
              ? `${collaboratorCount} collaborator${collaboratorCount === 1 ? '' : 's'}`
              : 'No collaborators'}
          </span>

          {/* Manage Collaborators Button - Owners & Admins */}
          {canManage && (
            <Button
              onClick={(e) => {
                e.stopPropagation()
                onManageCollaborators()
              }}
              size="small"
              className="bg-gray-600 text-white hover:bg-gray-700"
            >
              Manage
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
