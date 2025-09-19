import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import getPort from 'get-port'
import * as ui8 from 'uint8arrays'
import { AtpAgent } from '@atproto/api'
import { Secp256k1Keypair, randomStr } from '@atproto/crypto'
import * as pds from '@atproto/pds'
import { createSecretKeyObject } from '@atproto/pds'
import { SDS, SdsAppContext } from '@atproto/sds'
import { ADMIN_PASSWORD, EXAMPLE_LABELER, JWT_SECRET } from './const'
import { SdsConfig } from './types'

export class TestSds {
  constructor(
    public url: string,
    public port: number,
    public server: SDS,
  ) {}

  static async create(config: SdsConfig): Promise<TestSds> {
    const plcRotationKey = await Secp256k1Keypair.create({ exportable: true })
    const plcRotationPriv = ui8.toString(await plcRotationKey.export(), 'hex')
    const recoveryKey = (await Secp256k1Keypair.create()).did()

    const port = config.port || (await getPort())
    const url = `http://localhost:${port}`

    const blobstoreLoc = path.join(os.tmpdir(), randomStr(8, 'base32'))
    const dataDirectory = path.join(os.tmpdir(), randomStr(8, 'base32'))
    await fs.mkdir(dataDirectory, { recursive: true })

    const env: pds.ServerEnvironment = {
      devMode: true,
      port,
      dataDirectory: dataDirectory,
      blobstoreDiskLocation: blobstoreLoc,
      recoveryDidKey: recoveryKey,
      adminPassword: ADMIN_PASSWORD,
      jwtSecret: JWT_SECRET,
      dpopSecret: randomStr(32, 'hex'), // Generate 64-char hex string (32 bytes = 64 hex chars)
      // @NOTE ".example" will not actually work and is only used to display
      // multiple domains in the sing-up UI
      serviceHandleDomains: ['.test', '.example'],
      bskyAppViewUrl: 'https://appview.invalid',
      bskyAppViewDid: 'did:example:invalid',
      bskyAppViewCdnUrlPattern: 'http://cdn.appview.com/%s/%s/%s',
      modServiceUrl: 'https://moderator.invalid',
      modServiceDid: 'did:example:invalid',
      plcRotationKeyK256PrivateKeyHex: plcRotationPriv,
      inviteRequired: false,
      disableSsrfProtection: true,
      serviceName: 'Development SDS (Shared Data Server)',
      primaryColor: '#4f46e5',
      primaryColorContrast: '#fff',
      errorColor: 'rgb(220, 38, 127)',
      logoUrl:
        // Using a "data:" instead of a real URL to avoid making CORS requests in dev.
        // License: https://uxwing.com/license/
        // Source: https://uxwing.com/share-icon/
        `data:image/svg+xml;base64,${Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6"><path stroke-linecap="round" stroke-linejoin="round" d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.935-2.186 2.25 2.25 0 00-3.935 2.186z" /></svg>', 'utf8').toString('base64')}`,
      homeUrl: 'https://bsky.social/',
      termsOfServiceUrl: 'https://bsky.social/about/support/tos',
      privacyPolicyUrl: 'https://bsky.social/about/support/privacy-policy',
      supportUrl: 'https://blueskyweb.zendesk.com/hc/en-us',
      ...config,
    }
    const cfg = pds.envToCfg(env)
    const secrets = pds.envToSecrets(env)

    const server = await SDS.create(cfg, secrets)

    await server.start()

    return new TestSds(url, port, server)
  }

  get ctx(): SdsAppContext {
    return this.server.ctx
  }

  getClient(): AtpAgent {
    const agent = new AtpAgent({ service: this.url })
    agent.configureLabelers([EXAMPLE_LABELER])
    return agent
  }

  adminAuth(): string {
    return (
      'Basic ' +
      ui8.toString(
        ui8.fromString(`admin:${ADMIN_PASSWORD}`, 'utf8'),
        'base64pad',
      )
    )
  }

  adminAuthHeaders() {
    return {
      authorization: this.adminAuth(),
    }
  }

  jwtSecretKey() {
    return createSecretKeyObject(JWT_SECRET)
  }

  async processAll() {
    await this.ctx.backgroundQueue.processAll()
  }

  async close() {
    await this.server.destroy()
  }
}
