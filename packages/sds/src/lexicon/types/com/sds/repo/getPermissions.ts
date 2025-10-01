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
import type * as ComSdsRepoGrantAccess from './grantAccess.js'

const is$typed = _is$typed,
  validate = _validate
const id = 'com.sds.repo.getPermissions'

export type QueryParams = {
  /** The handle or DID of the repository to check permissions for. */
  repo: string
  /** The DID of the user to check permissions for (optional, for unauthenticated calls). */
  userDid?: string
}
export type InputSchema = undefined

export interface OutputSchema {
  permissions: ComSdsRepoGrantAccess.Permissions
  /** The type of access the user has to this repository. */
  accessType: 'owner' | 'shared' | 'none' | (string & {})
  /** The DID of the user who granted these permissions (if shared access). */
  grantedBy?: string
  /** Timestamp when the permissions were granted (if shared access). */
  grantedAt?: string
}

export type HandlerInput = void

export interface HandlerSuccess {
  encoding: 'application/json'
  body: OutputSchema
  headers?: { [key: string]: string }
}

export interface HandlerError {
  status: number
  message?: string
  error?: 'RepositoryNotFound'
}

export type HandlerOutput = HandlerError | HandlerSuccess
