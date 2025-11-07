import { Server } from '../../../../lexicon'
import { SdsAppContext } from '../../../../sds-context'
import applyWrites from './applyWrites'
import createRecord from './createRecord'
import deleteRecord from './deleteRecord'
import getPermissions from './getPermissions'
import grantAccess from './grantAccess'
import listCollaborators from './listCollaborators'
import putRecord from './putRecord'
import revokeAccess from './revokeAccess'

export default function (server: Server, ctx: SdsAppContext) {
  // SDS-specific overrides (support shared access)
  createRecord(server, ctx)
  putRecord(server, ctx)
  applyWrites(server, ctx)
  deleteRecord(server, ctx)

  grantAccess(server, ctx)
  revokeAccess(server, ctx)
  listCollaborators(server, ctx)
  getPermissions(server, ctx)
}
