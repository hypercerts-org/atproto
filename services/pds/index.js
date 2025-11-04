/* eslint-env node */

'use strict'

const {
  PDS,
  envToCfg,
  envToSecrets,
  httpLogger,
  readEnv,
} = require('@atproto/pds')
const pkg = require('@atproto/pds/package.json')

const main = async () => {
  const env = readEnv()
  env.version ??= pkg.version
  const cfg = envToCfg(env)
  const secrets = envToSecrets(env)

  httpLogger.info(
    `Starting PDS with port: ${cfg.service.port}, hostname: ${cfg.service.hostname}`,
  )

  const pds = await PDS.create(cfg, secrets)

  await pds.start()

  const address = pds.server?.address()
  const actualPort = address
    ? typeof address === 'string'
      ? address
      : address.port
    : 'unknown'
  const actualAddress = address
    ? typeof address === 'string'
      ? address
      : `${address.address}:${address.port}`
    : 'unknown'
  httpLogger.info(
    `PDS is running on ${actualAddress} (port: ${actualPort}, hostname: ${cfg.service.hostname})`,
  )
  // Graceful shutdown (see also https://aws.amazon.com/blogs/containers/graceful-shutdowns-with-ecs/)
  process.on('SIGTERM', async () => {
    httpLogger.info('PDS is stopping')
    await pds.destroy()
    httpLogger.info('PDS is stopped')
  })
}

main()
