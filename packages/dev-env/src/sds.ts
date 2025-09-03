import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import getPort from 'get-port'
import * as ui8 from 'uint8arrays'
import { AtpAgent } from '@atproto/api'
import { Secp256k1Keypair, randomStr } from '@atproto/crypto'
import * as pds from '@atproto/pds'
import { SDS, SdsConfig } from '@atproto/sds'
import { ADMIN_PASSWORD, JWT_SECRET } from './const'

export interface SdsDevConfig {
  port?: number
  maxCollaborators?: number
  rotationKeyPath?: string
  // PDS connection for user identity verification
  pdsUrl?: string
}

export class TestSds {
  constructor(
    public url: string,
    public port: number,
    public server: SDS,
  ) {}

  static async create(config: SdsDevConfig = {}): Promise<TestSds> {
    const plcRotationKey = await Secp256k1Keypair.create({ exportable: true })
    const plcRotationPriv = ui8.toString(await plcRotationKey.export(), 'hex')
    const recoveryKey = (await Secp256k1Keypair.create()).did()

    const port = config.port || (await getPort({ port: 2585 })) // Different default port
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
      serviceHandleDomains: ['.sds.test', '.org.test'],
      bskyAppViewUrl: 'https://appview.invalid',
      bskyAppViewDid: 'did:example:invalid',
      bskyAppViewCdnUrlPattern: 'http://cdn.appview.com/%s/%s/%s',
      modServiceUrl: 'https://moderator.invalid',
      modServiceDid: 'did:example:invalid',
      plcRotationKeyK256PrivateKeyHex: plcRotationPriv,
      inviteRequired: false,
      disableSsrfProtection: true,
      serviceName: 'Development SDS (Organizations)',
      primaryColor: '#9c27b0', // Purple to distinguish from PDS
      primaryColorContrast: '#fff',
      errorColor: 'rgb(238, 0, 78)',
      logoUrl:
        // Using a different icon for SDS (organization/team icon)
        `data:image/svg+xml;base64,${Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M16 4c0-1.11.89-2 2-2s2 .89 2 2-.89 2-2 2-2-.89-2-2zM4 18v-1c0-2.66 5.33-4 8-4s8 1.34 8 4v1H4zM12 12c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4z"/><path d="M20.5 14.5V16c0 2.66-5.33 4-8 4s-8-1.34-8-4v-1.5c0-.83 2.39-1.5 5.33-1.5H15c1.66 0 3.17.33 4.33.83.39.17.67.5.67.83z" opacity="0.6"/></svg>', 'utf8').toString('base64')}`,
      homeUrl: 'https://bsky.social/',
      termsOfServiceUrl: 'https://bsky.social/about/support/tos',
      privacyPolicyUrl: 'https://bsky.social/about/support/privacy-policy',
      supportUrl: 'https://blueskyweb.zendesk.com/hc/en-us',
      // Connect to PDS for user identity verification
      didPlcUrl: config.pdsUrl
        ? `${config.pdsUrl.replace(/:\d+$/, ':2582')}`
        : 'http://localhost:2582',
    }

    const baseCfg = pds.envToCfg(env)
    const secrets = pds.envToSecrets(env)

    // Convert to SDS config with sharing options
    const sdsConfig: SdsConfig = {
      ...baseCfg,
      // For PoC: Use the same OAuth issuer as PDS to accept PDS tokens
      oauth: {
        ...baseCfg.oauth,
        issuer: config.pdsUrl || 'http://localhost:2583',
      },
      sharing: {
        maxCollaborators: config.maxCollaborators || 10,
        rotationKeyPath: config.rotationKeyPath,
      },
    }

    const server = await SDS.create(sdsConfig, secrets)

    await server.start()

    return new TestSds(url, port, server)
  }

  get ctx(): pds.AppContext {
    return this.server.ctx
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
    return { authorization: this.adminAuth() }
  }

  getClient() {
    return new AtpAgent({ service: this.url })
  }

  async close() {
    await this.server.destroy()
  }

  async processAll() {
    // Process any background tasks
    // In a real implementation, this might handle async operations
  }
}
