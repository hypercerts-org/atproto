export interface PermissionAuditLog {
  id?: number // Optional for inserts (auto-increment)
  repoDid: string
  userDid: string
  action: string // 'grant', 'revoke', 'modify'
  permissionsBefore: string | null // JSON string
  permissionsAfter: string | null // JSON string
  changedBy: string
  changedAt: string
}

export const tableName = 'permission_audit_log'

export type PartialDB = {
  [tableName]: PermissionAuditLog
}
