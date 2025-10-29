import { Server } from '../../../../lexicon'
import { SdsAppContext } from '../../../../sds-context'
import createRecord from './createRecord'
import getPermissions from './getPermissions'
import grantAccess from './grantAccess'
import listCollaborators from './listCollaborators'
import revokeAccess from './revokeAccess'

export default function (server: Server, ctx: SdsAppContext) {
  // Override standard com.atproto.repo.createRecord with SDS version that supports shared access
  createRecord(server, ctx)

  grantAccess(server, ctx)
  revokeAccess(server, ctx)
  listCollaborators(server, ctx)
  getPermissions(server, ctx)
}
