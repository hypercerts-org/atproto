// SDS List Collaborators Endpoint - Lists all users who have access to a repository
import { AuthRequiredError, InvalidRequestError } from '@atproto/xrpc-server'
import { Server } from '../../../../lexicon'
import { SdsAppContext } from '../../../../sds-context'

export default function (server: Server, ctx: SdsAppContext) {
  server.com.sds.repo.listCollaborators({
    auth: ctx.authVerifier.authorization({
      authorize: () => {
        // Authorization will be handled in the handler where we have access to the repo parameter
      },
    }),
    rateLimit: [
      {
        name: 'sds-permission-read',
        calcKey: ({ auth }) => auth.credentials.did,
        calcPoints: () => 1,
      },
    ],
    handler: async ({ params, auth }) => {
      const { repo, limit = 50, cursor } = params
      const requestorDid = auth.credentials.did

      try {
        // Find the repository account
        const account = await ctx.authVerifier.findAccount(repo, {
          checkDeactivated: true,
          checkTakedown: true,
        })

        const repoDid = account.did

        // Check if the authenticated user has permission to view collaborators
        // Repository owners can always view collaborators
        // Collaborators with read access can also view the collaborator list
        const hasAccess = await ctx.authVerifier.checkRepositoryAccess(
          repoDid,
          requestorDid,
          'read',
        )

        if (!hasAccess) {
          throw new AuthRequiredError(
            'Insufficient permissions to view repository collaborators',
          )
        }

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
