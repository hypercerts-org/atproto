import { Server } from '../../../../lexicon'
import { SdsAppContext } from '../../../../sds-context'
import create from './create'

export default function (server: Server, ctx: SdsAppContext) {
  create(server, ctx)
}
