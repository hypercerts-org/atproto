// SDS List Collaborators Endpoint - Lists all users who have access to a repository
import { AuthRequiredError, InvalidRequestError } from '@atproto/xrpc-server'
import { Server } from '../../../../lexicon'
import { SdsAppContext } from '../../../../sds-context'

export default function (server: Server, ctx: SdsAppContext) {
  server.com.sds.repo.listCollaborators({
    auth: ctx.authVerifier.oauth(),
    rateLimit: [
      {
        name: 'sds-permission-read-unauth',
        calcKey: () => 'development', // Development mode - no user-specific limits
        calcPoints: () => 1,
      },
    ],
    handler: async ({ params }) => {
      const { repo, limit = 50, cursor } = params

      try {
        // Find the repository account
        const account = await ctx.authVerifier.findAccount(repo, {
          checkDeactivated: true,
          checkTakedown: true,
        })

        const repoDid = account.did

        // For PoC - allow public listing of collaborators
        // In production, you might want to add access control here

        // Get collaborators from permission manager
        const allCollaborators =
          await ctx.permissionManager.listCollaborators(repoDid)

        // Apply pagination (simple implementation - in production you might want more sophisticated pagination)
        let startIndex = 0
        if (cursor) {
          // Simple cursor implementation - in production you'd want something more robust
          try {
            startIndex = parseInt(cursor, 10)
          } catch {
            throw new InvalidRequestError('Invalid cursor format')
          }
        }

        const endIndex = Math.min(startIndex + limit, allCollaborators.length)
        const paginatedCollaborators = allCollaborators.slice(
          startIndex,
          endIndex,
        )

        // Generate next cursor if there are more results
        const nextCursor =
          endIndex < allCollaborators.length ? endIndex.toString() : undefined

        // Format collaborators for response
        const formattedCollaborators = paginatedCollaborators.map(
          (collaborator) => ({
            userDid: collaborator.userDid,
            permissions: collaborator.permissions,
            grantedBy: collaborator.grantedBy,
            grantedAt: collaborator.grantedAt,
            revokedAt: collaborator.revokedAt,
          }),
        )

        return {
          encoding: 'application/json',
          body: {
            collaborators: formattedCollaborators,
            cursor: nextCursor,
          },
        }
      } catch (error) {
        if (
          error instanceof InvalidRequestError ||
          error instanceof AuthRequiredError
        ) {
          throw error
        }

        console.error('Error listing repository collaborators:', error)
        throw new InvalidRequestError('Failed to list repository collaborators')
      }
    },
  })
}
