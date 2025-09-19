import { Server } from '../../../../lexicon'
import { SdsAppContext } from '../../../../sds-context'
import getPermissions from './getPermissions'
import grantAccess from './grantAccess'
import listCollaborators from './listCollaborators'
import revokeAccess from './revokeAccess'

export default function (server: Server, ctx: SdsAppContext) {
  grantAccess(server, ctx)
  revokeAccess(server, ctx)
  listCollaborators(server, ctx)
  getPermissions(server, ctx)
}
