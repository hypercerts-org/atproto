import { useQuery } from '@tanstack/react-query'
import { ComAtprotoRepoGetRecord } from '@atproto/api'
import { useAuthContext } from '../auth/auth-provider.tsx'

export function useGetActorProfileQuery() {
  const { agent } = useAuthContext()

  return useQuery({
    queryKey: ['profile', agent?.assertDid ?? null],
    queryFn: async () => {
      if (!agent) return null
      try {
        const { data } = await agent.com.atproto.repo.getRecord({
          repo: agent.assertDid,
          collection: 'app.bsky.actor.profile',
          rkey: 'self',
        })
        return data
      } catch (error) {
        // Handle RecordNotFound gracefully - profile may not exist yet
        if (error instanceof ComAtprotoRepoGetRecord.RecordNotFoundError) {
          return null
        }
        throw error
      }
    },
  })
}
