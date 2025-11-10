import { Kysely } from 'kysely'

/**
 * Migration to align SDS RBAC permissions with OAuth's granular action model
 * Transforms generic 'write' permission into specific 'create', 'update', 'delete' permissions
 */
export async function up(
  db: Kysely<{
    shared_repository_permissions: {
      repoDid: string
      userDid: string
      permissions: string
      grantedBy: string
      grantedAt: string
      revokedAt: string | null
    }
  }>,
): Promise<void> {
  // Get all existing permission records
  const records = await db
    .selectFrom('shared_repository_permissions')
    .select(['repoDid', 'userDid', 'permissions'])
    .execute()

  console.log(
    `Migrating ${records.length} permission records to granular model...`,
  )

  // Transform each record
  for (const record of records) {
    try {
      const oldPermissions = JSON.parse(record.permissions as string)
      const newPermissions: any = {
        read: oldPermissions.read ?? false,
        create: false,
        update: false,
        delete: false,
      }

      // Transform generic 'write' into granular permissions
      if (oldPermissions.write === true) {
        newPermissions.create = true
        newPermissions.update = true
        newPermissions.delete = true
      }

      // Preserve optional fields
      if (oldPermissions.admin !== undefined) {
        newPermissions.admin = oldPermissions.admin
      }
      if (oldPermissions.owner !== undefined) {
        newPermissions.owner = oldPermissions.owner
      }

      // Update the record
      await db
        .updateTable('shared_repository_permissions')
        .set({ permissions: JSON.stringify(newPermissions) })
        .where('repoDid', '=', record.repoDid)
        .where('userDid', '=', record.userDid)
        .execute()
    } catch (error) {
      console.error(
        `Failed to migrate permissions for ${record.repoDid}/${record.userDid}:`,
        error,
      )
      throw error
    }
  }

  console.log('✅ Permission migration completed successfully')
}

export async function down(
  db: Kysely<{
    shared_repository_permissions: {
      repoDid: string
      userDid: string
      permissions: string
      grantedBy: string
      grantedAt: string
      revokedAt: string | null
    }
  }>,
): Promise<void> {
  // Get all existing permission records
  const records = await db
    .selectFrom('shared_repository_permissions')
    .select(['repoDid', 'userDid', 'permissions'])
    .execute()

  console.log(`Rolling back ${records.length} permission records...`)

  // Transform each record back to old format
  for (const record of records) {
    try {
      const newPermissions = JSON.parse(record.permissions as string)
      const oldPermissions: any = {
        read: newPermissions.read ?? false,
        write: false,
      }

      // Transform granular permissions back to generic 'write'
      // User has 'write' if they have ANY of create/update/delete
      if (
        newPermissions.create === true ||
        newPermissions.update === true ||
        newPermissions.delete === true
      ) {
        oldPermissions.write = true
      }

      // Preserve optional fields
      if (newPermissions.admin !== undefined) {
        oldPermissions.admin = newPermissions.admin
      }
      if (newPermissions.owner !== undefined) {
        oldPermissions.owner = newPermissions.owner
      }

      // Update the record
      await db
        .updateTable('shared_repository_permissions')
        .set({ permissions: JSON.stringify(oldPermissions) })
        .where('repoDid', '=', record.repoDid)
        .where('userDid', '=', record.userDid)
        .execute()
    } catch (error) {
      console.error(
        `Failed to rollback permissions for ${record.repoDid}/${record.userDid}:`,
        error,
      )
      throw error
    }
  }

  console.log('✅ Permission rollback completed successfully')
}
