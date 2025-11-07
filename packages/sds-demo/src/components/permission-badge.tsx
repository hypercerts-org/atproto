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
      'Write Only': 'bg-amber-100 text-amber-800',
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
  const permissionEntries: Array<
    { label: string; value: boolean } & {
      highlight?: 'primary' | 'warning'
    }
  > = [
    { label: 'Read', value: permissions.read, highlight: 'primary' },
    { label: 'Create', value: permissions.create, highlight: 'primary' },
    { label: 'Update', value: permissions.update, highlight: 'primary' },
    { label: 'Delete', value: permissions.delete, highlight: 'primary' },
  ]

  if (permissions.admin !== undefined) {
    permissionEntries.push({
      label: 'Admin',
      value: permissions.admin,
      highlight: 'warning',
    })
  }

  if (permissions.owner !== undefined) {
    permissionEntries.push({
      label: 'Owner',
      value: permissions.owner,
      highlight: 'warning',
    })
  }

  const getBadgeClasses = (
    value: boolean,
    highlight: 'primary' | 'warning' = 'primary',
  ) => {
    if (value) {
      return highlight === 'primary'
        ? 'bg-green-100 text-green-700'
        : 'bg-purple-100 text-purple-700'
    }

    return 'bg-red-100 text-red-700'
  }

  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      {permissionEntries.map(({ label, value, highlight }) => (
        <span
          key={label}
          className={`rounded-full px-3 py-1 text-xs font-medium ${getBadgeClasses(
            value,
            highlight,
          )}`}
        >
          {label}: {value ? '✓' : '✗'}
        </span>
      ))}
    </div>
  )
}
