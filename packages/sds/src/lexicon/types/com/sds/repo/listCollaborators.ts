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
const id = 'com.sds.repo.listCollaborators'

export type QueryParams = {
  /** The handle or DID of the repository to list collaborators for. */
  repo: string
  /** Maximum number of collaborators to return. */
  limit: number
  /** Pagination cursor for retrieving additional results. */
  cursor?: string
}
export type InputSchema = undefined

export interface OutputSchema {
  /** List of repository collaborators and their permissions. */
  collaborators: ComSdsRepoGrantAccess.CollaboratorInfo[]
  /** Pagination cursor for retrieving additional results. */
  cursor?: string
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
  error?: 'RepositoryNotFound' | 'InsufficientPermissions'
}

export type HandlerOutput = HandlerError | HandlerSuccess
