import { useEffect, useRef, useState, useCallback } from 'react'
import { X, AlertTriangle, Info, CheckCircle2, Clock3, XCircle } from 'lucide-react'
import { api } from '../lib/api'
import { useToast } from '../context/Session'

export function Button({ variant, size, loading, children, className = '', ...props }) {
  const cls = ['btn', variant && `btn-${variant}`, size && `btn-${size}`, className].filter(Boolean).join(' ')
  return (
    <button className={cls} disabled={loading || props.disabled} {...props}>
      {loading && <span className="spinner" aria-hidden="true" />}
      {children}
    </button>
  )
}

export function Field({ label, hint, error, children, className = '', htmlFor }) {
  return (
    <div className={`field ${className}`}>
      {label && <label htmlFor={htmlFor}>{label}</label>}
      {children}
      {error ? <span className="err">{error}</span> : hint ? <span className="hint">{hint}</span> : null}
    </div>
  )
}

export function Switch({ checked, onChange, label, disabled }) {
  return (
    <label className="switch">
      <input type="checkbox" role="switch" checked={!!checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  )
}

export function Modal({ title, onClose, children, footer, wide }) {
  const ref = useRef(null)
  useEffect(() => {
    const prev = document.activeElement
    ref.current?.querySelector('input, select, textarea, button:not([data-close])')?.focus()
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('keydown', onKey); prev?.focus?.() }
  }, [onClose])
  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className={`modal ${wide ? 'is-wide' : ''}`} role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Cerrar" data-close><X size={18} /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  )
}

export function Confirm({ title, message, confirmLabel, danger, onConfirm, onClose }) {
  const [busy, setBusy] = useState(false)
  return (
    <Modal title={title} onClose={onClose} footer={<>
      <Button onClick={onClose}>Cancelar</Button>
      <Button variant={danger ? 'danger' : 'primary'} loading={busy} onClick={async () => {
        setBusy(true)
        try { await onConfirm() ; onClose() } finally { setBusy(false) }
      }}>{confirmLabel}</Button>
    </>}>
      <p>{message}</p>
    </Modal>
  )
}

export function Alert({ kind = 'info', children }) {
  const Icon = kind === 'info' ? Info : AlertTriangle
  return <div className={`alert alert-${kind}`} role={kind === 'bad' ? 'alert' : undefined}><Icon size={16} /><div>{children}</div></div>
}

export function Loading({ label = 'Cargando…' }) {
  return <div className="loading-block"><span className="spinner" /> {label}</div>
}

export function Empty({ title, children }) {
  return <div className="empty"><strong>{title}</strong>{children}</div>
}

const ESTADOS = {
  PENDIENTE: { cls: 'badge-warn', label: 'Pendiente', Icon: Clock3 },
  AUTORIZADO: { cls: 'badge-ok', label: 'Autorizado', Icon: CheckCircle2 },
  ERROR: { cls: 'badge-bad', label: 'Rechazado', Icon: XCircle },
}
export function EstadoBadge({ estado }) {
  const e = ESTADOS[estado] ?? { cls: '', label: estado, Icon: Info }
  return <span className={`badge ${e.cls}`}><e.Icon size={12} aria-hidden="true" />{e.label}</span>
}

export function PageHead({ title, children, actions }) {
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        {children && <p>{children}</p>}
      </div>
      {actions && <div className="toolbar">{actions}</div>}
    </div>
  )
}

/** Carga datos de la API y expone {data, loading, error, reload}. */
export function useApi(path, query, { skip = false } = {}) {
  const [state, setState] = useState({ data: null, loading: !skip, error: null })
  const key = JSON.stringify([path, query, skip])
  const reload = useCallback(async () => {
    if (skip) return
    setState((s) => ({ ...s, loading: true, error: null }))
    try {
      const data = await api.get(path, query)
      setState({ data, loading: false, error: null })
    } catch (e) {
      setState({ data: null, loading: false, error: e.message })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  useEffect(() => { reload() }, [reload])
  return { ...state, reload, setData: (data) => setState((s) => ({ ...s, data })) }
}

/** Envía una acción mostrando el resultado en un aviso. Devuelve la respuesta o null. */
export function useAction() {
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const run = useCallback(async (fn, okMessage, onError) => {
    setBusy(true)
    try {
      const r = await fn()
      if (okMessage) toast(typeof okMessage === 'function' ? okMessage(r) : okMessage)
      return r ?? true
    } catch (e) {
      onError?.(e)
      toast(e.message, 'bad')
      return null
    } finally {
      setBusy(false)
    }
  }, [toast])
  return [run, busy]
}

/** Formulario simple con errores por campo devueltos por la API. */
export function useForm(initial) {
  const [values, setValues] = useState(initial)
  const [errors, setErrors] = useState({})
  const set = (k) => (e) => {
    const v = e && e.target ? (e.target.type === 'checkbox' ? e.target.checked : e.target.value) : e
    setValues((s) => ({ ...s, [k]: v }))
    setErrors((s) => ({ ...s, [k]: undefined }))
  }
  const fail = (err) => {
    if (err?.data?.campo) setErrors({ [err.data.campo]: err.message })
  }
  return { values, setValues, set, errors, setErrors, fail }
}
