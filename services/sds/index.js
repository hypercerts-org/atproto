/* eslint-env node */

'use strict'

const {
  SDS,
  envToCfg,
  envToSecrets,
  httpLogger,
  readEnv,
} = require('@atproto/sds')
const pkg = require('@atproto/sds/package.json')

const main = async () => {
  const env = readEnv()
  env.version ??= pkg.version
  const cfg = envToCfg(env)
  const secrets = envToSecrets(env)

  httpLogger.info(
    `Starting SDS with port: ${cfg.service.port}, hostname: ${cfg.service.hostname}`,
  )

  const sds = await SDS.create(cfg, secrets)

  await sds.start()

  const address = sds.server?.address()
  const actualPort = address
    ? typeof address === 'string'
      ? address
      : address.port
    : 'unknown'
  httpLogger.info(`SDS is running on port ${actualPort}`)

  // TLS check endpoint for Caddy on-demand TLS
  sds.app.get('/tls-check', (req, res) => {
    checkHandleRoute(sds, req, res)
  })

  // Graceful shutdown (see also https://aws.amazon.com/blogs/containers/graceful-shutdowns-with-ecs/)
  process.on('SIGTERM', async () => {
    httpLogger.info('sds is stopping')
    await sds.destroy()
    httpLogger.info('sds is stopped')
  })
}

async function checkHandleRoute(sds, req, res) {
  try {
    const { domain } = req.query
    if (!domain || typeof domain !== 'string') {
      return res.status(400).json({
        error: 'InvalidRequest',
        message: 'bad or missing domain query param',
      })
    }
    if (domain === sds.ctx.cfg.service.hostname) {
      return res.json({ success: true })
    }
    const isHostedHandle = sds.ctx.cfg.identity.serviceHandleDomains.find(
      (avail) => domain.endsWith(avail),
    )
    if (!isHostedHandle) {
      return res.status(400).json({
        error: 'InvalidRequest',
        message: 'handles are not provided on this domain',
      })
    }
    const account = await sds.ctx.accountManager.getAccount(domain)
    if (!account) {
      return res.status(404).json({
        error: 'NotFound',
        message: 'handle not found for this domain',
      })
    }
    return res.json({ success: true })
  } catch (err) {
    httpLogger.error({ err }, 'check handle failed')
    return res.status(500).json({
      error: 'InternalServerError',
      message: 'Internal Server Error',
    })
  }
}

main()
