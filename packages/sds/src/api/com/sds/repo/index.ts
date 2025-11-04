import { Server } from '../../../../lexicon'
import { SdsAppContext } from '../../../../sds-context'
import applyWrites from '../../atproto/repo/applyWrites'
import deleteRecord from '../../atproto/repo/deleteRecord'
import putRecord from '../../atproto/repo/putRecord'
import createRecord from './createRecord'
import getPermissions from './getPermissions'
import grantAccess from './grantAccess'
import listCollaborators from './listCollaborators'
import revokeAccess from './revokeAccess'

export default function (server: Server, ctx: SdsAppContext) {
  // SDS-specific override for createRecord (supports shared access)
  createRecord(server, ctx)

  // Temporary: Register standard implementations for methods that use findAccount
  // These will be replaced with SDS-specific versions that support shared access
  applyWrites(server, ctx)
  deleteRecord(server, ctx)
  putRecord(server, ctx)

  grantAccess(server, ctx)
  revokeAccess(server, ctx)
  listCollaborators(server, ctx)
  getPermissions(server, ctx)
}
