import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import 'sweetalert2/dist/sweetalert2.min.css'
import '@/lib/i18n'
import './index.css'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
