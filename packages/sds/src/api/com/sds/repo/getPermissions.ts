// SDS Get Permissions Endpoint - Gets current user's permissions for a repository
import { InvalidRequestError } from '@atproto/xrpc-server'
import { Server } from '../../../../lexicon'
import { SdsAppContext } from '../../../../sds-context'

export default function (server: Server, ctx: SdsAppContext) {
  server.com.sds.repo.getPermissions({
    auth: ctx.authVerifier.oauth(),
    rateLimit: [
      {
        name: 'sds-permission-read-unauth',
        calcKey: () => 'development', // Development mode - no user-specific limits
        calcPoints: () => 1,
      },
    ],
    handler: async ({ params }) => {
      const { repo, userDid } = params

      try {
        // Find the repository account
        const account = await ctx.authVerifier.findAccount(repo, {
          checkDeactivated: true,
          checkTakedown: true,
        })

        const repoDid = account.did

        // For PoC - allow querying permissions for any user/repo combination
        // userDid parameter is required for this endpoint
        if (!userDid) {
          throw new InvalidRequestError('userDid parameter is required')
        }

        // Check if this is the repository owner
        if (repoDid === userDid) {
          return {
            encoding: 'application/json',
            body: {
              permissions: {
                read: true,
                write: true,
                admin: true,
              },
              accessType: 'owner',
            },
          }
        }

        // Check for shared permissions
        const sharedPermissions = await ctx.permissionManager.getPermissions(
          repoDid,
          userDid,
        )

        if (sharedPermissions) {
          // Get collaborator info to include grant details
          const collaborators =
            await ctx.permissionManager.listCollaborators(repoDid)
          const collaborator = collaborators.find((c) => c.userDid === userDid)

          return {
            encoding: 'application/json',
            body: {
              permissions: sharedPermissions,
              accessType: 'shared',
              grantedBy: collaborator?.grantedBy,
              grantedAt: collaborator?.grantedAt,
            },
          }
        }

        // No access
        return {
          encoding: 'application/json',
          body: {
            permissions: {
              read: false,
              write: false,
              admin: false,
            },
            accessType: 'none',
          },
        }
      } catch (error) {
        if (error instanceof InvalidRequestError) {
          throw error
        }

        console.error('Error getting repository permissions:', error)
        throw new InvalidRequestError('Failed to get repository permissions')
      }
    },
  })
}
