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
const id = 'com.sds.organization.list'

export type QueryParams = {
  /** DID of the user to list organizations for. */
  userDid?: string
}
export type InputSchema = undefined

export interface OutputSchema {
  organizations: Organization[]
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
}

export type HandlerOutput = HandlerError | HandlerSuccess

/** Organization information with user's access details */
export interface Organization {
  $type?: 'com.sds.organization.list#organization'
  /** The DID of the organization repository. */
  did: string
  /** The handle of the organization. */
  handle: string
  /** The name of the organization. */
  name: string
  /** The description of the organization. */
  description?: string
  /** When the organization was created. */
  createdAt?: string
  permissions: ComSdsRepoGrantAccess.Permissions
  /** The user's access type. */
  accessType: 'owner' | 'collaborator' | (string & {})
}

const hashOrganization = 'organization'

export function isOrganization<V>(v: V) {
  return is$typed(v, id, hashOrganization)
}

export function validateOrganization<V>(v: V) {
  return validate<Organization & V>(v, id, hashOrganization)
}
