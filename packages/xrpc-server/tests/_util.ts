import { once } from 'node:events'
import * as http from 'node:http'
import express from 'express'
import * as xrpc from '../src'
import { AuthRequiredError } from '../src'
import { extractUrlNsid } from '../src/util'

export async function createServer(server: xrpc.Server): Promise<http.Server> {
  const app = express()
  app.use(server.router)
  const httpServer = http.createServer(app)
  if (server.subscriptions.size > 0) {
    httpServer.on('upgrade', (req, socket, head) => {
      const nsid = req.url ? extractUrlNsid(req.url) : undefined
      const sub = nsid ? server.subscriptions.get(nsid) : undefined
      if (!sub) return socket.destroy()
      sub.wss.handleUpgrade(req, socket, head, (ws) =>
        sub.wss.emit('connection', ws, req),
      )
    })
  }
  httpServer.listen(0)
  await once(httpServer, 'listening')
  return httpServer
}

export async function closeServer(httpServer: http.Server) {
  await new Promise((r) => {
    httpServer.close(() => r(undefined))
  })
}

export function createBasicAuth(allowed: {
  username: string
  password: string
}) {
  return function (ctx: { req: http.IncomingMessage }) {
    const header = ctx.req.headers.authorization ?? ''
    if (!header.startsWith('Basic ')) {
      throw new AuthRequiredError()
    }
    const original = header.replace('Basic ', '')
    const [username, password] = Buffer.from(original, 'base64')
      .toString()
      .split(':')
    if (username !== allowed.username || password !== allowed.password) {
      throw new AuthRequiredError()
    }
    return {
      credentials: { username },
      artifacts: { original },
    }
  }
}

export function basicAuthHeaders(creds: {
  username: string
  password: string
}) {
  return {
    authorization:
      'Basic ' +
      Buffer.from(`${creds.username}:${creds.password}`).toString('base64'),
  }
}
