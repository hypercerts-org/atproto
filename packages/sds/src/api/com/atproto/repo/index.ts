import { AppContext } from '../../../../context'
import { Server } from '../../../../lexicon'
import { SdsAppContext } from '../../../../sds-context'
import applyWrites from './applyWrites'
import createRecord from './createRecord'
import deleteRecord from './deleteRecord'
import describeRepo from './describeRepo'
import getRecord from './getRecord'
import importRepo from './importRepo'
import listMissingBlobs from './listMissingBlobs'
import listRecords from './listRecords'
import putRecord from './putRecord'
import uploadBlob from './uploadBlob'

export default function (server: Server, ctx: AppContext) {
  // TODO: remove these endpoints that are overwritten by SDS-specific versions
  // Skip methods that use findAccount if SDS - they will be registered by SDS-specific versions
  if (!(ctx instanceof SdsAppContext)) {
    applyWrites(server, ctx)
    createRecord(server, ctx)
    deleteRecord(server, ctx)
    putRecord(server, ctx)
    uploadBlob(server, ctx)
  }
  describeRepo(server, ctx)
  getRecord(server, ctx)
  listRecords(server, ctx)
  listMissingBlobs(server, ctx)
  importRepo(server, ctx)
}
