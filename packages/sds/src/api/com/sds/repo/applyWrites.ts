// SDS Enhanced applyWrites - Supports multi-user repository access
import { CID } from 'multiformats/cid'
import { WriteOpAction } from '@atproto/repo'
import { InvalidRequestError } from '@atproto/xrpc-server'
import { Server } from '../../../../lexicon'
import {
  CreateResult,
  DeleteResult,
  HandlerInput,
  UpdateResult,
  isCreate,
  isDelete,
  isUpdate,
} from '../../../../lexicon/types/com/atproto/repo/applyWrites'
import { dbLogger } from '../../../../logger'
import {
  BadCommitSwapError,
  InvalidRecordError,
  PreparedWrite,
  prepareCreate,
  prepareDelete,
  prepareUpdate,
} from '../../../../repo'
import { SdsAppContext } from '../../../../sds-context'

const ratelimitPoints = ({ input }: { input: HandlerInput }) => {
  let points = 0
  for (const op of input.body.writes) {
    if (isCreate(op)) {
      points += 3
    } else if (isUpdate(op)) {
      points += 2
    } else {
      points += 1
    }
  }
  return points
}

export default function (server: Server, ctx: SdsAppContext) {
  server.com.atproto.repo.applyWrites({
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
        // Performed in the handler as it is based on the request body
      },
    }),

    rateLimit: [
      {
        name: 'repo-write-hour',
        calcKey: ({ auth }) => auth.credentials.did,
        calcPoints: ratelimitPoints,
      },
      {
        name: 'repo-write-day',
        calcKey: ({ auth }) => auth.credentials.did,
        calcPoints: ratelimitPoints,
      },
    ],

    handler: async ({ input, auth }) => {
      const { repo, validate, swapCommit, writes } = input.body

      const userDid = auth.credentials.did

      // SDS Enhancement: Determine required permissions based on write operations
      const hasCreates = writes.some(isCreate)
      const hasUpdates = writes.some(isUpdate)
      const hasDeletes = writes.some(isDelete)

      // Get account and check initial access
      const account = await ctx.authVerifier.findAccount(repo, {
        checkDeactivated: true,
        checkTakedown: true,
      })
      const repoDid = account.did

      // If not the owner, verify user has all necessary granular permissions
      let accessType: 'owner' | 'shared' = 'owner'
      if (repoDid !== userDid) {
        accessType = 'shared'

        // Check each required permission type
        if (hasCreates) {
          const hasCreateAccess = await ctx.authVerifier.checkRepositoryAccess(
            repoDid,
            userDid,
            'create',
          )
          if (!hasCreateAccess) {
            throw new InvalidRequestError(
              `Access denied: User ${userDid} does not have 'create' permission for repository ${repoDid}`,
            )
          }
        }

        if (hasUpdates) {
          const hasUpdateAccess = await ctx.authVerifier.checkRepositoryAccess(
            repoDid,
            userDid,
            'update',
          )
          if (!hasUpdateAccess) {
            throw new InvalidRequestError(
              `Access denied: User ${userDid} does not have 'update' permission for repository ${repoDid}`,
            )
          }
        }

        if (hasDeletes) {
          const hasDeleteAccess = await ctx.authVerifier.checkRepositoryAccess(
            repoDid,
            userDid,
            'delete',
          )
          if (!hasDeleteAccess) {
            throw new InvalidRequestError(
              `Access denied: User ${userDid} does not have 'delete' permission for repository ${repoDid}`,
            )
          }
        }
      }

      if (writes.length > 200) {
        throw new InvalidRequestError('Too many writes. Max: 200')
      }

      // Verify permission of every unique "action" / "collection" pair
      if (auth.credentials.type === 'oauth' && auth.credentials.permissions) {
        // @NOTE Unlike "importRepo", we do not require "action" = "*" here.
        for (const [action, collections] of [
          ['create', new Set(writes.filter(isCreate).map((w) => w.collection))],
          ['update', new Set(writes.filter(isUpdate).map((w) => w.collection))],
          ['delete', new Set(writes.filter(isDelete).map((w) => w.collection))],
        ] as const) {
          for (const collection of collections) {
            auth.credentials.permissions.assertRepo({ action, collection })
          }
        }
      }

      // Log shared repository access for audit purposes
      if (accessType === 'shared') {
        console.log(
          `Shared repository access: User ${userDid} applying writes to repository ${repoDid}`,
        )
      }

      // @NOTE should preserve order of ts.writes for final use in response
      let preparedWrites: PreparedWrite[]
      try {
        preparedWrites = await Promise.all(
          writes.map(async (write) => {
            if (isCreate(write)) {
              return prepareCreate({
                did: repoDid,
                collection: write.collection,
                record: write.value,
                rkey: write.rkey,
                validate,
              })
            } else if (isUpdate(write)) {
              return prepareUpdate({
                did: repoDid,
                collection: write.collection,
                record: write.value,
                rkey: write.rkey,
                validate,
              })
            } else if (isDelete(write)) {
              return prepareDelete({
                did: repoDid,
                collection: write.collection,
                rkey: write.rkey,
              })
            } else {
              throw new InvalidRequestError(
                `Action not supported: ${write['$type']}`,
              )
            }
          }),
        )
      } catch (err) {
        if (err instanceof InvalidRecordError) {
          throw new InvalidRequestError(err.message)
        }
        throw err
      }

      const swapCommitCid = swapCommit ? CID.parse(swapCommit) : undefined

      const commit = await ctx.actorStore.transact(
        repoDid,
        async (actorTxn) => {
          const commit = await actorTxn.repo
            .processWrites(preparedWrites, swapCommitCid)
            .catch((err) => {
              if (err instanceof BadCommitSwapError) {
                throw new InvalidRequestError(err.message, 'InvalidSwap')
              } else {
                throw err
              }
            })

          await ctx.sequencer.sequenceCommit(repoDid, commit)
          return commit
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
          commit: {
            cid: commit.cid.toString(),
            rev: commit.rev,
          },
          results: preparedWrites.map(writeToOutputResult),
        },
      }
    },
  })
}

const writeToOutputResult = (write: PreparedWrite) => {
  switch (write.action) {
    case WriteOpAction.Create:
      return {
        $type: 'com.atproto.repo.applyWrites#createResult',
        cid: write.cid.toString(),
        uri: write.uri.toString(),
        validationStatus: write.validationStatus,
      } satisfies CreateResult
    case WriteOpAction.Update:
      return {
        $type: 'com.atproto.repo.applyWrites#updateResult',
        cid: write.cid.toString(),
        uri: write.uri.toString(),
        validationStatus: write.validationStatus,
      } satisfies UpdateResult
    case WriteOpAction.Delete:
      return {
        $type: 'com.atproto.repo.applyWrites#deleteResult',
      } satisfies DeleteResult
    default:
      throw new Error(`Unrecognized action: ${write}`)
  }
}
