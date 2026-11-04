import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { SessionProvider, ToastProvider, useSession } from './context/Session'
import Layout from './components/Layout'
import { Loading } from './components/ui'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Pagos from './pages/Pagos'
import Comprobantes from './pages/Comprobantes'
import Cuit from './pages/Cuit'
import ConsultaArca from './pages/ConsultaArca'
import Terceros from './pages/Terceros'
import Auditoria from './pages/Auditoria'
import Usuarios from './pages/Usuarios'
import Centros from './pages/Centros'
import Configuracion from './pages/Configuracion'
import MiCuenta from './pages/MiCuenta'
import Imprimir from './pages/Imprimir'

function StaffOnly({ children }) {
  const { esStaff } = useSession()
  return esStaff ? children : <Navigate to="/dashboard" replace />
}

/** Las páginas que dependen de la sede se remontan al cambiarla. */
function PorSede({ children }) {
  const { centroId } = useSession()
  if (!centroId) return <div className="page"><Loading label="Sin sede seleccionada" /></div>
  return <div key={centroId} style={{ display: 'contents' }}>{children}</div>
}

function Routed() {
  const { loading, session } = useSession()
  if (loading) return <Loading label="Cargando sesión…" />
  if (!session) return <Login />
  return (
    <Routes>
      <Route path="/imprimir" element={<Imprimir />} />
      <Route element={<Layout />}>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/pagos" element={<PorSede><Pagos /></PorSede>} />
        <Route path="/comprobantes" element={<PorSede><Comprobantes /></PorSede>} />
        <Route path="/cuit" element={<Cuit />} />
        <Route path="/consulta-arca" element={<PorSede><ConsultaArca /></PorSede>} />
        <Route path="/terceros" element={<PorSede><Terceros /></PorSede>} />
        <Route path="/auditoria" element={<Auditoria />} />
        <Route path="/utilidades/usuarios" element={<StaffOnly><Usuarios /></StaffOnly>} />
        <Route path="/utilidades/centros" element={<StaffOnly><Centros /></StaffOnly>} />
        <Route path="/utilidades/configuracion" element={<StaffOnly><Configuracion /></StaffOnly>} />
        <Route path="/mi-cuenta" element={<MiCuenta />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Route>
    </Routes>
  )
}

export default function App() {
  return (
    <HashRouter>
      <ToastProvider>
        <SessionProvider>
          <Routed />
        </SessionProvider>
      </ToastProvider>
    </HashRouter>
  )
}
