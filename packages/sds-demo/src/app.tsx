import { useAuthContext } from './auth/auth-provider.tsx'
import { OAuthLogin } from './auth/oauth-login.tsx'
import { useGlobalAgent } from './auth/use-global-agent.ts'
import { ProfileInfo } from './components/profile-info.tsx'
import { RepositoryDashboard } from './components/repository-dashboard.tsx'
import { SessionInfo } from './components/session-info.tsx'
import { TokenInfo } from './components/token-info.tsx'
import { UserMenu } from './components/user-menu.tsx'
import { RepositoryProvider } from './contexts/repository-context.tsx'

function App() {
  const { signedIn } = useAuthContext()

  // Expose agent on `window` for debugging purposes
  useGlobalAgent()

  return (
    <div className="container mx-auto flex min-h-screen max-w-5xl flex-col p-4">
      <nav className="mb-8 flex items-center">
        <div className="flex items-center space-x-4">
          <h1 className="text-2xl font-bold text-blue-600">SDS Demo</h1>
          <span className="text-sm text-gray-500">
            Shared Data Server Collaboration
          </span>
        </div>
        <div className="flex-1" />
        {signedIn && <UserMenu />}
      </nav>

      <main className="flex flex-1 flex-col items-stretch space-y-6">
        {signedIn ? (
          <RepositoryProvider>
            {/* Repository Dashboard */}
            <div className="rounded-lg bg-white p-6 shadow-md">
              <h2 className="mb-4 text-xl font-semibold text-gray-800">
                My Repositories
              </h2>
              <RepositoryDashboard />
            </div>

            {/* Technical Details (collapsible) */}
            <details className="rounded-lg bg-gray-50 p-6 shadow-md">
              <summary className="cursor-pointer text-lg font-medium text-gray-700">
                Technical Details
              </summary>
              <div className="mt-4 space-y-4">
                <TokenInfo />
                <ProfileInfo />
                <SessionInfo />
              </div>
            </details>
          </RepositoryProvider>
        ) : (
          <div className="flex flex-grow flex-col items-center justify-center">
            <div className="mb-8 text-center">
              <h2 className="mb-4 text-3xl font-bold text-gray-800">
                Welcome to SDS Demo
              </h2>
              <p className="text-lg text-gray-600">
                Experience collaborative repository sharing with the Shared Data
                Server
              </p>
              <div className="mt-4 text-sm text-gray-500">
                <p>• Share repositories with multiple users</p>
                <p>• Manage granular permissions (read/write)</p>
                <p>• Collaborate on content in real-time</p>
                <p>• Full compatibility with AT Protocol federation</p>
              </div>
            </div>
            <OAuthLogin />
          </div>
        )}
      </main>
    </div>
  )
}

export default App
