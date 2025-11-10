// SDS Transfer Ownership Endpoint - Allows repository owners to transfer ownership
import { AuthRequiredError, InvalidRequestError } from '@atproto/xrpc-server'
import { Server } from '../../../../lexicon'
import { SdsAppContext } from '../../../../sds-context'

export default function (server: Server, ctx: SdsAppContext) {
  server.com.sds.repo.transferOwnership({
    auth: ctx.authVerifier.oauth(),
    rateLimit: [
      {
        name: 'sds-permission-write',
        calcKey: () => 'development', // Development mode - no user-specific limits
        calcPoints: () => 1,
      },
    ],
    handler: async ({ input, auth }) => {
      const { repo, newOwnerDid } = input.body
      const currentOwnerDid = (auth as any).credentials.did

      try {
        const account = await ctx.authVerifier.findAccount(repo, {
          checkDeactivated: true,
          checkTakedown: true,
        })
        const repoDid = account.did

        // Only current owner can transfer ownership
        const isOwner = await ctx.permissionManager.isOwner(
          repoDid,
          currentOwnerDid,
        )
        if (!isOwner) {
          throw new AuthRequiredError(
            'Only the repository owner can transfer ownership',
          )
        }

        // Cannot transfer to yourself
        if (newOwnerDid === currentOwnerDid) {
          throw new InvalidRequestError('Cannot transfer ownership to yourself')
        }

        // Validate new owner DID
        if (!newOwnerDid.startsWith('did:')) {
          throw new InvalidRequestError('Invalid new owner DID format')
        }

        // Grant owner role to new owner
        await ctx.permissionManager.grantAccess(
          repoDid,
          newOwnerDid,
          {
            read: true,
            create: true,
            update: true,
            delete: true,
            admin: true,
            owner: true,
          },
          currentOwnerDid,
        )

        // Demote current owner to admin
        await ctx.permissionManager.grantAccess(
          repoDid,
          currentOwnerDid,
          {
            read: true,
            create: true,
            update: true,
            delete: true,
            admin: true,
            owner: false,
          },
          newOwnerDid, // Granted by new owner
        )

        return {
          encoding: 'application/json',
          body: {
            success: true,
            previousOwner: currentOwnerDid,
            newOwner: newOwnerDid,
            transferredAt: new Date().toISOString(),
          },
        }
      } catch (error) {
        if (
          error instanceof InvalidRequestError ||
          error instanceof AuthRequiredError
        ) {
          throw error
        }

        console.error('Error transferring repository ownership:', error)
        throw new InvalidRequestError('Failed to transfer repository ownership')
      }
    },
  })
}
