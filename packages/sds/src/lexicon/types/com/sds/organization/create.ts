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
import type * as ComSdsRepoGrantAccess from '../repo/grantAccess.js'

const is$typed = _is$typed,
  validate = _validate
const id = 'com.sds.organization.create'

export type QueryParams = {}

export interface InputSchema {
  /** The name of the organization. */
  name: string
  /** Optional description of the organization. */
  description?: string
  /** The handle prefix (part before the first dot). The SDS hostname will be automatically appended as the suffix. */
  handlePrefix: string
  /** DID of the user creating the organization. */
  creatorDid: string
}

export interface OutputSchema {
  /** The DID of the created organization repository. */
  did: string
  /** The handle of the organization. */
  handle: string
  /** The name of the organization. */
  name: string
  /** The description of the organization. */
  description?: string
  /** When the organization was created. */
  createdAt: string
  permissions: ComSdsRepoGrantAccess.Permissions
  /** The creator's access type (always owner). */
  accessType: 'owner' | (string & {})
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
  error?: 'InvalidName' | 'HandleTaken'
}

export type HandlerOutput = HandlerError | HandlerSuccess
