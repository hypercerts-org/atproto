import { Kysely } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  // Core sharing permissions table
  await db.schema
    .createTable('shared_repository_permissions')
    .addColumn('repoDid', 'varchar', (col) => col.notNull())
    .addColumn('userDid', 'varchar', (col) => col.notNull())
    .addColumn('permissions', 'varchar', (col) =>
      col.notNull().defaultTo('{"read":true,"write":true}'),
    )
    .addColumn('grantedBy', 'varchar', (col) => col.notNull())
    .addColumn('grantedAt', 'varchar', (col) =>
      col.notNull().defaultTo(new Date().toISOString()),
    )
    .addColumn('revokedAt', 'varchar')
    .addPrimaryKeyConstraint('shared_repository_permissions_pkey', [
      'repoDid',
      'userDid',
    ])
    .execute()

  // Audit log for all permission changes
  await db.schema
    .createTable('permission_audit_log')
    .addColumn('id', 'integer', (col) => col.autoIncrement().primaryKey())
    .addColumn('repoDid', 'varchar', (col) => col.notNull())
    .addColumn('userDid', 'varchar', (col) => col.notNull())
    .addColumn('action', 'varchar', (col) => col.notNull()) // 'grant', 'revoke', 'modify'
    .addColumn('permissionsBefore', 'varchar') // Previous permissions (JSON)
    .addColumn('permissionsAfter', 'varchar') // New permissions (JSON)
    .addColumn('changedBy', 'varchar', (col) => col.notNull())
    .addColumn('changedAt', 'varchar', (col) =>
      col.notNull().defaultTo(new Date().toISOString()),
    )
    .execute()

  // Indexes for performance
  await db.schema
    .createIndex('idx_shared_repo_perms_user')
    .on('shared_repository_permissions')
    .column('userDid')
    .execute()

  await db.schema
    .createIndex('idx_shared_repo_perms_repo')
    .on('shared_repository_permissions')
    .column('repoDid')
    .execute()

  await db.schema
    .createIndex('idx_permission_audit_repo')
    .on('permission_audit_log')
    .column('repoDid')
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropIndex('idx_permission_audit_repo').execute()
  await db.schema.dropIndex('idx_shared_repo_perms_repo').execute()
  await db.schema.dropIndex('idx_shared_repo_perms_user').execute()
  await db.schema.dropTable('permission_audit_log').execute()
  await db.schema.dropTable('shared_repository_permissions').execute()
}
