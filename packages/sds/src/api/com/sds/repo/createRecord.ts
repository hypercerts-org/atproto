// SDS Enhanced createRecord - Supports multi-user repository access
import { CID } from 'multiformats/cid'
import { InvalidRecordKeyError } from '@atproto/syntax'
import { InvalidRequestError } from '@atproto/xrpc-server'
import { Server } from '../../../../lexicon'
import { dbLogger } from '../../../../logger'
import {
  BadCommitSwapError,
  InvalidRecordError,
  PreparedCreate,
  prepareCreate,
} from '../../../../repo'
import { SdsAppContext } from '../../../../sds-context'

export default function (server: Server, ctx: SdsAppContext) {
  server.com.atproto.repo.createRecord({
    auth: ctx.authVerifier.authorization({
      // @NOTE the "checkTakedown" and "checkDeactivated" checks are typically
      // performed during auth. However, since this method's "repo" parameter
      // can be a handle, we will need to fetch the account again to ensure that
      // the handle matches the DID from the request's credentials. In order to
      // avoid fetching the account twice (during auth, and then again in the
      // controller), the checks are disabled here:
      checkTakedown: false,
      checkDeactivated: false,
      authorize: () => {
        // Basic authentication required
      },
    }),
    rateLimit: [
      {
        name: 'repo-write-hour',
        calcKey: ({ auth }) => auth.credentials.did,
        calcPoints: () => 3,
      },
      {
        name: 'repo-write-day',
        calcKey: ({ auth }) => auth.credentials.did,
        calcPoints: () => 3,
      },
    ],
    handler: async ({ input, auth }) => {
      const { repo, collection, rkey, record, swapCommit, validate } =
        input.body
      const userDid = auth.credentials.did

      // SDS Enhancement: Use enhanced account finder that supports shared access
      const { account, accessType } =
        await ctx.authVerifier.findAccountWithSharedAccess(
          repo,
          userDid,
          'write',
          {
            checkDeactivated: true,
            checkTakedown: true,
          },
        )

      const repoDid = account.did

      // OAuth permission checks (same as original PDS)
      if (auth.credentials.type === 'oauth' && auth.credentials.permissions) {
        auth.credentials.permissions.assertRepo({
          action: 'create',
          collection,
        })
      }

      // Log shared repository access for audit purposes
      if (accessType === 'shared') {
        console.log(
          `Shared repository access: User ${userDid} creating record in repository ${repoDid}`,
        )
      }

      const swapCommitCid = swapCommit ? CID.parse(swapCommit) : undefined

      const { commit, write } = await ctx.actorStore.transact(
        repoDid, // Use repository DID, not user DID
        async (actorTxn) => {
          const writeInfo = {
            did: repoDid,
            collection,
            rkey,
            record,
            validate,
          }

          let write: PreparedCreate
          try {
            write = await prepareCreate(writeInfo)
          } catch (err) {
            if (err instanceof InvalidRecordError) {
              throw new InvalidRequestError(err.message)
            } else if (err instanceof InvalidRecordKeyError) {
              throw new InvalidRequestError(err.message, 'InvalidRecordKey')
            }
            throw err
          }

          const commit = await actorTxn.repo
            .processWrites([write], swapCommitCid)
            .catch((err) => {
              if (err instanceof BadCommitSwapError) {
                throw new InvalidRequestError(err.message, 'InvalidSwap')
              } else {
                throw err
              }
            })

          await ctx.sequencer.sequenceCommit(repoDid, commit)

          return { commit, write }
        },
      )

      await ctx.accountManager
        .updateRepoRoot(repoDid, commit.cid, commit.rev)
        .catch((err) => {
          dbLogger.error(
            { err, did: repoDid, cid: commit.cid, rev: commit.rev },
            'failed to update account root',
          )
        })

      return {
        encoding: 'application/json',
        body: {
          uri: write.uri.toString(),
          cid: write.cid.toString(),
          commit: {
            cid: commit.cid.toString(),
            rev: commit.rev,
          },
          validationStatus: write.validationStatus,
        },
      }
    },
  })
}
