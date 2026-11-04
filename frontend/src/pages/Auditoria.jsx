import { Fragment, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { useSession } from '../context/Session'
import { Alert, Button, Empty, Field, Loading, PageHead, useApi } from '../components/ui'
import { addDays, fmtDateTime, today } from '../lib/format'

const MODULOS = {
  auth: 'Acceso', pagos: 'Pagos', comprobantes: 'Comprobantes', cuit: 'CUIT', consulta_arca: 'Consulta ARCA',
  terceros: 'Terceros', usuarios: 'Usuarios', configuracion: 'Configuración', centros: 'Centros', preferencias: 'Preferencias',
}

export default function Auditoria() {
  const { esStaff, centros } = useSession()
  const [f, setF] = useState({ desde: addDays(today(), -7), hasta: today(), usuario_id: '', centro_id: '', modulo: '', accion: '' })
  const [aplicado, setAplicado] = useState(f)
  const [pagina, setPagina] = useState(1)
  const [abierto, setAbierto] = useState(null)
  const { data, loading, error } = useApi('/auditoria', { ...aplicado, pagina })
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }))

  return (
    <div className="page">
      <PageHead title="Auditoría">
        {esStaff ? 'Registro de todas las acciones realizadas en el sistema. Es de solo lectura.' : 'Registro de las acciones que realizaste en el sistema. Es de solo lectura.'}
      </PageHead>

      <form className="filters" onSubmit={(e) => { e.preventDefault(); setPagina(1); setAplicado({ ...f }) }}>
        <Field label="Desde" htmlFor="au-d"><input id="au-d" type="date" className="input" value={f.desde} onChange={set('desde')} /></Field>
        <Field label="Hasta" htmlFor="au-h"><input id="au-h" type="date" className="input" value={f.hasta} onChange={set('hasta')} /></Field>
        {esStaff && (
          <Field label="Usuario" htmlFor="au-u">
            <select id="au-u" className="select" value={f.usuario_id} onChange={set('usuario_id')}>
              <option value="">Todos</option>
              {(data?.usuarios ?? []).map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
            </select>
          </Field>
        )}
        <Field label="Centro" htmlFor="au-c">
          <select id="au-c" className="select" value={f.centro_id} onChange={set('centro_id')}>
            <option value="">Todos</option>
            {centros.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        </Field>
        <Field label="Módulo" htmlFor="au-m">
          <select id="au-m" className="select" value={f.modulo} onChange={set('modulo')}>
            <option value="">Todos</option>
            {(data?.modulos ?? []).map((m) => <option key={m} value={m}>{MODULOS[m] ?? m}</option>)}
          </select>
        </Field>
        <Field label="Acción" htmlFor="au-a">
          <select id="au-a" className="select" value={f.accion} onChange={set('accion')}>
            <option value="">Todas</option>
            {(data?.acciones ?? []).map((a) => <option key={a} value={a}>{a.replaceAll('_', ' ')}</option>)}
          </select>
        </Field>
        <Button type="submit">Filtrar</Button>
      </form>

      {error && <Alert kind="bad">{error}</Alert>}
      <section className="panel">
        {loading && !data ? <Loading /> : !data?.registros.length ? <Empty title="No hay registros con estos filtros">Ampliá el rango de fechas o quitá filtros.</Empty> : (
          <>
            <div className="table-wrap">
              <table className="data">
                <thead><tr><th style={{ width: 28 }}></th><th>Fecha y hora</th><th>Usuario</th><th>Centro</th><th>Módulo</th><th>Acción</th><th>Entidad</th><th>IP</th></tr></thead>
                <tbody>
                  {data.registros.map((r) => {
                    const tieneDetalle = r.valor_anterior || r.valor_nuevo
                    const open = abierto === r.id
                    return (
                      <Fragment key={r.id}>
                        <tr onClick={() => tieneDetalle && setAbierto(open ? null : r.id)} style={{ cursor: tieneDetalle ? 'pointer' : 'default' }}>
                          <td>{tieneDetalle && <ChevronRight size={14} style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }} aria-label={open ? 'Ocultar detalle' : 'Ver detalle'} />}</td>
                          <td className="nowrap">{fmtDateTime(r.fecha_hora)}</td>
                          <td>{r.usuario_nombre || <span className="muted">Sin sesión</span>}<div className="small muted">{r.usuario_documento}</div></td>
                          <td>{r.centro_nombre ?? <span className="muted">—</span>}</td>
                          <td>{MODULOS[r.modulo] ?? r.modulo}</td>
                          <td><span className={`badge ${/fallido|error/.test(r.accion) ? 'badge-bad' : ''}`}>{r.accion.replaceAll('_', ' ')}</span></td>
                          <td className="small">{r.entidad ? `${r.entidad} #${r.entidad_id}` : <span className="muted">—</span>}</td>
                          <td className="small muted">{r.ip}</td>
                        </tr>
                        {open && (
                          <tr>
                            <td></td>
                            <td colSpan={7}>
                              <div className="grid-form" style={{ gridTemplateColumns: '1fr 1fr' }}>
                                <Valores titulo="Antes" v={r.valor_anterior} />
                                <Valores titulo="Después" v={r.valor_nuevo} />
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div className="panel-head" style={{ borderTop: '1px solid var(--line)', borderBottom: 0 }}>
              <span className="small muted">{data.total.toLocaleString('es-AR')} registros · página {data.pagina} de {data.paginas}</span>
              <div className="toolbar">
                <Button size="sm" disabled={pagina <= 1} onClick={() => setPagina((p) => p - 1)}>Anterior</Button>
                <Button size="sm" disabled={pagina >= data.paginas} onClick={() => setPagina((p) => p + 1)}>Siguiente</Button>
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  )
}

function Valores({ titulo, v }) {
  return (
    <div>
      <div className="small muted" style={{ marginBottom: 4 }}>{titulo}</div>
      {v ? (
        <dl className="kv small">
          {Object.entries(v).map(([k, val]) => (
            <Fragment key={k}><dt>{k.replaceAll('_', ' ')}</dt><dd style={{ wordBreak: 'break-word' }}>{val === null ? '—' : typeof val === 'object' ? JSON.stringify(val) : String(val)}</dd></Fragment>
          ))}
        </dl>
      ) : <span className="muted small">—</span>}
    </div>
  )
}
