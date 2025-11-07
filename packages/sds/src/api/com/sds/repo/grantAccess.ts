// SDS Grant Access Endpoint - Allows repository owners to grant access to collaborators
import { AuthRequiredError, InvalidRequestError } from '@atproto/xrpc-server'
import { Server } from '../../../../lexicon'
import { SdsAppContext } from '../../../../sds-context'
import { RepositoryPermissions, SdsPermissionError } from '../../../../types'

export default function (server: Server, ctx: SdsAppContext) {
  server.com.sds.repo.grantAccess({
    auth: ctx.authVerifier.oauth(),
    rateLimit: [
      {
        name: 'sds-permission-write',
        calcKey: () => 'development', // Development mode - no user-specific limits
        calcPoints: () => 1,
      },
    ],
    handler: async ({ input, auth }) => {
      const { repo, userDid, permissions } = input.body
      const grantedByDid = (auth as any).credentials.did

      try {
        // Find the repository account first to get repoDid
        const account = await ctx.authVerifier.findAccount(repo, {
          checkDeactivated: true,
          checkTakedown: true,
        })
        const repoDid = account.did

        // Validate permissions object
        if (!permissions || typeof permissions !== 'object') {
          throw new InvalidRequestError('Invalid permissions object')
        }

        // Validate granular permissions (aligned with unified model)
        if (
          typeof permissions.read !== 'boolean' ||
          typeof permissions.create !== 'boolean' ||
          typeof permissions.update !== 'boolean' ||
          typeof permissions.delete !== 'boolean'
        ) {
          throw new InvalidRequestError(
            'Permissions must specify boolean values for read, create, update, and delete',
          )
        }

        // Validate optional role permissions
        if (
          permissions.admin !== undefined &&
          typeof permissions.admin !== 'boolean'
        ) {
          throw new InvalidRequestError(
            'Admin permission must be a boolean value',
          )
        }

        if (
          permissions.owner !== undefined &&
          typeof permissions.owner !== 'boolean'
        ) {
          throw new InvalidRequestError(
            'Owner permission must be a boolean value',
          )
        }

        // Prevent granting to repository itself (although this shouldn't happen in RBAC model)
        if (userDid === repoDid) {
          throw new InvalidRequestError('Invalid target user DID')
        }

        // Prevent granting to yourself
        if (userDid === grantedByDid) {
          throw new InvalidRequestError('Cannot grant access to yourself')
        }

        // Check if granter can grant these specific permissions
        const permissionCheck = await ctx.permissionManager.canGrantPermissions(
          repoDid,
          grantedByDid,
          permissions as RepositoryPermissions,
        )

        if (!permissionCheck.canGrant) {
          throw new AuthRequiredError(
            permissionCheck.reason ||
              'Insufficient permissions to grant access',
          )
        }

        // Validate that the target user exists by checking if it's a valid DID
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
