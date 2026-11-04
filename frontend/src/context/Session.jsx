import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { api, setUnauthorizedHandler } from '../lib/api'

const SessionCtx = createContext(null)
const ToastCtx = createContext(null)

const LS_CENTRO = 'eddisfac.centro'
const LS_TEMA = 'eddisfac.tema'

function readLS(key) {
  try { return localStorage.getItem(key) } catch { return null }
}
function writeLS(key, value) {
  try { value == null ? localStorage.removeItem(key) : localStorage.setItem(key, value) } catch { /* sin almacenamiento */ }
}

function applyTheme(tema) {
  const root = document.documentElement
  if (tema === 'claro') root.setAttribute('data-theme', 'light')
  else if (tema === 'oscuro') root.setAttribute('data-theme', 'dark')
  else root.removeAttribute('data-theme')
}

export function SessionProvider({ children }) {
  const [state, setState] = useState({ loading: true, data: null })
  const [centroId, setCentroIdState] = useState(null)
  const [tema, setTemaState] = useState(() => readLS(LS_TEMA) || 'sistema')

  useEffect(() => { applyTheme(tema) }, [tema])

  const adopt = useCallback((data) => {
    setState({ loading: false, data })
    if (!data) return
    const ids = data.centros.map((c) => c.id)
    const guardado = Number(readLS(LS_CENTRO))
    const inicial = [guardado, data.usuario.centro_preferido_id, ids[0]].find((id) => id && ids.includes(id)) ?? null
    setCentroIdState(inicial)
    if (data.usuario.tema) {
      setTemaState(data.usuario.tema)
      writeLS(LS_TEMA, data.usuario.tema)
    }
  }, [])

  const refresh = useCallback(async () => {
    try { adopt(await api.get('/auth/sesion')) } catch { setState({ loading: false, data: null }) }
  }, [adopt])

  useEffect(() => {
    setUnauthorizedHandler(() => setState({ loading: false, data: null }))
    refresh()
  }, [refresh])

  const login = useCallback(async (documento, clave) => {
    adopt(await api.post('/auth/login', { documento, clave }))
  }, [adopt])

  const logout = useCallback(async () => {
    try { await api.post('/auth/logout') } finally { setState({ loading: false, data: null }) }
  }, [])

  const setCentroId = useCallback((id) => {
    setCentroIdState(id)
    writeLS(LS_CENTRO, id ? String(id) : null)
  }, [])

  const setTema = useCallback((t) => {
    setTemaState(t)
    writeLS(LS_TEMA, t)
    if (state.data) api.put('/auth/preferencias', { tema: t }).catch(() => {})
  }, [state.data])

  const centro = state.data?.centros.find((c) => c.id === centroId) ?? null

  useEffect(() => {
    document.documentElement.setAttribute('data-marca', centro?.marca ?? 'EDDIS')
  }, [centro?.marca])

  const value = useMemo(() => ({
    loading: state.loading,
    session: state.data,
    usuario: state.data?.usuario ?? null,
    centros: state.data?.centros ?? [],
    esStaff: !!state.data?.usuario.es_staff,
    centro,
    centroId,
    setCentroId,
    tema,
    setTema,
    login,
    logout,
    refresh,
  }), [state, centro, centroId, setCentroId, tema, setTema, login, logout, refresh])

  return <SessionCtx.Provider value={value}>{children}</SessionCtx.Provider>
}

export const useSession = () => useContext(SessionCtx)

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const seq = useRef(0)
  const dismiss = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), [])
  const push = useCallback((message, kind = 'ok') => {
    const id = ++seq.current
    setToasts((t) => [...t, { id, message, kind }])
    setTimeout(() => dismiss(id), kind === 'bad' ? 8000 : 4500)
  }, [dismiss])
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind === 'bad' ? 'is-bad' : ''}`}>
            <span>{t.message}</span>
            <button onClick={() => dismiss(t.id)} aria-label="Cerrar aviso">✕</button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}

export const useToast = () => useContext(ToastCtx)
