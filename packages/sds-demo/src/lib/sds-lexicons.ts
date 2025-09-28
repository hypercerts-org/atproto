// SDS Lexicon definitions for client-side usage
import { LexiconDoc } from '@atproto/lexicon'

export const SDS_LEXICONS: LexiconDoc[] = [
  {
    lexicon: 1,
    id: 'com.sds.organization.create',
    defs: {
      main: {
        type: 'procedure',
        description: 'Create a new organization with its own repository that can be shared with collaborators.',
        input: {
          encoding: 'application/json',
          schema: {
            type: 'object',
            required: ['name', 'creatorDid'],
            properties: {
              name: {
                type: 'string',
                maxLength: 100,
                description: 'The name of the organization.'
              },
              description: {
                type: 'string',
                maxLength: 500,
                description: 'Optional description of the organization.'
              },
              handle: {
                type: 'string',
                format: 'handle',
                description: 'Optional custom handle for the organization.'
              },
              creatorDid: {
                type: 'string',
                format: 'did',
                description: 'DID of the user creating the organization.'
              }
            }
          }
        },
        output: {
          encoding: 'application/json',
          schema: {
            type: 'object',
            required: ['did', 'handle', 'name', 'createdAt', 'permissions', 'accessType'],
            properties: {
              did: { type: 'string', format: 'did' },
              handle: { type: 'string', format: 'handle' },
              name: { type: 'string' },
              description: { type: 'string' },
              createdAt: { type: 'string', format: 'datetime' },
              permissions: {
                type: 'ref',
                ref: 'com.sds.repo.grantAccess#permissions'
              },
              accessType: { type: 'string', knownValues: ['owner'] }
            }
          }
        }
      }
    }
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
              description: 'DID of the user to list organizations for.'
            }
          }
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
                  ref: '#organization'
                }
              }
            }
          }
        }
      },
      organization: {
        type: 'object',
        description: 'Organization information with user access details',
        required: ['did', 'handle', 'name', 'permissions', 'accessType'],
        properties: {
          did: {
            type: 'string',
            format: 'did',
            description: 'The DID of the organization repository.'
          },
          handle: {
            type: 'string',
            format: 'handle',
            description: 'The handle of the organization.'
          },
          name: {
            type: 'string',
            description: 'The name of the organization.'
          },
          description: {
            type: 'string',
            description: 'The description of the organization.'
          },
          createdAt: {
            type: 'string',
            format: 'datetime',
            description: 'When the organization was created.'
          },
          permissions: {
            type: 'ref',
            ref: 'com.sds.repo.grantAccess#permissions'
          },
          accessType: {
            type: 'string',
            knownValues: ['owner', 'collaborator'],
            description: 'The users access type.'
          }
        }
      }
    }
  },
  {
    lexicon: 1,
    id: 'com.sds.repo.grantAccess',
    defs: {
      main: {
        type: 'procedure',
        description: 'Grant access permissions to a user for a shared repository.',
        input: {
          encoding: 'application/json',
          schema: {
            type: 'object',
            required: ['repo', 'userDid', 'permissions'],
            properties: {
              repo: { type: 'string', format: 'at-identifier' },
              userDid: { type: 'string', format: 'did' },
              permissions: {
                type: 'ref',
                ref: '#permissions'
              }
            }
          }
        }
      },
      permissions: {
        type: 'object',
        description: 'Repository access permissions',
        required: ['read', 'write'],
        properties: {
          read: {
            type: 'boolean',
            description: 'Permission to read repository content.'
          },
          write: {
            type: 'boolean',
            description: 'Permission to write/modify repository content.'
          },
          admin: {
            type: 'boolean',
            description: 'Administrative permissions (manage collaborators, etc.).'
          }
        }
      }
    }
  }
]

// Helper function to add SDS lexicons to an agent
export function addSdsLexicons(agent: any) {
  for (const lexicon of SDS_LEXICONS) {
    agent.lex.add(lexicon)
  }
}