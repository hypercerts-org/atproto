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
const id = 'com.sds.repo.revokeAccess'

export type QueryParams = {}

export interface InputSchema {
  /** The handle or DID of the repository to revoke access from. */
  repo: string
  /** The DID of the user to revoke access from. */
  userDid: string
}

export interface OutputSchema {
  /** Whether the access was successfully revoked. */
  success: boolean
  /** Timestamp when the access was revoked. */
  revokedAt: string
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
    | 'AccessNotFound'
}

export type HandlerOutput = HandlerError | HandlerSuccess
