import { useAuth } from 'react-oidc-context'
import { PatientApp } from './components/PatientApp'

function App() {
  const auth = useAuth()

  const cognitoDomain =
    import.meta.env.VITE_COGNITO_DOMAIN ||
    'https://hospital-dsy1107.auth.us-east-1.amazoncognito.com'
  const clientId =
    import.meta.env.VITE_COGNITO_CLIENT_ID || 'REEMPLAZAR_CLIENT_ID'

  const handleSignOut = () => {
    const logoutUri = window.location.origin
    auth.removeUser()
    window.location.href =
      `${cognitoDomain}/logout?client_id=${clientId}` +
      `&logout_uri=${encodeURIComponent(logoutUri)}`
  }

  if (auth.isLoading) {
    return (
      <div className="container text-center mt-5">
        <p className="fs-4 text-secondary">Cargando sesión…</p>
      </div>
    )
  }

  if (auth.error) {
    return (
      <div className="container text-center mt-5">
        <p className="text-danger fs-5">
          Error de autenticación: {auth.error.message}
        </p>
        <button
          className="btn btn-primary mt-2"
          onClick={() => auth.signinRedirect()}
        >
          Reintentar inicio de sesión
        </button>
      </div>
    )
  }

  if (auth.isAuthenticated) {
    return (
      <div>
        <header className="navbar navbar-dark bg-dark px-4 mb-4 shadow-sm">
          <span className="navbar-brand mb-0 h1">
            Sistema de Gestión de Pacientes
          </span>
          <div className="d-flex align-items-center gap-3">
            <span className="text-light">
              Bienvenido, <strong>{auth.user?.profile.email}</strong>
            </span>
            <button
              className="btn btn-outline-light btn-sm"
              onClick={handleSignOut}
            >
              Cerrar sesión
            </button>
          </div>
        </header>
        <PatientApp />
      </div>
    )
  }

  return (
    <div className="container text-center mt-5">
      <div className="card shadow p-5 mx-auto" style={{ maxWidth: '480px' }}>
        <h2 className="mb-3 text-primary">Gestión de Pacientes</h2>
        <p className="text-muted mb-4">
          Inicia sesión con AWS Cognito (OAuth 2.0 / OIDC — Authorization Code +
          PKCE) para acceder al sistema.
        </p>
        <button
          className="btn btn-primary btn-lg w-100"
          onClick={() => auth.signinRedirect()}
        >
          Iniciar Sesión
        </button>
      </div>
    </div>
  )
}

export default App
