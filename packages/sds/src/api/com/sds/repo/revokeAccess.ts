// SDS Revoke Access Endpoint - Allows repository owners to revoke access from collaborators
import { AuthRequiredError, InvalidRequestError } from '@atproto/xrpc-server'
import { Server } from '../../../../lexicon'
import { SdsAppContext } from '../../../../sds-context'
import { SdsPermissionError } from '../../../../types'

export default function (server: Server, ctx: SdsAppContext) {
  server.com.sds.repo.revokeAccess({
    auth: ctx.authVerifier.oauth(),
    rateLimit: [
      {
        name: 'sds-permission-write',
        calcKey: () => 'development', // Development mode - no user-specific limits
        calcPoints: () => 1,
      },
    ],
    handler: async ({ input, auth }) => {
      const { repo, userDid } = input.body
      const revokedByDid = (auth as any).credentials.did

      try {
        // Find the repository account
        const account = await ctx.authVerifier.findAccount(repo, {
          checkDeactivated: true,
          checkTakedown: true,
        })

        const repoDid = account.did

        // Prevent revoking from repository itself
        if (userDid === repoDid) {
          throw new InvalidRequestError('Invalid target user DID')
        }

        // Check if revoker can manage the target user
        const managementCheck = await ctx.permissionManager.canManageUser(
          repoDid,
          revokedByDid,
          userDid,
        )

        if (!managementCheck.canManage) {
          throw new AuthRequiredError(
            managementCheck.reason ||
              'Insufficient permissions to revoke access',
          )
        }

        // Validate that the target user exists by checking if it's a valid DID
        if (!userDid.startsWith('did:')) {
          throw new InvalidRequestError('Invalid user DID format')
        }

        // Revoke access through permission manager
        await ctx.permissionManager.revokeAccess(repoDid, userDid, revokedByDid)

        const revokedAt = new Date().toISOString()

        return {
          encoding: 'application/json',
          body: {
            success: true,
            revokedAt,
          },
        }
      } catch (error) {
        if (error instanceof SdsPermissionError) {
          if (error.message.includes('does not have access')) {
            throw new InvalidRequestError(
              'User does not have active access to this repository',
              'AccessNotFound',
            )
          }
          throw new InvalidRequestError(error.message)
        }
        if (
          error instanceof InvalidRequestError ||
          error instanceof AuthRequiredError
        ) {
          throw error
        }

        console.error('Error revoking repository access:', error)
        throw new InvalidRequestError('Failed to revoke repository access')
      }
    },
  })
}
