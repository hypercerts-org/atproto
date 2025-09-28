import { Agent } from '@atproto/api'
import { LexiconDoc } from '@atproto/lexicon'
import { OAuthSession } from '@atproto/oauth-client'
import { SDS_SERVER_URL } from '../constants.ts'

// SDS Lexicon definitions including organization creation
const sdsLexicons: LexiconDoc[] = [
  {
    lexicon: 1,
    id: 'com.sds.organization.create',
    defs: {
      main: {
        type: 'procedure',
        description:
          'Create a new shared repository that can be collaborated on.',
        input: {
          encoding: 'application/json',
          schema: {
            type: 'object',
            required: ['name'],
            properties: {
              name: {
                type: 'string',
                maxLength: 100,
                description: 'The name of the repository.',
              },
              description: {
                type: 'string',
                maxLength: 500,
                description: 'Optional description of the repository.',
              },
              handle: {
                type: 'string',
                format: 'handle',
                description:
                  'Optional custom handle. If not provided, will be auto-generated.',
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
                description: 'The DID of the created repository.',
              },
              handle: {
                type: 'string',
                format: 'handle',
                description: 'The handle of the repository.',
              },
              name: {
                type: 'string',
                description: 'The name of the repository.',
              },
              description: {
                type: 'string',
                description: 'The description of the repository.',
              },
              createdAt: {
                type: 'string',
                format: 'datetime',
                description: 'When the repository was created.',
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
 * Extended Agent that can route calls between PDS and SDS servers
 */
export class SdsAgent extends Agent {
  private sdsAgent: Agent

  constructor(session: OAuthSession) {
    // Create main agent for PDS calls
    super(session)

    // Create separate agent for SDS calls
    // Pass the session to get OAuth authentication, then override the service URL
    this.sdsAgent = new Agent(session)

    // Override the service URL to point to SDS server
    // This needs to be done after construction to preserve OAuth session
    this.sdsAgent.api.xrpc.baseUri = SDS_SERVER_URL

    // Ensure the session service points to SDS for future requests
    // This is a bit of a hack, but necessary for proper routing
    const originalService = session.service
    try {
      // Temporarily override the session's service URL for SDS calls
      Object.defineProperty(session, 'service', {
        get: () => SDS_SERVER_URL,
        configurable: true
      })
    } catch (e) {
      // If we can't override the service property, just set the baseUri
      console.warn('Could not override session service, relying on baseUri override')
    }

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
      console.log(`[SdsAgent] Routing ${methodId} to SDS server at ${this.sdsAgent.api.xrpc.baseUri}`)
      // Ensure the baseUri is correct before making the call
      this.sdsAgent.api.xrpc.baseUri = SDS_SERVER_URL
      console.log(`[SdsAgent] Final baseUri: ${this.sdsAgent.api.xrpc.baseUri}`)

      // For SDS calls, bypass OAuth scope validation by calling XRPC directly
      // This avoids the Agent's built-in OAuth scope checking that's causing issues
      try {
        const headers: Record<string, string> = {}

        // Add authorization header from the session
        const accessToken = await this.session.getTokenInfo()
        if (accessToken?.access_token) {
          headers['Authorization'] = `Bearer ${accessToken.access_token}`
        }

        // Make the XRPC call directly, bypassing Agent's OAuth validation
        return await this.sdsAgent.api.xrpc.call(methodId, params, data, {
          ...opts,
          headers: {
            ...headers,
            ...opts?.headers,
          },
        })
      } catch (error) {
        console.error(`[SdsAgent] Direct XRPC call failed:`, error)
        // Fallback to regular call if direct XRPC fails
        return await this.sdsAgent.call(methodId, params, data, opts)
      }
    }
    // Route all other calls to the main PDS server
    console.log(`[SdsAgent] Routing ${methodId} to PDS server at ${this.api.xrpc.baseUri}`)
    return super.call(methodId, params, data, opts)
  }
}
