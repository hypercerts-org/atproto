import { InvalidRequestError } from '@atproto/xrpc-server'
import { Server } from '../../../../lexicon'
import { SdsAppContext } from '../../../../sds-context'

export default function (server: Server, ctx: SdsAppContext) {
  server.com.sds.organization.list({
    auth: ctx.authVerifier.oauth(),
    handler: async ({ params }) => {
      const { userDid } = params

      if (!userDid) {
        throw new InvalidRequestError('User DID is required')
      }

      console.log('[SDS] Organization list handler - user DID:', userDid)

      try {
        // Get list of repositories this user has access to
        const repoDids =
          await ctx.permissionManager.listUserRepositories(userDid)

        const organizations: any[] = []

        // For each repository the user has access to, get the account information and permissions
        for (const repoDid of repoDids) {
          try {
            const account = await ctx.accountManager.getAccount(repoDid)
            const permissions = await ctx.permissionManager.getPermissions(
              repoDid,
              userDid,
            )

            if (account && account.handle && permissions) {
              const isOwner = repoDid === userDid || permissions.owner === true

              const normalizedPermissions = {
                read: permissions.read ?? false,
                create: permissions.create ?? false,
                update: permissions.update ?? false,
                delete: permissions.delete ?? false,
                admin: permissions.admin ?? false,
                owner: permissions.owner ?? false,
              }

              if (isOwner) {
                normalizedPermissions.owner = true
                normalizedPermissions.admin = true
                normalizedPermissions.read = true
                normalizedPermissions.create = true
                normalizedPermissions.update = true
                normalizedPermissions.delete = true
              }

              const hasSharedAccess =
                normalizedPermissions.read ||
                normalizedPermissions.create ||
                normalizedPermissions.update ||
                normalizedPermissions.delete

              const accessType = normalizedPermissions.owner
                ? 'owner'
                : hasSharedAccess
                  ? 'shared'
                  : 'none'

              // This is a valid organization/repository
              const org = {
                did: repoDid,
                handle: account.handle,
                name: account.handle.replace(/-\d+$/, ''), // Remove timestamp suffix for display
                description: '', // Organizations don't have descriptions stored in account
                createdAt: account.createdAt || new Date().toISOString(),
                permissions: normalizedPermissions,
                accessType,
              }
              organizations.push(org)
            }
          } catch (error) {
            console.error(`Error fetching account for ${repoDid}:`, error)
            // Skip this repository if we can't fetch account info
          }
        }

        console.log(
          `[SDS] Found ${organizations.length} organizations for user ${userDid}`,
        )

        return {
          encoding: 'application/json',
          body: {
            organizations,
          },
        }
      } catch (error) {
        console.error('Error listing organizations:', error)
        throw new InvalidRequestError(
          `Failed to list organizations: ${error instanceof Error ? error.message : 'Unknown error'}`,
        )
      }
    },
  })
}
