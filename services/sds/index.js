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
  const sds = await SDS.create(cfg, secrets)

  await sds.start()

  httpLogger.info('sds is running')
  // Graceful shutdown (see also https://aws.amazon.com/blogs/containers/graceful-shutdowns-with-ecs/)
  process.on('SIGTERM', async () => {
    httpLogger.info('sds is stopping')
    await sds.destroy()
    httpLogger.info('sds is stopped')
  })
}

main()
