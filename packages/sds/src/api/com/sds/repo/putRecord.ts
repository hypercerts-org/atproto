import { CID } from 'multiformats/cid'
import { BlobRef } from '@atproto/lexicon'
import { AtUri } from '@atproto/syntax'
import { InvalidRequestError } from '@atproto/xrpc-server'
import { ActorStoreTransactor } from '../../../../actor-store/actor-store-transactor'
import { Server } from '../../../../lexicon'
import { ids } from '../../../../lexicon/lexicons'
import { Record as ProfileRecord } from '../../../../lexicon/types/app/bsky/actor/profile'
import { dbLogger } from '../../../../logger'
import {
  BadCommitSwapError,
  BadRecordSwapError,
  InvalidRecordError,
  PreparedCreate,
  PreparedUpdate,
  prepareCreate,
  prepareUpdate,
} from '../../../../repo'
import { SdsAppContext } from '../../../../sds-context'

export default function (server: Server, ctx: SdsAppContext) {
  server.com.atproto.repo.putRecord({
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
        calcPoints: () => 2,
      },
      {
        name: 'repo-write-day',
        calcKey: ({ auth }) => auth.credentials.did,
        calcPoints: () => 2,
      },
    ],
    handler: async ({ auth, input }) => {
      const {
        repo,
        collection,
        rkey,
        record,
        validate,
        swapCommit,
        swapRecord,
      } = input.body

      const userDid = auth.credentials.did

      // SDS Enhancement: Use enhanced account finder that supports shared access
      // Check for 'update' permission (aligned with OAuth scope model)
      const { account, accessType } =
        await ctx.authVerifier.findAccountWithSharedAccess(
          repo,
          userDid,
          'update',
          {
            checkDeactivated: true,
            checkTakedown: true,
          },
        )

      const repoDid = account.did

      // OAuth permission checks (same as original PDS)
      if (auth.credentials.type === 'oauth' && auth.credentials.permissions) {
        auth.credentials.permissions.assertRepo({
          action: 'update',
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

      const uri = AtUri.make(repoDid, collection, rkey)
      const swapRecordCid =
        typeof swapRecord === 'string' ? CID.parse(swapRecord) : swapRecord

      const { commit, write } = await ctx.actorStore.transact(
        repoDid,
        async (actorTxn) => {
          const current = await actorTxn.record.getRecord(uri, null, true)
          const isUpdate = current !== null

          // @TODO temporaray hack for legacy blob refs in profiles - remove after migrating legacy blobs
          if (isUpdate && collection === ids.AppBskyActorProfile) {
            await updateProfileLegacyBlobRef(actorTxn, record)
          }
          const writeInfo = {
            did: repoDid,
            collection,
            rkey,
            record,
            swapCid: swapRecordCid,
            validate,
          }

          let write: PreparedCreate | PreparedUpdate
          try {
            write = isUpdate
              ? await prepareUpdate(writeInfo)
              : await prepareCreate(writeInfo)
          } catch (err) {
            if (err instanceof InvalidRecordError) {
              throw new InvalidRequestError(err.message)
            }
            throw err
          }

          // no-op
          if (current && current.cid === write.cid.toString()) {
            return {
              commit: null,
              write,
            }
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

          return { commit, write }
        },
      )

      if (commit !== null) {
        await ctx.accountManager
          .updateRepoRoot(repoDid, commit.cid, commit.rev)
          .catch((err) => {
            dbLogger.error(
              { err, repoDid, cid: commit.cid, rev: commit.rev },
              'failed to update account root',
            )
          })
      }

      return {
        encoding: 'application/json',
        body: {
          uri: write.uri.toString(),
          cid: write.cid.toString(),
          commit: commit
            ? {
                cid: commit.cid.toString(),
                rev: commit.rev,
              }
            : undefined,
          validationStatus: write.validationStatus,
        },
      }
    },
  })
}

// WARNING: mutates object
const updateProfileLegacyBlobRef = async (
  actorStore: ActorStoreTransactor,
  record: Partial<ProfileRecord>,
) => {
  if (record.avatar && !record.avatar.original['$type']) {
    const blob = await actorStore.repo.blob.getBlobMetadata(record.avatar.ref)
    record.avatar = new BlobRef(
      record.avatar.ref,
      record.avatar.mimeType,
      blob.size,
    )
  }
  if (record.banner && !record.banner.original['$type']) {
    const blob = await actorStore.repo.blob.getBlobMetadata(record.banner.ref)
    record.banner = new BlobRef(
      record.banner.ref,
      record.banner.mimeType,
      blob.size,
    )
  }
}
