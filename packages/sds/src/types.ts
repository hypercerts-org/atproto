// SDS-specific types and interfaces

export interface RepositoryPermissions {
  read: boolean
  write: boolean
  admin?: boolean
  owner?: boolean
}

export interface SharingConfig {
  maxCollaborators: number
  enableAuditLog: boolean
  rotationKeyPath?: string
}

export interface CollaboratorInfo {
  userDid: string
  permissions: RepositoryPermissions
  grantedBy: string
  grantedAt: string
  revokedAt?: string
}

export interface PermissionChange {
  repoDid: string
  userDid: string
  action: 'grant' | 'revoke' | 'modify'
  permissionsBefore?: RepositoryPermissions
  permissionsAfter?: RepositoryPermissions
  changedBy: string
  changedAt: string
}

export interface SharedRepositoryInfo {
  did: string
  owner: string
  collaborators: CollaboratorInfo[]
  createdAt: string
}

// Permission check context
export interface PermissionCheckContext {
  repoDid: string
  userDid: string
  action: keyof RepositoryPermissions
  requestPath?: string
  requestMethod?: string
}

// SDS-specific errors
export class SdsPermissionError extends Error {
  constructor(
    message: string,
    public repoDid: string,
    public userDid: string,
    public action: string,
  ) {
    super(message)
    this.name = 'SdsPermissionError'
  }
}

export class SdsRepositoryNotFoundError extends Error {
  constructor(
    message: string,
    public repoDid: string,
  ) {
    super(message)
    this.name = 'SdsRepositoryNotFoundError'
  }
}

export class SdsUserNotFoundError extends Error {
  constructor(
    message: string,
    public userDid: string,
  ) {
    super(message)
    this.name = 'SdsUserNotFoundError'
  }
}
