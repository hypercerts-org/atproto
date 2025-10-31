/* eslint-env node */

const { default: commonjs } = require('@rollup/plugin-commonjs')
const { default: html, makeHtmlAttributes } = require('@rollup/plugin-html')
const { default: json } = require('@rollup/plugin-json')
const { default: nodeResolve } = require('@rollup/plugin-node-resolve')
const { default: replace } = require('@rollup/plugin-replace')
const { default: swc } = require('@rollup/plugin-swc')
const { defineConfig } = require('rollup')
const {
  bundleManifest,
} = require('@atproto-labs/rollup-plugin-bundle-manifest')
const postcss = ((m) => m.default || m)(require('rollup-plugin-postcss'))
const serve = ((m) => m.default || m)(require('rollup-plugin-serve'))

module.exports = defineConfig((commandLineArguments) => {
  const NODE_ENV =
    process.env['NODE_ENV'] ??
    (commandLineArguments.watch ? 'development' : 'production')

  const devMode = NODE_ENV === 'development'

  return {
    input: 'src/main.tsx',
    output: {
      manualChunks: undefined,
      sourcemap: true,
      file: 'dist/main.js',
      format: 'iife',
    },
    plugins: [
      replace({
        preventAssignment: true,
        values: {
          'process.env.NODE_ENV': JSON.stringify(NODE_ENV),
          'process.env.PLC_DIRECTORY_URL': JSON.stringify(
            process.env.PLC_DIRECTORY_URL || undefined,
          ),
          'process.env.HANDLE_RESOLVER_URL': JSON.stringify(
            process.env.HANDLE_RESOLVER_URL || undefined,
          ),
          'process.env.SIGN_UP_URL': JSON.stringify(
            process.env.SIGN_UP_URL || undefined,
          ),
          'process.env.SDS_SERVER_URL': JSON.stringify(
            process.env.SDS_SERVER_URL || undefined,
          ),
          'process.env.CLIENT_URL': JSON.stringify(
            process.env.CLIENT_URL || undefined,
          ),
        },
      }),
      {
        name: 'resolve-swc-helpers',
        resolveId(src) {
          // For some reason, "nodeResolve" doesn't resolve these:
          if (src.startsWith('@swc/helpers/')) return require.resolve(src)
        },
      },
      nodeResolve({
        preferBuiltins: false,
        browser: true,
        // Bundle all dependencies except React itself
        exportConditions: ['browser', 'import', 'module', 'default'],
      }),
      commonjs(),
      json(),
      postcss({ config: true, extract: true, minimize: false }),
      swc({
        swc: {
          swcrc: false,
          configFile: false,
          sourceMaps: true,
          minify: !devMode,
          jsc: {
            minify: {
              compress: {
                module: true,
                unused: true,
              },
              mangle: true,
            },
            externalHelpers: true,
            target: 'es2020',
            parser: { syntax: 'typescript', tsx: true },
            transform: {
              useDefineForClassFields: true,
              react: { runtime: 'automatic' },
              optimizer: {
                simplify: true,
              },
            },
          },
        },
      }),
      html({
        title: 'OAuth Client Example',
        template: ({ attributes, files, meta, publicPath, title }) => `
          <!DOCTYPE html>
          <html${makeHtmlAttributes(attributes.html)}>
          <head>
            ${meta
              .map((attrs) => `<meta${makeHtmlAttributes(attrs)}>`)
              .join('\n')}
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <title>${title}</title>
            ${files.css
              .map(
                (asset) =>
                  `<link${makeHtmlAttributes({
                    ...attributes.link,
                    rel: 'stylesheet',
                    href: `${publicPath}${asset.fileName}`,
                  })}>`,
              )
              .join('\n')}
          </head>
          <body class="bg-slate-100 dark:bg-slate-800 min-h-screen">
            <div id="root"></div>
            ${files.js
              .map(
                (asset) =>
                  `<script${makeHtmlAttributes({
                    ...attributes.script,
                    src: `${publicPath}${asset.fileName}`,
                  })}></script>`,
              )
              .join('\n')}
          </body>
          </html>
        `,
      }),
      bundleManifest({ name: 'files.json', data: true }),
      {
        name: 'generate-client-metadata',
        generateBundle() {
          if (devMode) return // Skip in development (uses loopback client)

          // Detect deployment URL from environment
          // VERCEL_URL is available during Vercel builds
          // Fallback to VERCEL_PROJECT_PRODUCTION_URL or CLIENT_URL for custom config
          const deploymentUrl =
            process.env.VERCEL_PROJECT_PRODUCTION_URL ||
            process.env.VERCEL_URL ||
            process.env.CLIENT_URL

          if (!deploymentUrl) {
            console.warn(
              'No deployment URL found. Set VERCEL_URL, VERCEL_PROJECT_PRODUCTION_URL, or CLIENT_URL',
            )
            return
          }

          // Ensure https protocol (Vercel provides URL without protocol)
          const clientUrl = deploymentUrl.startsWith('http')
            ? deploymentUrl
            : `https://${deploymentUrl}`

          const metadata = {
            client_id: `${clientUrl}/client-metadata.json`,
            client_name: 'SDS Demo',
            client_uri: clientUrl,
            redirect_uris: [clientUrl],
            scope:
              'atproto account:email account:status blob:*/* repo:* rpc:*?aud=did:web:bsky.app#bsky_appview',
            grant_types: ['authorization_code', 'refresh_token'],
            response_types: ['code'],
            application_type: 'web',
            token_endpoint_auth_method: 'none',
            dpop_bound_access_tokens: true,
          }

          this.emitFile({
            type: 'asset',
            fileName: 'client-metadata.json',
            source: JSON.stringify(metadata, null, 2),
          })

          console.log(
            `Generated client-metadata.json for ${clientUrl}`,
          )
        },
      },

      commandLineArguments.watch &&
        serve({
          contentBase: 'dist',
          port: 8080,
          headers: { 'Cache-Control': 'no-store' },
        }),
    ],
    onwarn(warning, warn) {
      // 'use client' directives are fine
      if (warning.code === 'MODULE_LEVEL_DIRECTIVE') return
      warn(warning)
    },
  }
})
