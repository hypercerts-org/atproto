import { UpstreamTimeoutError, parseReqEncoding } from '@atproto/xrpc-server'
import { BlobMetadata } from '../../../../actor-store/blob/transactor'
import { Server } from '../../../../lexicon'
import { SdsAppContext } from '../../../../sds-context'

export default function (server: Server, ctx: SdsAppContext) {
  server.com.atproto.repo.uploadBlob({
    auth: ctx.authVerifier.authorization({
      checkTakedown: false, // Will be checked per-repo in handler
      authorize: (permissions, { req }) => {
        const encoding = parseReqEncoding(req)
        permissions.assertBlob({ mime: encoding })
      },
    }),
    rateLimit: [
      {
        name: 'blob-upload-day',
        calcKey: ({ auth }) => auth.credentials.did,
        calcPoints: () => 1000,
      },
    ],
    handler: async ({ auth, input, req }) => {
      const userDid = auth.credentials.did

      // SDS Enhancement: Support uploading blobs to shared repositories
      // If 'repo' query parameter is provided, upload to that repository
      // Otherwise, upload to the authenticated user's repository (standard behavior)
      // Note: We access req.query directly since 'repo' is not in the lexicon QueryParams
      const repoParam =
        typeof req.query?.repo === 'string' ? req.query.repo : undefined

      let repoDid: string
      let accessType: 'owner' | 'shared' = 'owner'

      if (repoParam) {
        // SDS-specific: Check permissions for shared repository access
        // Blob uploads require 'create' permission (aligned with OAuth scope model)
        const { account, accessType: access } =
          await ctx.authVerifier.findAccountWithSharedAccess(
            repoParam,
            userDid,
            'create',
            {
              checkDeactivated: true,
              checkTakedown: true,
            },
          )
        repoDid = account.did
        accessType = access

        // Log shared repository access for audit purposes
        if (accessType === 'shared') {
          console.log(
            `Shared repository access: User ${userDid} uploading blob to repository ${repoDid}`,
          )
        }
      } else {
        // Standard behavior: upload to authenticated user's repository
        const account = await ctx.authVerifier.findAccount(userDid, {
          checkDeactivated: true,
          checkTakedown: true,
        })
        repoDid = account.did
      }

      // OAuth permission checks (same as original PDS)
      if (auth.credentials.type === 'oauth' && auth.credentials.permissions) {
        const encoding = parseReqEncoding(req)
        auth.credentials.permissions.assertBlob({ mime: encoding })
      }

      const blob = await ctx.actorStore.writeNoTransaction(
        repoDid,
        async (store) => {
          let metadata: BlobMetadata
          try {
            metadata = await store.repo.blob.uploadBlobAndGetMetadata(
              input.encoding,
              input.body,
            )
          } catch (err) {
            if (err?.['name'] === 'AbortError') {
              throw new UpstreamTimeoutError(
                'Upload timed out, please try again.',
              )
            }
            throw err
          }

          return store.transact(async (actorTxn) => {
            const blobRef =
              await actorTxn.repo.blob.trackUntetheredBlob(metadata)

            // make the blob permanent if an associated record is already indexed
            const recordsForBlob = await actorTxn.repo.blob.getRecordsForBlob(
              blobRef.ref,
            )
            if (recordsForBlob.length > 0) {
              await actorTxn.repo.blob.verifyBlobAndMakePermanent({
                cid: blobRef.ref,
                mimeType: blobRef.mimeType,
                size: blobRef.size,
                constraints: {},
              })
            }

            return blobRef
          })
        },
      )

      return {
        encoding: 'application/json',
        body: {
          blob,
        },
      }
    },
  })
}
