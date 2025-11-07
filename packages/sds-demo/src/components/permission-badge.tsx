// Permission Badge Component - Visual indicator for permission levels
import {
  type RepositoryPermissions,
  getPermissionLevel,
} from '../services/collaboration-service.ts'

interface PermissionBadgeProps {
  permissions: RepositoryPermissions
  size?: 'small' | 'medium' | 'large'
  className?: string
}

export function PermissionBadge({
  permissions,
  size = 'medium',
  className = '',
}: PermissionBadgeProps) {
  const level = getPermissionLevel(permissions)

  // Determine styling based on permission level
  const getStyles = () => {
    const baseStyles = {
      small: 'px-2 py-0.5 text-xs',
      medium: 'px-2 py-1 text-sm',
      large: 'px-3 py-1.5 text-base',
    }

    const colorStyles = {
      Owner: 'bg-red-100 text-red-800',
      Admin: 'bg-purple-100 text-purple-800',
      'Read & Write': 'bg-green-100 text-green-800',
      'Read Only': 'bg-blue-100 text-blue-800',
      'No Access': 'bg-gray-100 text-gray-800',
    }

    return `${baseStyles[size]} ${colorStyles[level as keyof typeof colorStyles]} font-medium rounded-full`
  }

  return <span className={`${getStyles()} ${className}`}>{level}</span>
}

interface DetailedPermissionBadgesProps {
  permissions: RepositoryPermissions
  className?: string
}

export function DetailedPermissionBadges({
  permissions,
  className = '',
}: DetailedPermissionBadgesProps) {
  return (
    <div className={`flex space-x-2 ${className}`}>
      <span
        className={`rounded px-2 py-1 text-sm ${
          permissions.read
            ? 'bg-green-100 text-green-700'
            : 'bg-red-100 text-red-700'
        }`}
      >
        Read: {permissions.read ? '✓' : '✗'}
      </span>
      <span
        className={`rounded px-2 py-1 text-sm ${
          permissions.write
            ? 'bg-green-100 text-green-700'
            : 'bg-red-100 text-red-700'
        }`}
      >
        Write: {permissions.write ? '✓' : '✗'}
      </span>
      {permissions.admin !== undefined && (
        <span
          className={`rounded px-2 py-1 text-sm ${
            permissions.admin
              ? 'bg-purple-100 text-purple-700'
              : 'bg-red-100 text-red-700'
          }`}
        >
          Admin: {permissions.admin ? '✓' : '✗'}
        </span>
      )}
      {permissions.owner !== undefined && (
        <span
          className={`rounded px-2 py-1 text-sm ${
            permissions.owner
              ? 'bg-red-100 text-red-700'
              : 'bg-gray-100 text-gray-700'
          }`}
        >
          Owner: {permissions.owner ? '✓' : '✗'}
        </span>
      )}
    </div>
  )
}
