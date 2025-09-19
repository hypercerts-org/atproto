import { Agent } from '@atproto/api'
import { LexiconDoc } from '@atproto/lexicon'
import { OAuthSession } from '@atproto/oauth-client'
import { SDS_SERVER_URL } from '../constants.ts'

// SDS Lexicon definitions (manually imported from the lexicon files)
const sdsLexicons: LexiconDoc[] = [
  {
    lexicon: 1,
    id: 'com.sds.organization.create',
    defs: {
      main: {
        type: 'procedure',
        description:
          'Create a new organization with its own repository that can be shared with collaborators.',
        input: {
          encoding: 'application/json',
          schema: {
            type: 'object',
            required: ['name'],
            properties: {
              name: {
                type: 'string',
                maxLength: 100,
                description: 'The name of the organization.',
              },
              description: {
                type: 'string',
                maxLength: 500,
                description: 'Optional description of the organization.',
              },
              handle: {
                type: 'string',
                format: 'handle',
                description:
                  'Optional custom handle for the organization. If not provided, will be auto-generated.',
              },
            },
          },
        },
        output: {
          encoding: 'application/json',
          schema: {
            type: 'object',
            required: ['did', 'handle', 'name'],
            properties: {
              did: {
                type: 'string',
                format: 'did',
                description: 'The DID of the created organization account.',
              },
              handle: {
                type: 'string',
                format: 'handle',
                description: 'The handle of the organization.',
              },
              name: {
                type: 'string',
                description: 'The name of the organization.',
              },
              description: {
                type: 'string',
                description: 'The description of the organization.',
              },
              createdAt: {
                type: 'string',
                format: 'datetime',
                description: 'When the organization was created.',
              },
            },
          },
        },
      },
    },
  },
  {
    lexicon: 1,
    id: 'com.sds.repo.getPermissions',
    defs: {
      main: {
        type: 'query',
        description:
          'Get permissions for a user on a shared repository. Requires auth.',
        parameters: {
          type: 'params',
          required: ['repo'],
          properties: {
            repo: {
              type: 'string',
              format: 'at-identifier',
              description:
                'The handle or DID of the repository to check permissions for.',
            },
          },
        },
        output: {
          encoding: 'application/json',
          schema: {
            type: 'object',
            required: ['permissions', 'accessType'],
            properties: {
              permissions: {
                type: 'object',
                required: ['read', 'write'],
                properties: {
                  read: { type: 'boolean' },
                  write: { type: 'boolean' },
                },
              },
              accessType: {
                type: 'string',
                knownValues: ['owner', 'shared', 'none'],
              },
              grantedBy: {
                type: 'string',
                format: 'did',
                description:
                  'DID of the user who granted access (if applicable).',
              },
            },
          },
        },
      },
    },
  },
  {
    lexicon: 1,
    id: 'com.sds.repo.listCollaborators',
    defs: {
      main: {
        type: 'query',
        description:
          'List all collaborators who have access to a shared repository.',
        parameters: {
          type: 'params',
          required: ['repo'],
          properties: {
            repo: {
              type: 'string',
              format: 'at-identifier',
              description:
                'The handle or DID of the repository to list collaborators for.',
            },
          },
        },
        output: {
          encoding: 'application/json',
          schema: {
            type: 'object',
            required: ['collaborators'],
            properties: {
              collaborators: {
                type: 'array',
                items: {
                  type: 'object',
                  required: [
                    'userDid',
                    'permissions',
                    'grantedBy',
                    'grantedAt',
                  ],
                  properties: {
                    userDid: { type: 'string', format: 'did' },
                    handle: { type: 'string', format: 'handle' },
                    permissions: {
                      type: 'object',
                      required: ['read', 'write'],
                      properties: {
                        read: { type: 'boolean' },
                        write: { type: 'boolean' },
                      },
                    },
                    grantedBy: { type: 'string', format: 'did' },
                    grantedAt: { type: 'string', format: 'datetime' },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
  {
    lexicon: 1,
    id: 'com.sds.repo.grantAccess',
    defs: {
      main: {
        type: 'procedure',
        description:
          'Grant access permissions to a user for a shared repository.',
        input: {
          encoding: 'application/json',
          schema: {
            type: 'object',
            required: ['repo', 'userDid', 'permissions'],
            properties: {
              repo: {
                type: 'string',
                format: 'at-identifier',
                description:
                  'The handle or DID of the repository to grant access to.',
              },
              userDid: {
                type: 'string',
                format: 'did',
                description: 'The DID of the user to grant access to.',
              },
              permissions: {
                type: 'object',
                required: ['read', 'write'],
                properties: {
                  read: { type: 'boolean' },
                  write: { type: 'boolean' },
                },
              },
            },
          },
        },
        output: {
          encoding: 'application/json',
          schema: {
            type: 'object',
            required: ['success', 'grantedAt'],
            properties: {
              success: { type: 'boolean' },
              grantedAt: { type: 'string', format: 'datetime' },
            },
          },
        },
      },
    },
  },
  {
    lexicon: 1,
    id: 'com.sds.repo.revokeAccess',
    defs: {
      main: {
        type: 'procedure',
        description:
          'Revoke access permissions from a user for a shared repository.',
        input: {
          encoding: 'application/json',
          schema: {
            type: 'object',
            required: ['repo', 'userDid'],
            properties: {
              repo: {
                type: 'string',
                format: 'at-identifier',
                description:
                  'The handle or DID of the repository to revoke access from.',
              },
              userDid: {
                type: 'string',
                format: 'did',
                description: 'The DID of the user to revoke access from.',
              },
            },
          },
        },
        output: {
          encoding: 'application/json',
          schema: {
            type: 'object',
            required: ['success'],
            properties: {
              success: { type: 'boolean' },
            },
          },
        },
      },
    },
  },
]

/**
 * Extended Agent that includes SDS lexicons and can route calls to multiple servers
 */
export class SdsAgent extends Agent {
  private sdsAgent: Agent

  constructor(session: OAuthSession) {
    // Create main agent for PDS calls
    super(session)

    // Create separate agent for SDS calls
    this.sdsAgent = new Agent(session)
    this.sdsAgent.api.xrpc.baseUri = SDS_SERVER_URL

    // Add SDS lexicons to both agents
    for (const lexicon of sdsLexicons) {
      ;(this as any).lex.add(lexicon)
      ;(this.sdsAgent as any).lex.add(lexicon)
    }
  }

  // Override the call method to route SDS calls to the SDS server
  async call(methodId: string, params?: any, data?: any, opts?: any) {
    // Route SDS-specific calls to the SDS server
    if (methodId.startsWith('com.sds.')) {
      return this.sdsAgent.api.xrpc.call(methodId, params, data, opts)
    }
    // Route all other calls to the main PDS server
    return super.call(methodId, params, data, opts)
  }
}
