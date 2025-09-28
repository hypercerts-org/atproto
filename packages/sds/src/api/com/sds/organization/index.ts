import { Server } from '../../../../lexicon'
import { SdsAppContext } from '../../../../sds-context'
import create from './create'
import list from './list'

export default function (server: Server, ctx: SdsAppContext) {
  create(server, ctx)
  list(server, ctx)
}
