import { AppContext } from '../context'
import { Server } from '../lexicon'
import { SdsAppContext } from '../sds-context'
import appBsky from './app/bsky'
import comAtproto from './com/atproto'
import comSds from './com/sds'

export default function (server: Server, ctx: AppContext | SdsAppContext) {
  comAtproto(server, ctx)
  appBsky(server, ctx)

  // Register SDS endpoints if we have an SDS context
  if (ctx instanceof SdsAppContext) {
    comSds(server, ctx)
  }

  return server
}
