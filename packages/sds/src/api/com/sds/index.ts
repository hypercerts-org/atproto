import { Server } from '../../../lexicon'
import { SdsAppContext } from '../../../sds-context'
import organization from './organization'
import repo from './repo'

export default function (server: Server, ctx: SdsAppContext) {
  repo(server, ctx)
  organization(server, ctx)
}
