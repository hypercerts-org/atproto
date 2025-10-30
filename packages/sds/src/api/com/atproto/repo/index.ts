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
  applyWrites(server, ctx)
  // Skip createRecord if SDS - it will be registered by the SDS-specific version
  if (!(ctx instanceof SdsAppContext)) {
    createRecord(server, ctx)
  }
  deleteRecord(server, ctx)
  describeRepo(server, ctx)
  getRecord(server, ctx)
  listRecords(server, ctx)
  putRecord(server, ctx)
  uploadBlob(server, ctx)
  listMissingBlobs(server, ctx)
  importRepo(server, ctx)
}
