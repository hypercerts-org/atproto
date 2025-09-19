export interface SharedRepositoryPermissions {
  repoDid: string
  userDid: string
  permissions: string // JSON string
  grantedBy: string
  grantedAt: string
  revokedAt: string | null
}

export const tableName = 'shared_repository_permissions'

export type PartialDB = {
  [tableName]: SharedRepositoryPermissions
}
