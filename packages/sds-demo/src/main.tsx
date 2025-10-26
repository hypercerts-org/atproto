import './index.css'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './app.tsx'
import { AuthProvider } from './auth/auth-provider.tsx'
import {
  ENV,
  HANDLE_RESOLVER_URL,
  OAUTH_SCOPE,
  PLC_DIRECTORY_URL,
  SDS_SERVER_URL,
  SIGN_UP_URL,
} from './constants.ts'

const redirectUrl = new URL(window.location.origin)
redirectUrl.search = new URLSearchParams({
  env: ENV,
  handle_resolver: HANDLE_RESOLVER_URL,
  sign_up_url: SIGN_UP_URL,
  scope: OAUTH_SCOPE,
  ...(PLC_DIRECTORY_URL && { plc_directory_url: PLC_DIRECTORY_URL }),
}).toString()

const clientId = `http://localhost?${new URLSearchParams({
  scope: OAUTH_SCOPE,
  redirect_uri: redirectUrl.href,
})}`

const queryClient = new QueryClient()

// Debug logging for OAuth configuration
console.log('[SDS Demo] OAuth Client ID:', clientId)
console.log('[SDS Demo] OAuth Config:', {
  plcDirectoryUrl: PLC_DIRECTORY_URL,
  signUpUrl: SIGN_UP_URL,
  handleResolver: HANDLE_RESOLVER_URL,
  allowHttp: ENV === 'development' || ENV === 'test',
})

createRoot(document.getElementById('root')!).render(
  // Note: StrictMode disabled for OAuth compatibility
  // StrictMode's double-invocation of effects can interfere with OAuth session restoration
  <QueryClientProvider client={queryClient}>
    <AuthProvider
      clientId={clientId}
      plcDirectoryUrl={PLC_DIRECTORY_URL}
      signUpUrl={SIGN_UP_URL}
      handleResolver={HANDLE_RESOLVER_URL}
      allowHttp={ENV === 'development' || ENV === 'test'}
    >
      <App />
    </AuthProvider>
  </QueryClientProvider>,
)
