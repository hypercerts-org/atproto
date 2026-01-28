/**
 * GENERATED CODE - DO NOT MODIFY
 */
import stream from 'node:stream'
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
const id = 'com.sds.repo.uploadBlob'

export type QueryParams = {
  /** The handle or DID of the repository to upload the blob to. */
  repo: string
}
export type InputSchema = string | Uint8Array | Blob

export interface OutputSchema {
  blob: BlobRef
}

export interface HandlerInput {
  encoding: '*/*'
  body: stream.Readable
}

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
