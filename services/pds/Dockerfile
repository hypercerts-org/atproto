FROM node:18-alpine as build

RUN npm install -g pnpm

# Install build dependencies for sharp
RUN apk add --no-cache python3 make g++ vips-dev python3-dev py3-setuptools

# Move files into the image and install
WORKDIR /app
COPY ./*.* ./
# NOTE pds's transitive dependencies go here: if that changes, this needs to be updated.
COPY ./packages/pds ./packages/pds
COPY ./packages/api ./packages/api
COPY ./packages/aws ./packages/aws
COPY ./packages/common ./packages/common
COPY ./packages/common-web ./packages/common-web
COPY ./packages/crypto ./packages/crypto
COPY ./packages/syntax ./packages/syntax
COPY ./packages/identity ./packages/identity
COPY ./packages/lex-cli ./packages/lex-cli
COPY ./packages/lexicon ./packages/lexicon
COPY ./packages/repo ./packages/repo
COPY ./packages/xrpc ./packages/xrpc
COPY ./packages/xrpc-server ./packages/xrpc-server
COPY ./services/pds ./services/pds

# install all deps
RUN pnpm install --frozen-lockfile
# Rebuild sharp for Alpine/musl (pnpm ignores build scripts, so reinstall with npm)
RUN find /app/node_modules -name "sharp" -type d -path "*/node_modules/sharp" | head -1 | xargs -I {} sh -c 'cd {} && rm -rf build && npm_config_platform=linuxmusl npm_config_arch=x64 npm install --ignore-scripts=false'
# build all packages with external node_modules
RUN ATP_BUILD_SHALLOW=true pnpm build
# update main with publishConfig
RUN pnpm update-main-to-dist
# clean up
RUN rm -rf node_modules
# install only prod deps, hoisted to root node_modules dir
RUN pnpm install --prod --shamefully-hoist --frozen-lockfile --prefer-offline
# Rebuild sharp again after production install
RUN find /app/node_modules -name "sharp" -type d -path "*/node_modules/sharp" | head -1 | xargs -I {} sh -c 'cd {} && rm -rf build && npm_config_platform=linuxmusl npm_config_arch=x64 npm install --ignore-scripts=false'

WORKDIR services/pds

# Uses assets from build stage to reduce build size
FROM node:18-alpine

# Install runtime dependencies for sharp (vips-cpp provides libvips-cpp.so.42)
RUN apk add --no-cache vips vips-cpp

RUN apk add --update dumb-init

# Avoid zombie processes, handle signal forwarding
ENTRYPOINT ["dumb-init", "--"]

WORKDIR /app/services/pds
COPY --from=build /app /app
RUN mkdir /app/data && chown node /app/data

EXPOSE 3000
ENV PDS_PORT=3000
ENV NODE_ENV=production

# https://github.com/nodejs/docker-node/blob/master/docs/BestPractices.md#non-root-user
USER node
CMD ["node", "--heapsnapshot-signal=SIGUSR2", "--enable-source-maps", "index.js"]

LABEL org.opencontainers.image.source=https://github.com/bluesky-social/atproto
LABEL org.opencontainers.image.description="ATP Personal Data Server (PDS)"
LABEL org.opencontainers.image.licenses=MIT
