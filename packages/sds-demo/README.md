# SDS Demo Application

A demonstration application showcasing the Shared Data Server (SDS) collaborative features built on the ATProto ecosystem.

## Overview

This demo application demonstrates the key capabilities of SDS:

- **Shared Repository Management**: Create and manage repositories that can be collaboratively edited
- **Permission System**: Grant and revoke read/write access to collaborators
- **Collaborative Content Creation**: Multiple users can contribute to shared repositories
- **Real-time Collaboration**: View collaboration activity and manage access in real-time

## Features

### 🔐 Authentication

- OAuth-based authentication with SDS server
- Secure session management
- User profile integration

### 📚 Repository Dashboard

- View owned repositories
- Access shared repositories from other users
- Visual permission indicators (Owner/Read/Write)
- Collaboration statistics

### 👥 Collaboration Panel

- Invite collaborators by DID or handle
- Set granular permissions (read-only or read-write)
- View all collaborators for a repository
- Revoke access when needed

### ✍️ Content Creation

- Create posts in shared repositories
- Permission-aware content editor
- Real-time validation of write permissions

## Getting Started

### Prerequisites

1. **SDS Server**: You need a running SDS server instance
2. **Node.js 18+**: Required for the development environment
3. **Two ATProto Accounts**: For testing collaboration features

### Development Setup

```bash
# Install dependencies
cd /Users/ken/dev/atproto
npm install

# Build the SDS demo
cd packages/sds-demo
npm run build

# Start a development server (if available)
npm run dev
```

### Demo Workflow

1. **Setup Accounts**:

   - Create two ATProto accounts (Account A and Account B)
   - Both accounts should be able to authenticate with your SDS server

2. **Account A - Create Organization**:

   - Sign in with Account A
   - Create or select a repository
   - Navigate to the Collaboration Panel
   - Invite Account B by entering their DID
   - Set appropriate permissions (read-only or read-write)

3. **Account B - Join and Collaborate**:

   - Sign in with Account B
   - View the Repository Dashboard to see shared repositories
   - Select the shared repository from Account A
   - Create content in the shared repository (if granted write access)

4. **Collaboration Management**:
   - Account A can view all collaborators
   - Account A can modify or revoke permissions
   - Both accounts can see real-time collaboration status

## Configuration

The demo app connects to an SDS server. Update the configuration in `src/constants.ts`:

```typescript
export const SDS_SERVER_URL = 'http://localhost:2584' // Your SDS server URL
```

## Architecture

- **Frontend**: React with TypeScript
- **Styling**: Tailwind CSS
- **State Management**: React Query for server state
- **Authentication**: ATProto OAuth with SDS server
- **API Integration**: SDS-specific endpoints for collaboration

## API Endpoints Used

- `com.sds.repo.grantAccess` - Grant repository access to users
- `com.sds.repo.revokeAccess` - Revoke repository access
- `com.sds.repo.listCollaborators` - List repository collaborators
- `com.sds.repo.getPermissions` - Check user permissions
- `com.atproto.repo.createRecord` - Create content in shared repositories

## Next Steps

This demo provides a foundation for building more advanced collaboration features:

- Real-time editing with conflict resolution
- Activity feeds and notifications
- Advanced permission models (roles, groups)
- File sharing and media collaboration
- Integration with existing ATProto applications

## Support

This demo is part of the ATProto SDS implementation. For issues or questions:

1. Check the main SDS implementation in `packages/sds/`
2. Review the integration tests in `packages/sds/tests/`
3. Consult the implementation plan in `IMPLEMENTATION-PLAN.md`
