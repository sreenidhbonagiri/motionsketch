import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { getAppPersistenceController } from './lib/persistenceController'

// Hydrate from localStorage before the first paint so refresh feels instant.
getAppPersistenceController().restoreOnStartup()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
