import { Agent } from '@atproto/api'
import { LexiconDoc } from '@atproto/lexicon'
import { OAuthSession, dpopFetchWrapper } from '@atproto/oauth-client'
import { Fetch } from '@atproto-labs/fetch'
import { ENV, SDS_SERVER_URL } from '../constants.ts'

// SDS Lexicon definitions including organization creation
const sdsLexicons: LexiconDoc[] = [
  {
    lexicon: 1,
    id: 'com.sds.organization.create',
    defs: {
      main: {
        type: 'procedure',
        description:
          'Create a new organization with its own repository that can be shared with collaborators. The creator becomes the owner with full admin privileges.',
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
                description:
                  'Optional custom handle for the organization. If not provided, will be auto-generated.',
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
            required: [
              'did',
              'handle',
              'name',
              'createdAt',
              'permissions',
              'accessType',
            ],
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
                description:
                  "The creator's permissions for this organization (always full admin).",
              },
              accessType: {
                type: 'string',
                knownValues: ['owner'],
                description: "The creator's access type (always owner).",
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
        description:
          'List organizations that the authenticated user has access to.',
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
        description: "Organization information with user's access details",
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
            description: "The user's permissions for this organization.",
          },
          accessType: {
            type: 'string',
            knownValues: ['owner', 'collaborator'],
            description: "The user's access type.",
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
  private oauthSession: OAuthSession
  private sdsDpopFetch: Fetch<unknown>
  private tokenPromise: Promise<any> | null = null

  constructor(session: OAuthSession) {
    // Create main agent for PDS calls
    // The OAuth session automatically routes requests to the correct PDS
    super(session)

    // Store session reference for SDS calls
    this.oauthSession = session

    console.log('[SdsAgent] Initialized with OAuth session')
    console.log(`[SdsAgent] PDS URL: ${session.serverMetadata.issuer}`)
    console.log(`[SdsAgent] SDS URL: ${SDS_SERVER_URL}`)
    console.log(`[SdsAgent] Environment: ${ENV}`)

    // Verify we're using local services in development
    if (ENV === 'development') {
      if (!session.serverMetadata.issuer.includes('localhost')) {
        console.error(
          '[SdsAgent] ⚠️  WARNING: PDS is not localhost!',
          session.serverMetadata.issuer,
        )
        console.error(
          '[SdsAgent] You may need to create a local account at http://localhost:2583',
        )
      }
      if (!SDS_SERVER_URL.includes('localhost')) {
        console.error(
          '[SdsAgent] ⚠️  WARNING: SDS is not localhost!',
          SDS_SERVER_URL,
        )
      }
    }

    // Create DPoP fetch wrapper for SDS (third-party resource server)
    // Uses the same DPoP key from the OAuth session and shares the nonce cache
    // The nonce cache is per-origin, so SDS and PDS nonces are managed separately
    this.sdsDpopFetch = dpopFetchWrapper<void>({
      fetch: globalThis.fetch.bind(globalThis), // Bind to maintain context
      key: session.server.dpopKey,
      supportedAlgs: session.serverMetadata.dpop_signing_alg_values_supported,
      sha256: async (v) => session.server.runtime.sha256(v),
      nonces: session.server.dpopNonces,
      isAuthServer: false, // SDS is a resource server, not an auth server
    })

    console.log('[SdsAgent] ✅ Created DPoP fetch wrapper for SDS')

    // Add SDS lexicons to this agent so we can route SDS calls
    for (const lexicon of sdsLexicons) {
      ;(this as any).lex.add(lexicon)
    }
  }

  /**
   * Get token with locking to prevent race conditions
   * Multiple simultaneous calls will wait for the same token fetch
   */
  private async getTokenSetSafe() {
    // If there's already a token fetch in progress, wait for it
    if (this.tokenPromise) {
      return this.tokenPromise
    }

    // Create new token fetch promise
    this.tokenPromise = (async () => {
      try {
        const tokenSet = await (this.oauthSession as any).getTokenSet('auto')
        return tokenSet
      } finally {
        // Clear the promise after completion (success or failure)
        this.tokenPromise = null
      }
    })()

    return this.tokenPromise
  }

  // Override the call method to route SDS calls to the SDS server
  async call(methodId: string, params?: any, data?: any, opts?: any) {
    // Route SDS-specific calls to the SDS server
    if (methodId.startsWith('com.sds.')) {
      console.log(
        `[SdsAgent] Routing ${methodId} to SDS server: ${SDS_SERVER_URL}`,
      )

      try {
        // Get the access token from the OAuth session with locking
        const tokenSet = await this.getTokenSetSafe()
        if (!tokenSet?.access_token) {
          throw new Error('No access token available for SDS request')
        }

        // Build the URL with query params
        let url = `${SDS_SERVER_URL}/xrpc/${methodId}`
        if (params) {
          const searchParams = new URLSearchParams()
          for (const [key, value] of Object.entries(params)) {
            if (value !== undefined) {
              searchParams.append(key, String(value))
            }
          }
          const queryString = searchParams.toString()
          if (queryString) url += `?${queryString}`
        }

        console.log(`[SdsAgent] Making DPoP request to: ${url}`)

        // Use DPoP fetch for SDS calls with cryptographic proof-of-possession
        // The sdsDpopFetch wrapper automatically:
        // - Creates DPoP proof JWT signed with the OAuth session's DPoP key
        // - Includes htm (HTTP method) and htu (target URI) claims
        // - Includes ath (access token hash) claim
        // - Manages DPoP nonces for the SDS origin
        const response = await this.sdsDpopFetch(url, {
          method: data ? 'POST' : 'GET',
          headers: {
            Authorization: `DPoP ${tokenSet.access_token}`,
            'Content-Type': 'application/json',
            ...opts?.headers,
          },
          body: data ? JSON.stringify(data) : undefined,
        })

        console.log(`[SdsAgent] SDS response status: ${response.status}`)

        if (!response.ok) {
          const errorText = await response.text()
          console.error(
            `[SdsAgent] SDS call failed: ${response.status} ${errorText}`,
          )
          throw new Error(`HTTP ${response.status}: ${errorText}`)
        }

        const responseData = await response.json()
        console.log(`[SdsAgent] SDS call succeeded:`, responseData)

        return {
          success: response.ok,
          headers: Object.fromEntries(response.headers.entries()),
          data: responseData,
        }
      } catch (error) {
        console.error(`[SdsAgent] SDS call error:`, error)
        throw error
      }
    }

    // Route all other calls to PDS via OAuth session (with proper DPoP handling)
    console.log(
      `[SdsAgent] Routing ${methodId} to PDS server via OAuth session`,
    )
    return super.call(methodId, params, data, opts)
  }
}
