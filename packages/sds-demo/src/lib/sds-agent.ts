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
        description: 'Create a new organization with its own repository that can be shared with collaborators. The creator becomes the owner with full admin privileges.',
        input: {
          encoding: 'application/json',
          schema: {
            type: 'object',
            required: ['name', 'creatorDid'],
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
                description: 'Optional custom handle for the organization. If not provided, will be auto-generated.',
              },
              creatorDid: {
                type: 'string',
                format: 'did',
                description: 'DID of the user creating the organization.',
              },
            },
          },
        },
        output: {
          encoding: 'application/json',
          schema: {
            type: 'object',
            required: ['did', 'handle', 'name', 'createdAt', 'permissions', 'accessType'],
            properties: {
              did: {
                type: 'string',
                format: 'did',
                description: 'The DID of the created organization repository.',
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
              permissions: {
                type: 'ref',
                ref: 'com.sds.repo.grantAccess#permissions',
                description: 'The creator\'s permissions for this organization (always full admin).',
              },
              accessType: {
                type: 'string',
                knownValues: ['owner'],
                description: 'The creator\'s access type (always owner).',
              },
            },
          },
        },
        errors: [
          {
            name: 'InvalidName',
            description: 'The organization name is invalid or already in use.',
          },
          {
            name: 'HandleTaken',
            description: 'The specified handle is already taken.',
          },
        ],
      },
    },
  },
  {
    lexicon: 1,
    id: 'com.sds.organization.list',
    defs: {
      main: {
        type: 'query',
        description: 'List organizations that the authenticated user has access to.',
        parameters: {
          type: 'params',
          properties: {
            userDid: {
              type: 'string',
              format: 'did',
              description: 'DID of the user to list organizations for.',
            },
          },
        },
        output: {
          encoding: 'application/json',
          schema: {
            type: 'object',
            required: ['organizations'],
            properties: {
              organizations: {
                type: 'array',
                items: {
                  type: 'ref',
                  ref: '#organization',
                },
              },
            },
          },
        },
      },
      organization: {
        type: 'object',
        description: 'Organization information with user\'s access details',
        required: ['did', 'handle', 'name', 'permissions', 'accessType'],
        properties: {
          did: {
            type: 'string',
            format: 'did',
            description: 'The DID of the organization repository.',
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
          permissions: {
            type: 'ref',
            ref: 'com.sds.repo.grantAccess#permissions',
            description: 'The user\'s permissions for this organization.',
          },
          accessType: {
            type: 'string',
            knownValues: ['owner', 'collaborator'],
            description: 'The user\'s access type.',
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
                  admin: { type: 'boolean' },
                  owner: { type: 'boolean' },
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
                        admin: { type: 'boolean' },
                        owner: { type: 'boolean' },
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
                type: 'ref',
                ref: '#permissions',
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
  private oauthSession: OAuthSession

  constructor(session: OAuthSession) {
    // Create main agent for PDS calls
    super(session)

    // Store session reference for SDS calls
    this.oauthSession = session

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
      ; (this as any).lex.add(lexicon)
        ; (this.sdsAgent as any).lex.add(lexicon)
    }
  }

  // Override the call method to route SDS calls to the SDS server
  async call(methodId: string, params?: any, data?: any, opts?: any) {
    // Route SDS-specific calls to the SDS server
    if (methodId.startsWith('com.sds.')) {
      console.log(`[SdsAgent] Routing ${methodId} to SDS server`)
      console.log(`[SdsAgent] Expected SDS URL: ${SDS_SERVER_URL}`)
      console.log(`[SdsAgent] Current baseUri: ${this.sdsAgent.api.xrpc.baseUri}`)

      // Force the baseUri to be correct before making the call
      this.sdsAgent.api.xrpc.baseUri = SDS_SERVER_URL
      console.log(`[SdsAgent] Updated baseUri: ${this.sdsAgent.api.xrpc.baseUri}`)

      // Use direct HTTP call with OAuth bearer token to avoid client-side RPC scope validation
      // This bypasses the OAuth agent's service URL restrictions and scope validation
      try {
        console.log(`[SdsAgent] Making direct HTTP call with OAuth token to ${SDS_SERVER_URL}`)

        // Build the URL
        let url = `${SDS_SERVER_URL}/xrpc/${methodId}`
        if (params) {
          const searchParams = new URLSearchParams()
          for (const [key, value] of Object.entries(params)) {
            if (value !== undefined) {
              searchParams.append(key, String(value))
            }
          }
          const queryString = searchParams.toString()
          if (queryString) {
            url += `?${queryString}`
          }
        }

        console.log(`[SdsAgent] Making authenticated call to: ${url}`)

        // Check if this is a POST method that needs manual authentication (like grantAccess)
        // GET requests and some endpoints work fine with dpopFetch
        const needsManualAuth = data && methodId.includes('grantAccess')

        if (needsManualAuth) {
          console.log('[SdsAgent] Using manual authentication for POST endpoint...')

          // Get the access token from the OAuth session
          const tokenSet = await (this.oauthSession as any).getTokenSet('auto')
          if (!tokenSet?.access_token) {
            throw new Error('No access token available for cross-server request')
          }

          console.log('[SdsAgent] Token details:', {
            token_type: tokenSet.token_type,
            has_access_token: !!tokenSet.access_token,
            aud: tokenSet.aud,
            scope: tokenSet.scope
          })

          // Create Authorization header for cross-server DPoP request
          const authHeader = `${tokenSet.token_type || 'DPoP'} ${tokenSet.access_token}`
          console.log('[SdsAgent] Authorization header:', authHeader.slice(0, 50) + '...')

          const requestOptions = {
            method: 'POST',
            headers: {
              'Authorization': authHeader,
              'Content-Type': 'application/json',
              ...opts?.headers,
            },
            body: JSON.stringify(data),
          }
          console.log('[SdsAgent] Manual request options:', {
            method: requestOptions.method,
            headers: Object.keys(requestOptions.headers),
            has_body: !!requestOptions.body
          })

          const response = await fetch(url, requestOptions)
          console.log('[SdsAgent] Manual response status:', response.status)

          if (!response.ok) {
            const errorText = await response.text()
            console.error(`[SdsAgent] Manual authenticated call failed: ${response.status} ${errorText}`)
            throw new Error(`HTTP ${response.status}: ${errorText}`)
          }

          const responseData = await response.json()
          console.log(`[SdsAgent] Manual authenticated call succeeded:`, responseData)

          return {
            success: response.ok,
            headers: Object.fromEntries(response.headers.entries()),
            data: responseData,
          }
        } else {
          console.log('[SdsAgent] Using dpopFetch for standard request...')

          // Use dpopFetch for GET requests and endpoints that work fine
          const response = await (this.oauthSession as any).dpopFetch(url, {
            method: data ? 'POST' : 'GET',
            headers: {
              'Content-Type': 'application/json',
              ...opts?.headers,
            },
            body: data ? JSON.stringify(data) : undefined,
          })

          console.log('[SdsAgent] dpopFetch response status:', response.status)

          if (!response.ok) {
            const errorText = await response.text()
            console.error(`[SdsAgent] dpopFetch call failed: ${response.status} ${errorText}`)
            throw new Error(`HTTP ${response.status}: ${errorText}`)
          }

          const responseData = await response.json()
          console.log(`[SdsAgent] dpopFetch call succeeded:`, responseData)

          return {
            success: response.ok,
            headers: Object.fromEntries(response.headers.entries()),
            data: responseData,
          }
        }
      } catch (error) {
        console.error(`[SdsAgent] Direct authenticated call failed:`, error)
        throw error
      }
    }
    // Route all other calls to the main PDS server
    console.log(`[SdsAgent] Routing ${methodId} to PDS server at ${this.api.xrpc.baseUri}`)
    return super.call(methodId, params, data, opts)
  }
}
