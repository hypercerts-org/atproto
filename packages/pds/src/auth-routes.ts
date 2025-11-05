import { Router } from 'express'
import {
  HandleUnavailableError,
  InvalidRequestError,
  SecondAuthenticationFactorRequiredError,
  UseDpopNonceError,
  oauthMiddleware,
  oauthProtectedResourceMetadataSchema,
} from '@atproto/oauth-provider'
import AppContext from './context'
import { oauthLogger, reqSerializer } from './logger'

export const createRouter = (ctx: AppContext): Router => {
  const router = Router()

  const publicUrl = ctx.cfg.service.publicUrl || `https://${ctx.cfg.service.hostname}`
  const oauthProtectedResourceMetadata =
    oauthProtectedResourceMetadataSchema.parse({
      resource: publicUrl,
      authorization_servers: [publicUrl],
      bearer_methods_supported: ['header'],
      scopes_supported: [],
      resource_documentation: 'https://atproto.com',
    })

  if (
    !oauthProtectedResourceMetadata.resource.startsWith('https://')
  ) {
    throw new Error('Resource URL must use the https scheme')
  }

  router.get('/.well-known/oauth-protected-resource', (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Method', '*')
    res.setHeader('Access-Control-Allow-Headers', '*')
    res.status(200).json(oauthProtectedResourceMetadata)
  })

  if (ctx.oauthProvider) {
    router.use(
      oauthMiddleware(ctx.oauthProvider, {
        onError: (req, res, err, msg) => {
          if (!ignoreError(err)) {
            oauthLogger.error({ err, req: reqSerializer(req) }, msg)
          }
        },
      }),
    )
  }

  return router
}

function ignoreError(err: unknown): boolean {
  if (err instanceof InvalidRequestError) {
    return err.error_description === 'Invalid identifier or password'
  }

  return (
    err instanceof UseDpopNonceError ||
    err instanceof HandleUnavailableError ||
    err instanceof SecondAuthenticationFactorRequiredError
  )
}

