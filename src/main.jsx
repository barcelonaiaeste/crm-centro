import React from 'react'
import ReactDOM from 'react-dom/client'
import { cargarCentro } from './centro'
import './index.css'

// La configuración del centro se carga antes que la app: App y puntuaciones la leen al importarse
cargarCentro()
  .catch((e) => console.error('Configuración no disponible, se usan los valores por defecto:', e))
  .then(() => import('./App.jsx'))
  .then(({ default: App }) => {
    ReactDOM.createRoot(document.getElementById('root')).render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    )
  })
