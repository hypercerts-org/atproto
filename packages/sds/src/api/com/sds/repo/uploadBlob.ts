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

      console.log(
        `[uploadBlob] Handler entry - User: ${userDid}, Content-Type: ${input.encoding}`,
      )

      // SDS Enhancement: Support uploading blobs to shared repositories
      // If 'repo' query parameter is provided, upload to that repository
      // Otherwise, upload to the authenticated user's repository (standard behavior)
      // Note: We access req.query directly since 'repo' is not in the lexicon QueryParams
      const repoParam =
        typeof req.query?.repo === 'string' ? req.query.repo : undefined

      if (repoParam) {
        console.log(
          `[uploadBlob] Repo parameter detected: ${repoParam}, will check shared access`,
        )
      }

      let repoDid: string
      let accessType: 'owner' | 'shared' = 'owner'

      if (repoParam) {
        // SDS-specific: Check permissions for shared repository access
        // Blob uploads require 'create' permission (aligned with OAuth scope model)
        console.log(
          `[uploadBlob] Checking permissions for user ${userDid} to access repository ${repoParam}`,
        )

        try {
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

          console.log(
            `[uploadBlob] Permission check succeeded - Access type: ${accessType}, Repository DID: ${repoDid}`,
          )

          // Log shared repository access for audit purposes
          if (accessType === 'shared') {
            console.log(
              `Shared repository access: User ${userDid} uploading blob to repository ${repoDid}`,
            )
          }
        } catch (err) {
          console.error(
            `[uploadBlob] Permission check failed for user ${userDid} to access repository ${repoParam}:`,
            err,
          )
          throw err
        }
      } else {
        // Standard behavior: upload to authenticated user's repository
        console.log(
          `[uploadBlob] No repo parameter, using authenticated user's repository`,
        )

        try {
          const account = await ctx.authVerifier.findAccount(userDid, {
            checkDeactivated: true,
            checkTakedown: true,
          })
          repoDid = account.did

          console.log(
            `[uploadBlob] Account found for user ${userDid}, DID: ${repoDid}`,
          )
        } catch (err) {
          console.error(
            `[uploadBlob] Failed to find account for user ${userDid}:`,
            err,
          )
          throw err
        }
      }

      // OAuth permission checks (same as original PDS)
      if (auth.credentials.type === 'oauth' && auth.credentials.permissions) {
        console.log(
          `[uploadBlob] Performing OAuth permission check for MIME type: ${input.encoding}`,
        )

        try {
          const encoding = parseReqEncoding(req)
          auth.credentials.permissions.assertBlob({ mime: encoding })
          console.log(`[uploadBlob] OAuth permission check passed`)
        } catch (err) {
          console.error(
            `[uploadBlob] OAuth permission check failed for MIME type ${input.encoding}:`,
            err,
          )
          throw err
        }
      }

      console.log(
        `[uploadBlob] Starting blob upload for repository ${repoDid}`,
      )

      const blob = await ctx.actorStore.writeNoTransaction(
        repoDid,
        async (store) => {
          let metadata: BlobMetadata
          try {
            console.log(
              `[uploadBlob] Uploading blob with encoding: ${input.encoding}`,
            )
            metadata = await store.repo.blob.uploadBlobAndGetMetadata(
              input.encoding,
              input.body,
            )
            console.log(
              `[uploadBlob] Blob uploaded successfully - CID: ${metadata.cid}, Size: ${metadata.size}, MIME: ${metadata.mimeType}`,
            )
          } catch (err) {
            if (err?.['name'] === 'AbortError') {
              console.error(
                `[uploadBlob] Upload timed out for repository ${repoDid}`,
              )
              throw new UpstreamTimeoutError(
                'Upload timed out, please try again.',
              )
            }
            console.error(
              `[uploadBlob] Blob upload failed for repository ${repoDid}:`,
              err,
            )
            throw err
          }

          console.log(
            `[uploadBlob] Starting transaction to track blob in repository`,
          )

          return store.transact(async (actorTxn) => {
            try {
              console.log(
                `[uploadBlob] Tracking untethered blob - CID: ${metadata.cid}`,
              )
              const blobRef =
                await actorTxn.repo.blob.trackUntetheredBlob(metadata)

              // make the blob permanent if an associated record is already indexed
              console.log(
                `[uploadBlob] Checking for existing records for blob ${blobRef.ref}`,
              )
              const recordsForBlob = await actorTxn.repo.blob.getRecordsForBlob(
                blobRef.ref,
              )

              if (recordsForBlob.length > 0) {
                console.log(
                  `[uploadBlob] Found ${recordsForBlob.length} record(s) for blob, making permanent`,
                )
                await actorTxn.repo.blob.verifyBlobAndMakePermanent({
                  cid: blobRef.ref,
                  mimeType: blobRef.mimeType,
                  size: blobRef.size,
                  constraints: {},
                })
                console.log(
                  `[uploadBlob] Blob verified and made permanent - CID: ${blobRef.ref}`,
                )
              } else {
                console.log(
                  `[uploadBlob] No existing records for blob, leaving as untethered`,
                )
              }

              return blobRef
            } catch (err) {
              console.error(
                `[uploadBlob] Transaction failed while tracking blob:`,
                err,
              )
              throw err
            }
          })
        },
      )

      console.log(
        `[uploadBlob] Handler success - Blob CID: ${blob.ref}, Size: ${blob.size}, MIME: ${blob.mimeType}`,
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
