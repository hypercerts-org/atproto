# AGENTS.md

This file provides guidance to AI agents when working with code in this repository.

## Overview

This is Bluesky's reference implementation of AT Protocol (atproto) - a decentralized social media protocol. The codebase is a pnpm monorepo containing TypeScript packages for both protocol libraries and application services.

## Common Commands

```bash
# Install dependencies
pnpm install --frozen-lockfile

# Build all packages (must run after install and before tests)
pnpm build

# Run all tests (requires Docker for PostgreSQL and Redis)
pnpm test

# Run tests for a specific package
pnpm --filter @atproto/pds test

# Limit the number of parallel test workers
pnpm --filter @atproto/pds test -- --maxWorkers=4

# Run a single test file
cd packages/<package-name> && pnpm jest path/to/test.test.ts

# Type checking
pnpm verify:types

# Linting and formatting
pnpm lint          # Check for lint errors
pnpm lint:fix      # Fix lint errors
pnpm style         # Check formatting
pnpm style:fix     # Fix formatting
pnpm format        # Run both lint:fix and style:fix

# Regenerate TypeScript code from lexicons
pnpm codegen

# Run local development environment with test accounts
make run-dev-env
```

## Architecture

### Package Structure

- **packages/** - Main packages published to npm as `@atproto/*`
- **packages/internal/** - Internal packages as `@atproto-labs/*`
- **packages/oauth/** - OAuth-related packages as `@atproto/*`
- **services/** - Runtime wrappers for deployable services

### Key Packages

**Protocol Libraries:**

- `api` - Client library for atproto/Bluesky (includes generated lexicon types)
- `lexicon` - Schema validation using Lexicon (atproto's schema language)
- `repo` - Repository implementation (Merkle Search Tree data structure)
- `syntax` - Identifier parsing (handles, NSIDs, AT URIs)
- `crypto` - Cryptographic operations
- `xrpc` / `xrpc-server` - HTTP API client/server

**Services:**

- `pds` - Personal Data Server (user data hosting)
- `bsky` - AppView (`app.bsky.*` API implementation)
- `ozone` - Moderation service

### Lexicons

Schema definitions in `lexicons/` directory define the API:

- `com/atproto/*` - Core protocol APIs
- `app/bsky/*` - Bluesky application APIs
- `chat/bsky/*` - Chat APIs
- `tools/ozone/*` - Moderation APIs

Run `pnpm codegen` after modifying lexicons to regenerate TypeScript types.

## Testing

Tests require Docker services (PostgreSQL on port 5433, Redis on port 6380). The test runner script `packages/dev-infra/with-test-redis-and-db.sh` manages containers automatically.

For SQLite-only tests (no Docker): `cd packages/pds && pnpm test:sqlite`

To limit the maximum number of test workers (useful for resource-constrained environments, but you should never use more than 80% of available CPUs):

    pnpm test -- --maxWorkers=2

## Database

- PostgreSQL 14 for production services
- SQLite option for PDS (development/small deployments)
- Kysely for query building
- Migrations in `packages/<service>/src/db/migrations/`
