import { useGetTokenInfoQuery } from '../queries/use-get-token-info-query.ts'
import { Button } from './button.tsx'
import { JsonQueryResult } from './json-query-result.tsx'

/**
 * Displays OAuth token information from the session.
 *
 * Note: Token scopes shown here are issued by the PDS but NOT validated by SDS.
 * SDS uses federated JWT validation (fetches JWKS from the issuing PDS) to verify
 * token authenticity, then authorizes access based solely on SDS database permissions.
 */
export function TokenInfo() {
  const result = useGetTokenInfoQuery()

  return (
    <div>
      <h2>
        Token info
        <Button
          onClick={() => result.refetch({ throwOnError: false })}
          className="ml-1"
          size="small"
          transparent
        >
          refresh
        </Button>
      </h2>
      <JsonQueryResult result={result} />
    </div>
  )
}
