import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { ChevronDown, Search, X, Check } from 'lucide-react'

const normalizar = (t) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

/**
 * Selección múltiple con búsqueda.
 * opciones: [{ value, label, hint? }] · valores: [value] · onChange(valores)
 * Teclado: flechas para moverse, Enter o Espacio para marcar, Escape para cerrar, Retroceso borra la última etiqueta.
 */
export default function MultiCombo({ label, opciones, valores, onChange, placeholder = 'Elegí una o varias opciones', vacio = 'No hay opciones que coincidan.' }) {
  const [abierto, setAbierto] = useState(false)
  const [texto, setTexto] = useState('')
  const [activo, setActivo] = useState(0)
  const raiz = useRef(null)
  const entrada = useRef(null)
  const lista = useRef(null)
  const id = useId()

  const elegidos = useMemo(() => new Set(valores), [valores])
  const filtradas = useMemo(() => {
    const t = normalizar(texto.trim())
    return t ? opciones.filter((o) => normalizar(o.label).includes(t)) : opciones
  }, [opciones, texto])
  const porValor = useMemo(() => new Map(opciones.map((o) => [o.value, o])), [opciones])

  useEffect(() => {
    if (!abierto) return
    const cerrar = (e) => { if (!raiz.current?.contains(e.target)) setAbierto(false) }
    document.addEventListener('mousedown', cerrar)
    return () => document.removeEventListener('mousedown', cerrar)
  }, [abierto])
  useEffect(() => { setActivo(0) }, [texto])
  // Al cerrar se limpia la búsqueda, para que la próxima vez se vea la lista completa.
  useEffect(() => { if (!abierto) setTexto('') }, [abierto])
  useEffect(() => {
    lista.current?.querySelector(`[data-idx="${activo}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [activo, abierto])

  const alternar = (v) => onChange(elegidos.has(v) ? valores.filter((x) => x !== v) : [...valores, v])
  const todosVisibles = filtradas.length > 0 && filtradas.every((o) => elegidos.has(o.value))
  const marcarVisibles = () => onChange(todosVisibles
    ? valores.filter((v) => !filtradas.some((o) => o.value === v))
    : [...new Set([...valores, ...filtradas.map((o) => o.value)])])

  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setAbierto(true); setActivo((i) => Math.min(i + 1, filtradas.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActivo((i) => Math.max(i - 1, 0)) }
    else if (e.key === 'Enter' || (e.key === ' ' && abierto && texto === '')) {
      e.preventDefault()
      if (!abierto) { setAbierto(true); return }
      if (filtradas[activo]) alternar(filtradas[activo].value)
    }
    else if (e.key === 'Escape') { if (abierto) { e.stopPropagation(); setAbierto(false) } }
    else if (e.key === 'Backspace' && texto === '' && valores.length) onChange(valores.slice(0, -1))
  }

  return (
    <div className="mc" ref={raiz}>
      <div className="mc-cabecera">
        <label htmlFor={`${id}-in`} className="mc-label">{label}</label>
        <span className="mc-cuenta">{valores.length ? `${valores.length} de ${opciones.length}` : `${opciones.length} disponibles`}</span>
      </div>
      <div className={`mc-control ${abierto ? 'is-open' : ''}`} onClick={() => { setAbierto(true); entrada.current?.focus() }}>
        {valores.map((v) => (
          <span key={v} className="mc-chip">
            {porValor.get(v)?.label ?? v}
            <button type="button" aria-label={`Quitar ${porValor.get(v)?.label ?? v}`} onClick={(e) => { e.stopPropagation(); alternar(v) }}><X size={12} /></button>
          </span>
        ))}
        <span className="mc-buscar">
          {valores.length === 0 && <Search size={14} aria-hidden="true" />}
          <input
            id={`${id}-in`} ref={entrada} value={texto} autoComplete="off"
            placeholder={valores.length ? 'Agregar…' : placeholder}
            onChange={(e) => { setTexto(e.target.value); setAbierto(true) }}
            onFocus={() => setAbierto(true)} onKeyDown={onKey}
            role="combobox" aria-expanded={abierto} aria-controls={`${id}-lista`} aria-autocomplete="list"
            aria-activedescendant={abierto && filtradas[activo] ? `${id}-op-${activo}` : undefined}
          />
        </span>
        <ChevronDown size={16} className="mc-flecha" aria-hidden="true" />
      </div>

      {abierto && (
        <div className="mc-panel">
          <div className="mc-acciones">
            <button type="button" onClick={marcarVisibles} disabled={!filtradas.length}>
              {texto ? `${todosVisibles ? 'Desmarcar' : 'Marcar'} estos (${filtradas.length})` : todosVisibles ? 'Desmarcar todos' : 'Marcar todos'}
            </button>
            {valores.length > 0 && <button type="button" onClick={() => onChange([])}>Quitar todos</button>}
          </div>
          <ul className="mc-lista" id={`${id}-lista`} role="listbox" aria-multiselectable="true" ref={lista}>
            {filtradas.length === 0 && <li className="mc-vacio">{vacio}</li>}
            {filtradas.map((o, i) => {
              const sel = elegidos.has(o.value)
              return (
                <li key={o.value} id={`${id}-op-${i}`} data-idx={i} role="option" aria-selected={sel}
                  className={`mc-opcion ${i === activo ? 'is-activa' : ''} ${sel ? 'is-sel' : ''}`}
                  onMouseEnter={() => setActivo(i)} onMouseDown={(e) => e.preventDefault()} onClick={() => alternar(o.value)}>
                  <span className="mc-tilde" aria-hidden="true">{sel && <Check size={12} strokeWidth={3} />}</span>
                  <span className="mc-texto">{o.label}</span>
                  {o.hint && <span className="mc-hint">{o.hint}</span>}
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
