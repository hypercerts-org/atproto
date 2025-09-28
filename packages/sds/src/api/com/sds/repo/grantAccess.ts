// SDS Grant Access Endpoint - Allows repository owners to grant access to collaborators
import { AuthRequiredError, InvalidRequestError } from '@atproto/xrpc-server'
import { Server } from '../../../../lexicon'
import { SdsAppContext } from '../../../../sds-context'
import { RepositoryPermissions, SdsPermissionError } from '../../../../types'

export default function (server: Server, ctx: SdsAppContext) {
  server.com.sds.repo.grantAccess({
    auth: ctx.authVerifier.authorization({
      authorize: () => {
        // Basic authentication required
      },
    }),
    rateLimit: [
      {
        name: 'sds-permission-write',
        calcKey: ({ auth }) => auth.credentials.did,
        calcPoints: () => 1,
      },
    ],
    handler: async ({ input, auth }) => {
      const { repo, userDid, permissions } = input.body
      const grantedByDid = auth.credentials.did

      try {
        // Validate permissions object
        if (!permissions || typeof permissions !== 'object') {
          throw new InvalidRequestError('Invalid permissions object')
        }

        if (
          typeof permissions.read !== 'boolean' ||
          typeof permissions.write !== 'boolean'
        ) {
          throw new InvalidRequestError(
            'Permissions must specify boolean values for read and write',
          )
        }

        // Find the repository account
        const account = await ctx.authVerifier.findAccount(repo, {
          checkDeactivated: true,
          checkTakedown: true,
        })

        const repoDid = account.did

        // Check if the authenticated user has permission to grant access
        // Only repository owners can grant access (for now)
        if (repoDid !== grantedByDid) {
          throw new AuthRequiredError(
            'Only repository owners can grant access to collaborators',
          )
        }

        // Prevent users from granting access to themselves
        if (userDid === repoDid) {
          throw new InvalidRequestError(
            'Cannot grant access to repository owner (access is implicit)',
          )
        }

        // Validate that the target user exists by checking if it's a valid DID
        // In a full implementation, you might want to verify the DID exists in your system
        if (!userDid.startsWith('did:')) {
          throw new InvalidRequestError('Invalid user DID format')
        }

        // Grant access through permission manager
        await ctx.permissionManager.grantAccess(
          repoDid,
          userDid,
          permissions as RepositoryPermissions,
          grantedByDid,
        )

        // Get the collaborator info to return
        const collaborators =
          await ctx.permissionManager.listCollaborators(repoDid)
        const collaborator = collaborators.find((c) => c.userDid === userDid)

        if (!collaborator) {
          throw new Error('Failed to retrieve granted permissions')
        }

        return {
          encoding: 'application/json',
          body: {
            success: true,
            grantedAt: collaborator.grantedAt,
            collaborator: {
              userDid: collaborator.userDid,
              permissions: collaborator.permissions,
              grantedBy: collaborator.grantedBy,
              grantedAt: collaborator.grantedAt,
            },
          },
        }
      } catch (error) {
        if (error instanceof SdsPermissionError) {
          throw new InvalidRequestError(error.message)
        }
        if (
          error instanceof InvalidRequestError ||
          error instanceof AuthRequiredError
        ) {
          throw error
        }

        console.error('Error granting repository access:', error)
        throw new InvalidRequestError('Failed to grant repository access')
      }
    },
  })
}
