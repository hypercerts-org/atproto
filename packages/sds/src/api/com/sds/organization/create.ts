import * as plc from '@did-plc/lib'
import { Secp256k1Keypair } from '@atproto/crypto'
import { InvalidRequestError } from '@atproto/xrpc-server'
import { AccountStatus } from '../../../../account-manager/helpers/account'
import { Server } from '../../../../lexicon'
import { prepareCreate } from '../../../../repo'
import { SdsAppContext } from '../../../../sds-context'

export default function (server: Server, ctx: SdsAppContext) {
  server.com.sds.organization.create({
    auth: ctx.authVerifier.unauthenticated,
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
    handler: async ({ input, auth }) => {
      const { name, description, handle, creatorDid } = input.body

      if (!creatorDid) {
        throw new InvalidRequestError('Creator DID is required')
      }

      console.log('[SDS] Organization create handler - creator DID:', creatorDid)

      if (!name?.trim()) {
        throw new InvalidRequestError('Organization name is required')
      }

      // Generate a unique handle if not provided
      const orgHandle =
        handle ||
        `${name.trim().toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`

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
          { read: true, write: true, admin: true, owner: true },
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
              write: true,
              admin: true,
              owner: true,
            },
            accessType: 'owner',
          },
        }
      } catch (error) {
        console.error('Error creating organization:', error)
        throw new InvalidRequestError(
          `Failed to create organization: ${error instanceof Error ? error.message : 'Unknown error'}`,
        )
      }
    },
  })
}
