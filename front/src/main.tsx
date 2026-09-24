import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import 'bootstrap/dist/css/bootstrap.min.css'
import { AuthProvider } from 'react-oidc-context'
import { WebStorageStateStore } from 'oidc-client-ts'

const authority =
  import.meta.env.VITE_COGNITO_AUTHORITY ||
  'https://cognito-idp.us-east-1.amazonaws.com/REEMPLAZAR_POOL_ID'

const clientId =
  import.meta.env.VITE_COGNITO_CLIENT_ID || 'REEMPLAZAR_CLIENT_ID'

const cognitoAuthConfig = {
  authority,
  client_id: clientId,
  redirect_uri: window.location.origin,
  post_logout_redirect_uri: window.location.origin,
  response_type: 'code',
  scope: 'openid email profile phone',
  userStore: new WebStorageStateStore({ store: window.localStorage }),
  automaticSilentRenew: true,
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider {...cognitoAuthConfig}>
      <App />
    </AuthProvider>
  </StrictMode>,
)
