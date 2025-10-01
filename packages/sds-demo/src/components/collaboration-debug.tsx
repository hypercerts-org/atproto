// Debug component to help troubleshoot collaboration features
import { useRepositoryContext } from '../contexts/repository-context.tsx'
import { useAuthContext } from '../auth/auth-provider.tsx'

export function CollaborationDebug() {
  const { repositories, selectedRepo } = useRepositoryContext()
  const auth = useAuthContext()

  return (
    <div className="rounded-lg bg-yellow-50 p-4 border border-yellow-200">
      <h3 className="font-semibold text-yellow-800 mb-2">🔍 Collaboration Debug Info</h3>

      <div className="space-y-2 text-sm">
        <div>
          <strong>Signed in:</strong> {auth.signedIn ? 'Yes' : 'No'}
        </div>

        <div>
          <strong>User DID:</strong> {auth.session?.did || 'None'}
        </div>

        <div>
          <strong>Total repositories:</strong> {repositories.length}
        </div>

        {repositories.length > 0 && (
          <div>
            <strong>Repositories:</strong>
            <ul className="ml-4 mt-1">
              {repositories.map((repo) => (
                <li key={repo.did} className="text-xs">
                  • {repo.handle} (DID: {repo.did.slice(0, 20)}...)
                  <br />
                  &nbsp;&nbsp;Access: {repo.accessType}
                  {repo.accessType === 'owner' && <span className="text-green-600"> - Can manage</span>}
                  <br />
                  &nbsp;&nbsp;User DID: {auth.session?.did?.slice(0, 20)}...
                  <br />
                  &nbsp;&nbsp;Is Owner? {repo.did === auth.session?.did ? 'YES' : 'NO'}
                </li>
              ))}
            </ul>
          </div>
        )}

        {selectedRepo && (
          <div>
            <strong>Selected repo:</strong> {selectedRepo}
          </div>
        )}
      </div>
    </div>
  )
}