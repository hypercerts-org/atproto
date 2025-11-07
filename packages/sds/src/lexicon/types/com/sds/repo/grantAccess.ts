/**
 * GENERATED CODE - DO NOT MODIFY
 */
import { type ValidationResult, BlobRef } from '@atproto/lexicon'
import { CID } from 'multiformats/cid'
import { validate as _validate } from '../../../../lexicons'
import {
  type $Typed,
  is$typed as _is$typed,
  type OmitKey,
} from '../../../../util'

const is$typed = _is$typed,
  validate = _validate
const id = 'com.sds.repo.grantAccess'

export type QueryParams = {}

export interface InputSchema {
  /** The handle or DID of the repository to grant access to. */
  repo: string
  /** The DID of the user to grant access to. */
  userDid: string
  permissions: Permissions
}

export interface OutputSchema {
  /** Whether the access was successfully granted. */
  success: boolean
  /** Timestamp when the access was granted. */
  grantedAt: string
  collaborator?: CollaboratorInfo
}

export interface HandlerInput {
  encoding: 'application/json'
  body: InputSchema
}

export interface HandlerSuccess {
  encoding: 'application/json'
  body: OutputSchema
  headers?: { [key: string]: string }
}

export interface HandlerError {
  status: number
  message?: string
  error?:
    | 'RepositoryNotFound'
    | 'UserNotFound'
    | 'InsufficientPermissions'
    | 'InvalidPermissions'
}

export type HandlerOutput = HandlerError | HandlerSuccess

/** Repository access permissions aligned with OAuth's granular action model */
export interface Permissions {
  $type?: 'com.sds.repo.grantAccess#permissions'
  /** Permission to read repository content. */
  read: boolean
  /** Permission to create new records in the repository. */
  create: boolean
  /** Permission to update existing records in the repository. */
  update: boolean
  /** Permission to delete records from the repository. */
  delete: boolean
  /** Administrative permissions (manage collaborators, etc.). */
  admin?: boolean
  /** Owner permissions (full control including ownership transfer). */
  owner?: boolean
}

const hashPermissions = 'permissions'

export function isPermissions<V>(v: V) {
  return is$typed(v, id, hashPermissions)
}

export function validatePermissions<V>(v: V) {
  return validate<Permissions & V>(v, id, hashPermissions)
}

/** Information about a repository collaborator */
export interface CollaboratorInfo {
  $type?: 'com.sds.repo.grantAccess#collaboratorInfo'
  /** The DID of the collaborator. */
  userDid: string
  permissions: Permissions
  /** The DID of the user who granted these permissions. */
  grantedBy: string
  /** Timestamp when the permissions were granted. */
  grantedAt: string
  /** Timestamp when the permissions were revoked (if applicable). */
  revokedAt?: string
}

const hashCollaboratorInfo = 'collaboratorInfo'

export function isCollaboratorInfo<V>(v: V) {
  return is$typed(v, id, hashCollaboratorInfo)
}

export function validateCollaboratorInfo<V>(v: V) {
  return validate<CollaboratorInfo & V>(v, id, hashCollaboratorInfo)
}
