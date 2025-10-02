// SDS Grant Access Endpoint - Allows repository owners to grant access to collaborators
import { AuthRequiredError, InvalidRequestError } from '@atproto/xrpc-server'
import { Server } from '../../../../lexicon'
import { ids } from '../../../../lexicon/lexicons'
import { SdsAppContext } from '../../../../sds-context'
import { RepositoryPermissions, SdsPermissionError } from '../../../../types'

export default function (server: Server, ctx: SdsAppContext) {
  server.com.sds.repo.grantAccess({
    auth: ctx.authVerifier.authorization({
      authorize: (permissions, authCtx) => {
        // Use standard AT Protocol repository permissions - no RPC scope needed
        // The repo:* scope from the user's PDS should be sufficient
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
        // Find the repository account first to get repoDid
        const account = await ctx.authVerifier.findAccount(repo, {
          checkDeactivated: true,
          checkTakedown: true,
        })
        const repoDid = account.did

        // Validate OAuth scope for repository collaboration management using standard repo permissions
        if (auth.credentials.type === 'oauth') {
          auth.credentials.permissions.assertRepo({
            collection: 'com.sds.repo.collaborators',
            action: 'create',
          })
        }
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

        // Validate admin permission if provided
        if (permissions.admin !== undefined && typeof permissions.admin !== 'boolean') {
          throw new InvalidRequestError(
            'Admin permission must be a boolean value',
          )
        }

        // Check if the authenticated user has permission to grant access
        // Repository owners and users with admin permissions can grant access
        const isOwner = await ctx.permissionManager.isOwner(repoDid, grantedByDid)
        const hasAdminAccess = await ctx.permissionManager.checkAccess(repoDid, grantedByDid, 'admin')

        console.log(`[SDS] Grant access permission check - Owner: ${isOwner}, Admin: ${hasAdminAccess}, User: ${grantedByDid}, Repo: ${repoDid}`)

        if (!isOwner && !hasAdminAccess) {
          throw new AuthRequiredError(
            'Only repository owners and admin users can grant access to collaborators',
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
