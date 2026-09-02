import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { getApiBaseUrl } from './config.js'

// Resolve required runtime configuration before React starts so configuration
// mistakes fail immediately instead of surfacing during a later API request.
getApiBaseUrl()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
