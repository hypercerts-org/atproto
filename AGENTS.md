# AGENTS.md

This file provides guidance to AI agents when working with code in this repository.

## Overview

This is the Hypercerts fork of Bluesky's reference implementation of AT Protocol (atproto) - a decentralized social media protocol. The codebase is a pnpm monorepo containing TypeScript packages for both protocol libraries and application services.

Details of the differences of this fork are given below. Also, the `.ai/` directory contains specifications, implementation plans, and other resources specifically created for AI-assisted work on this repository.

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

## Hypercerts Fork Differences

This is a hypercerts fork of the upstream Bluesky AT Protocol implementation that adds **Shared Data Server (SDS)** functionality for collaborative repositories. The fork maintains full compatibility with the upstream AT Protocol while extending it with multi-user data sharing capabilities.

### Key Differences from Upstream

**New Packages:**

- **`packages/sds/`** - Shared Data Server implementation extending PDS with collaborative features
- **`packages/sds-demo/`** - Web-based demo application showcasing SDS functionality

**Core SDS Features:**

- **Multi-user shared repositories** - Enable multiple users to collaborate on data repositories
- **Role-based access control (RBAC)** - Granular permissions (read/write/admin) for repository access
- **Permission management system** - Grant/revoke access, list collaborators, audit logs
- **Organization support** - Create dedicated repositories for organizations with shared ownership

**Architecture Approach:**

- **Copy-and-modify strategy** - SDS is a complete copy of PDS with internal modifications rather than inheritance
- **Full PDS compatibility** - SDS maintains 100% API compatibility for seamless federation with existing PDS instances
- **Enhanced authentication** - Extended auth verifier with shared repository permission checks
- **Database extensions** - Additional tables for sharing permissions and audit logging

**SDS-Specific API Endpoints:**

- `com.sds.organization.*` - Organization creation and management
- `com.sds.repo.*` - Repository sharing and permission management (grantAccess, revokeAccess, listCollaborators, getPermissions)

**Authentication Extensions:**

- **DPoP token validation** - SDS endpoints require DPoP (Demonstrated Proof of Possession) tokens for security
- **Cross-repository access** - Users can access repositories they have permissions for, not just their own
- **Federated token validation** - Support for validating tokens issued by different PDS instances

**Demo Application:**

- **OAuth integration** - Full OAuth flow with both PDS and SDS servers
- **Repository dashboard** - Visual interface for managing owned and shared repositories
- **Collaboration tools** - Grant/revoke permissions, view collaborators, create shared content
- **Multi-server agent** - Smart routing between PDS and SDS servers based on lexicon namespaces

**Implementation Status:**

- **Production ready** - SDS server and demo app are fully functional
- **Federation compatible** - Can federate with upstream PDS instances
- **Well-documented** - Comprehensive implementation plans in `.ai/SDS-implementation-plan.md` and `.ai/SDS-authentication.md`

For detailed implementation details, see:

- `.ai/SDS-implementation-plan.md` - Complete SDS development roadmap and architecture decisions
- `.ai/SDS-authentication.md` - SDS authentication flow and security model
- `packages/sds/` - SDS server source code
- `packages/sds-demo/` - Demo application source code
