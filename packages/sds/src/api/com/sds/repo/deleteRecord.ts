// SDS Enhanced deleteRecord - Supports multi-user repository access
import { CID } from 'multiformats/cid'
import { InvalidRequestError } from '@atproto/xrpc-server'
import { Server } from '../../../../lexicon'
import { dbLogger } from '../../../../logger'
import {
  BadCommitSwapError,
  BadRecordSwapError,
  prepareDelete,
} from '../../../../repo'
import { SdsAppContext } from '../../../../sds-context'

export default function (server: Server, ctx: SdsAppContext) {
  server.com.atproto.repo.deleteRecord({
    auth: ctx.authVerifier.authorization({
      // @NOTE the "checkTakedown" and "checkDeactivated" checks are typically
      // performed during auth. However, since this method's "repo" parameter
      // can be a handle, we will need to fetch the account again to ensure that
      // the handle matches the DID from the request's credentials. In order to
      // avoid fetching the account twice (during auth, and then again in the
      // controller), the checks are disabled here:

      // checkTakedown: true,
      // checkDeactivated: true,
      authorize: () => {
        // Performed in the handler as it requires the request body
      },
    }),
    rateLimit: [
      {
        name: 'repo-write-hour',
        calcKey: ({ auth }) => auth.credentials.did,
        calcPoints: () => 1,
      },
      {
        name: 'repo-write-day',
        calcKey: ({ auth }) => auth.credentials.did,
        calcPoints: () => 1,
      },
    ],
    handler: async ({ input, auth }) => {
      const { repo, collection, rkey, swapCommit, swapRecord } = input.body

      const userDid = auth.credentials.did

      // SDS Enhancement: Use enhanced account finder that supports shared access
      // Check for 'delete' permission (aligned with OAuth scope model)
      const { account, accessType } =
        await ctx.authVerifier.findAccountWithSharedAccess(
          repo,
          userDid,
          'delete',
          {
            checkDeactivated: true,
            checkTakedown: true,
          },
        )

      const repoDid = account.did

      // We can't compute permissions based on the request payload ("input") in
      // the 'auth' phase, so we do it here.
      if (auth.credentials.type === 'oauth' && auth.credentials.permissions) {
        auth.credentials.permissions.assertRepo({
          action: 'delete',
          collection,
        })
      }

      // Log shared repository access for audit purposes
      if (accessType === 'shared') {
        console.log(
          `Shared repository access: User ${userDid} deleting record from repository ${repoDid}`,
        )
      }

      const swapCommitCid = swapCommit ? CID.parse(swapCommit) : undefined
      const swapRecordCid = swapRecord ? CID.parse(swapRecord) : undefined

      const write = prepareDelete({
        did: repoDid,
        collection,
        rkey,
        swapCid: swapRecordCid,
      })
      const commit = await ctx.actorStore.transact(
        repoDid,
        async (actorTxn) => {
          const record = await actorTxn.record.getRecord(write.uri, null, true)
          if (!record) {
            return null // No-op if record already doesn't exist
          }

          const commit = await actorTxn.repo
            .processWrites([write], swapCommitCid)
            .catch((err) => {
              if (
                err instanceof BadCommitSwapError ||
                err instanceof BadRecordSwapError
              ) {
                throw new InvalidRequestError(err.message, 'InvalidSwap')
              } else {
                throw err
              }
            })

          await ctx.sequencer.sequenceCommit(repoDid, commit)
          return commit
        },
      )

      if (commit !== null) {
        await ctx.accountManager
          .updateRepoRoot(repoDid, commit.cid, commit.rev)
          .catch((err) => {
            dbLogger.error(
              { err, did: repoDid, cid: commit.cid, rev: commit.rev },
              'failed to update account root',
            )
          })
      }

      return {
        encoding: 'application/json',
        body: {
          commit: commit
            ? {
                cid: commit.cid.toString(),
                rev: commit.rev,
              }
            : undefined,
        },
      }
    },
  })
}
