import { Server } from '../../../../lexicon'
import { SdsAppContext } from '../../../../sds-context'
import deleteRecord from '../../atproto/repo/deleteRecord'
import applyWrites from './applyWrites'
import createRecord from './createRecord'
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

  // Temporary: Register standard implementations for methods that use findAccount
  // These will be replaced with SDS-specific versions that support shared access
  deleteRecord(server, ctx)

  grantAccess(server, ctx)
  revokeAccess(server, ctx)
  listCollaborators(server, ctx)
  getPermissions(server, ctx)
}
