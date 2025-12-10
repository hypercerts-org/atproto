import * as plc from '@did-plc/lib'
import { Secp256k1Keypair } from '@atproto/crypto'
import { InvalidHandleError, ensureValidHandle } from '@atproto/syntax'
import { InvalidRequestError, XRPCError } from '@atproto/xrpc-server'
import { AccountStatus } from '../../../../account-manager/helpers/account'
import { Server } from '../../../../lexicon'
import { httpLogger } from '../../../../logger'
import { SdsAppContext } from '../../../../sds-context'

export default function (server: Server, ctx: SdsAppContext) {
  server.com.sds.organization.create({
    auth: ctx.authVerifier.oauth(),
    rateLimit: [
      {
        name: 'org-create-hour',
        calcKey: () => 'development', // Development mode - no user-specific limits
        calcPoints: () => 5,
      },
      {
        name: 'org-create-day',
        calcKey: () => 'development', // Development mode - no user-specific limits
        calcPoints: () => 10,
      },
    ],
    handler: async ({ input, auth: _auth }) => {
      const { name, description, handlePrefix, creatorDid } = input.body

      if (!creatorDid) {
        throw new InvalidRequestError('Creator DID is required')
      }

      console.log(
        '[SDS] Organization create handler - creator DID:',
        creatorDid,
      )
      httpLogger.info(
        { creatorDid },
        'organization create handler - processing request',
      )

      if (!name?.trim()) {
        throw new InvalidRequestError('Organization name is required')
      }

      if (!handlePrefix?.trim()) {
        throw new InvalidRequestError('Handle prefix is required')
      }

      // Extract hostname from SDS public URL and construct full handle
      // Use hostname (not host) to exclude port number, as handles cannot contain ports
      const sdsPublicUrl = ctx.cfg.service.publicUrl
      const sdsHostname = new URL(sdsPublicUrl).hostname
      const orgHandle = `${handlePrefix.trim()}.${sdsHostname}`

      // Validate handle format using @atproto/syntax
      try {
        ensureValidHandle(orgHandle)
      } catch (err) {
        if (err instanceof InvalidHandleError) {
          throw new InvalidRequestError(err.message, 'InvalidHandle')
        }
        throw err
      }

      // Check if handle already exists
      const existingAccount = await ctx.accountManager.getAccount(orgHandle, {
        includeDeactivated: true,
      })
      if (existingAccount) {
        throw new InvalidRequestError(
          `Handle already taken: ${orgHandle}`,
          'HandleTaken',
        )
      }

      try {
        // Create a new DID and signing key for the organization
        const signingKey = await Secp256k1Keypair.create({ exportable: true })

        // Create a new DID for the organization using PLC
        const plcCreate = await plc.createOp({
          signingKey: signingKey.did(),
          rotationKeys: [ctx.plcRotationKey.did()],
          handle: orgHandle,
          pds: ctx.cfg.service.publicUrl || 'http://localhost:2583',
          signer: ctx.plcRotationKey,
        })

        const orgDid = plcCreate.did

        // Create the actor store for this organization repository
        await ctx.actorStore.create(orgDid, signingKey)

        // Initialize the repository
        const commit = await ctx.actorStore.transact(orgDid, (actorTxn) =>
          actorTxn.repo.createRepo([]),
        )

        // Create the account record for the organization
        await ctx.accountManager.createAccount({
          did: orgDid,
          handle: orgHandle,
          email: `${orgHandle}@sds.local`, // Synthetic email for organization
          password: 'temp-password', // Organizations don't need real passwords
          repoCid: commit.cid,
          repoRev: commit.rev,
          deactivated: false,
        })

        // Grant the creator full ownership of this organization repository
        // This makes them the owner through the SDS RBAC system
        await ctx.permissionManager.grantAccess(
          orgDid,
          creatorDid,
          {
            read: true,
            create: true,
            update: true,
            delete: true,
            admin: true,
            owner: true,
          },
          creatorDid, // Self-granted as the creator
        )

        // Organization is just a repository/account like a user account
        // No need for special organization records - the RBAC system defines ownership

        // Send the PLC operation
        await ctx.plcClient.sendOperation(orgDid, plcCreate.op)

        // Sequence the events
        await ctx.sequencer.sequenceIdentityEvt(orgDid, orgHandle)
        await ctx.sequencer.sequenceAccountEvt(orgDid, AccountStatus.Active)

        return {
          encoding: 'application/json',
          body: {
            did: orgDid,
            handle: orgHandle,
            name: name.trim(),
            description: description?.trim(),
            createdAt: new Date().toISOString(),
            // The creating user has full ownership rights through SDS RBAC
            permissions: {
              read: true,
              create: true,
              update: true,
              delete: true,
              admin: true,
              owner: true,
            },
            accessType: 'owner',
          },
        }
      } catch (error) {
        console.error('Error creating organization:', error)
        httpLogger.error(
          {
            err: error,
            type: error?.constructor?.name,
            message: error instanceof Error ? error.message : String(error),
            messageLength: error instanceof Error ? error.message?.length : -1,
            messageJSON:
              error instanceof Error ? JSON.stringify(error.message) : 'N/A',
          },
          'organization create handler error',
        )

        // Re-throw the original error if it's already an XRPC error
        if (error instanceof XRPCError) {
          throw error
        }

        // Extract meaningful error message
        const errorMsg =
          error instanceof Error && error.message?.trim()
            ? error.message
            : 'Unknown error occurred'

        throw new InvalidRequestError(
          `Failed to create organization: ${errorMsg}`,
        )
      }
    },
  })
}
