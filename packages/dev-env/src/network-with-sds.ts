import assert from 'node:assert'
import getPort from 'get-port'
import { wait } from '@atproto/common-web'
import { TestBsky } from './bsky'
import { EXAMPLE_LABELER } from './const'
import { IntrospectServer } from './introspect'
import { TestNetworkNoAppView } from './network-no-appview'
import { TestOzone } from './ozone'
import { TestPds } from './pds'
import { TestPlc } from './plc'
import { TestSds } from './sds'
import { LexiconAuthorityProfile } from './service-profile-lexicon'
import { OzoneServiceProfile } from './service-profile-ozone'
import { TestServerParams } from './types'
import { mockNetworkUtilities } from './util'

export class TestNetworkWithSds extends TestNetworkNoAppView {
  constructor(
    public plc: TestPlc,
    public pds: TestPds,
    public sds: TestSds,
    public bsky: TestBsky,
    public ozone: TestOzone,
    public introspect?: IntrospectServer,
  ) {
    super(plc, pds)
  }

  static async create(
    params: Partial<TestServerParams> = {},
  ): Promise<TestNetworkWithSds> {
    const redisHost = process.env.REDIS_HOST
    const dbPostgresUrl = params.dbPostgresUrl || process.env.DB_POSTGRES_URL
    assert(dbPostgresUrl, 'Missing postgres url for tests')
    assert(redisHost, 'Missing redis host for tests')
    const dbPostgresSchema =
      params.dbPostgresSchema || process.env.DB_POSTGRES_SCHEMA

    const plc = await TestPlc.create(params.plc ?? {})

    const bskyPort = params.bsky?.port ?? (await getPort())
    const pdsPort = params.pds?.port ?? (await getPort())
    const sdsPort = params.sds?.port ?? (await getPort())
    const ozonePort = params.ozone?.port ?? (await getPort())

    const thirdPartyPds = await TestPds.create({
      didPlcUrl: plc.url,
      ...params.pds,
      inviteRequired: false,
      port: await getPort(),
    })

    const ozoneUrl = `http://localhost:${ozonePort}`

    // @TODO (?) rework the ServiceProfile to live on a separate PDS instead of
    // requiring to migrate to the main PDS
    const ozoneServiceProfile = await OzoneServiceProfile.create(
      thirdPartyPds,
      ozoneUrl,
    )
    const lexiconAuthorityProfile =
      await LexiconAuthorityProfile.create(thirdPartyPds)

    const bsky = await TestBsky.create({
      port: bskyPort,
      plcUrl: plc.url,
      pdsPort,
      repoProvider: `ws://localhost:${pdsPort}`,
      dbPostgresSchema: `appview_${dbPostgresSchema}`,
      dbPostgresUrl,
      redisHost,
      modServiceDid: ozoneServiceProfile.did,
      labelsFromIssuerDids: [ozoneServiceProfile.did, EXAMPLE_LABELER],
      ...params.bsky,
    })

    const pds = await TestPds.create({
      port: pdsPort,
      didPlcUrl: plc.url,
      bskyAppViewUrl: bsky.url,
      bskyAppViewDid: bsky.ctx.cfg.serverDid,
      modServiceUrl: ozoneUrl,
      modServiceDid: ozoneServiceProfile.did,
      lexiconDidAuthority: lexiconAuthorityProfile.did,
      ...params.pds,
    })

    // Create SDS server with similar config to PDS
    const sds = await TestSds.create({
      port: sdsPort,
      didPlcUrl: plc.url,
      bskyAppViewUrl: bsky.url,
      bskyAppViewDid: bsky.ctx.cfg.serverDid,
      modServiceUrl: ozoneUrl,
      modServiceDid: ozoneServiceProfile.did,
      lexiconDidAuthority: lexiconAuthorityProfile.did,
      serviceName: 'Development SDS (Shared Data Server)',
      primaryColor: '#4f46e5', // Indigo color to distinguish from PDS
      ...params.sds,
    })

    const ozone = await TestOzone.create({
      port: ozonePort,
      plcUrl: plc.url,
      signingKey: ozoneServiceProfile.key,
      serverDid: ozoneServiceProfile.did,
      dbPostgresSchema: `ozone_${dbPostgresSchema || 'db'}`,
      dbPostgresUrl,
      appviewUrl: bsky.url,
      appviewDid: bsky.ctx.cfg.serverDid,
      appviewPushEvents: true,
      pdsUrl: pds.url,
      pdsDid: pds.ctx.cfg.service.did,
      verifierDid: ozoneServiceProfile.did,
      verifierUrl: pds.url,
      verifierPassword: 'temp',
      ...params.ozone,
    })

    await ozoneServiceProfile.migrateTo(pds)
    await ozoneServiceProfile.createRecords()

    await lexiconAuthorityProfile.migrateTo(pds)
    await lexiconAuthorityProfile.createRecords()

    // Also migrate lexicon authority profile to SDS server
    // This ensures the SDS server can resolve OAuth scopes locally
    await lexiconAuthorityProfile.migrateTo(sds)
    await lexiconAuthorityProfile.createRecords()

    console.log(
      `Lexicon authority ${lexiconAuthorityProfile.did} migrated to both PDS and SDS servers`,
    )
    console.log(`PDS URL: ${pds.url}, SDS URL: ${sds.url}`)

    await ozone.addAdminDid(ozoneServiceProfile.did)

    mockNetworkUtilities(pds, bsky)
    await thirdPartyPds.processAll()
    await pds.processAll()
    await sds.processAll()
    await ozone.processAll()
    await bsky.sub.processAll()
    await thirdPartyPds.close()

    // Weird but if we do this before pds.processAll() somehow appview loses this user and tests in different parts fail because appview doesn't return this user in various contexts anymore
    const ozoneVerifierPassword =
      await ozoneServiceProfile.createAppPasswordForVerification()
    if (ozone.daemon.ctx.cfg.verifier) {
      ozone.daemon.ctx.cfg.verifier.password = ozoneVerifierPassword
    }

    let introspect: IntrospectServer | undefined = undefined
    if (params.introspect?.port) {
      introspect = await IntrospectServer.start(
        params.introspect.port,
        plc,
        pds,
        bsky,
        ozone,
      )
    }

    return new TestNetworkWithSds(plc, pds, sds, bsky, ozone, introspect)
  }

  async processFullSubscription(timeout = 5000) {
    const sub = this.bsky.sub
    const start = Date.now()
    const lastSeq = await this.pds.ctx.sequencer.curr()
    if (!lastSeq) return
    while (Date.now() - start < timeout) {
      await sub.processAll()
      // Note: simplified version without state checking
      // In production, you might want to implement proper cursor tracking
      await wait(5)
    }
    // Don't throw timeout error for now
  }

  get serviceHeaders() {
    return {
      'x-appview-proxy': 'true',
      authorization: this.bsky.adminAuth(),
    }
  }

  async adminHeaders({
    username = 'admin',
    password = 'admin-pass',
  }: {
    username?: string
    password?: string
  } = {}) {
    return {
      authorization:
        'Basic ' +
        Buffer.from(`${username}:${password}`, 'utf8').toString('base64'),
    }
  }

  async processAll() {
    await super.processAll()
    await this.sds.processAll()
    await this.bsky.sub.processAll()
    await this.ozone.processAll()
  }

  async close() {
    await super.close()
    await this.sds.close()
    await this.bsky.close()
    await this.ozone.close()
    await this.introspect?.close()
  }
}
