import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Building, RefreshCw } from 'lucide-react'
import { useSession } from '../context/Session'
import { api } from '../lib/api'
import { Alert, Button, Empty, EstadoBadge, Field, Loading, Modal, PageHead, Switch, useAction } from '../components/ui'
import TopeGauge from '../components/TopeGauge'
import { firstOfMonth, fmtDate, fmtMoney, fmtNumero, today } from '../lib/format'

export default function Pagos() {
  const { centro, centroId } = useSession()
  const navigate = useNavigate()
  const [filtros, setFiltros] = useState({ desde: firstOfMonth(), hasta: today(), cuota_desde: '', origen: '' })
  const [vista, setVista] = useState('todos')
  const [res, setRes] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const [sel, setSel] = useState(() => new Set())
  const [confirmar, setConfirmar] = useState(false)
  const [agrupar, setAgrupar] = useState(false)
  const [editTope, setEditTope] = useState(false)
  const [run, busy] = useAction()

  const consultar = async (e) => {
    e?.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const r = await api.get('/pagos', { centro_id: centroId, ...filtros })
      setRes({ ...r, consulta: { ...filtros } })
      setSel(new Set())
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const pagos = res?.pagos ?? []
  const visibles = useMemo(() => pagos.filter((p) =>
    vista === 'todos' ? true : vista === 'facturados' ? p.comprobante : !p.comprobante), [pagos, vista])
  const seleccionados = pagos.filter((p) => sel.has(p.id))
  const totalSel = seleccionados.reduce((s, p) => s + p.importe, 0)
  const disponible = res?.tope ? res.tope.tope - res.tope.facturado : 0
  const excede = res?.tope ? totalSel > disponible + 0.001 : false
  const libres = visibles.filter((p) => !p.comprobante)
  const todosMarcados = libres.length > 0 && libres.every((p) => sel.has(p.id))

  const toggle = (id) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const toggleTodos = () => setSel(todosMarcados ? new Set() : new Set(libres.map((p) => p.id)))
  const hastaElTope = () => {
    const n = new Set()
    let acc = 0
    for (const p of libres) {
      if (acc + p.importe > disponible + 0.001) continue
      acc += p.importe
      n.add(p.id)
    }
    setSel(n)
  }

  const generar = async () => {
    const r = await run(() => api.post('/comprobantes/generar', {
      centro_id: centroId,
      desde: res.consulta.desde,
      hasta: res.consulta.hasta,
      pago_ids: [...sel],
      agrupar,
    }), (r) => `Se generaron ${r.creados} comprobantes pendientes de autorizar.`)
    setConfirmar(false)
    if (r) navigate('/comprobantes?estado=PENDIENTE')
    else consultar()
  }

  const set = (k) => (e) => setFiltros((f) => ({ ...f, [k]: e.target.value }))

  return (
    <div className="page">
      <PageHead title="Pagos">
        Pagos de alumnos de {centro?.nombre} registrados en Eddis. Marcá los que vas a facturar sin pasar el tope mensual del CUIT.
      </PageHead>

      <form className="filters" onSubmit={consultar}>
        <Field label="Desde" htmlFor="f-desde"><input id="f-desde" type="date" className="input" value={filtros.desde} onChange={set('desde')} required /></Field>
        <Field label="Hasta" htmlFor="f-hasta"><input id="f-hasta" type="date" className="input" value={filtros.hasta} onChange={set('hasta')} required /></Field>
        <Field label="Desde cuota n.º" htmlFor="f-cuota"><input id="f-cuota" type="number" min="0" className="input" value={filtros.cuota_desde} onChange={set('cuota_desde')} placeholder="Todas" /></Field>
        <Field label="Origen del pago" htmlFor="f-origen">
          <select id="f-origen" className="select" value={filtros.origen} onChange={set('origen')}>
            <option value="">Central y propios</option>
            <option value="CENTRAL">Solo de central</option>
            <option value="PROPIO">Solo propios</option>
          </select>
        </Field>
        <Button variant="primary" type="submit" loading={loading}><RefreshCw size={15} /> Buscar pagos</Button>
      </form>

      {error && <Alert kind="bad">{error}</Alert>}
      {!res && !loading && !error && (
        <div className="panel"><Empty title="Elegí el rango y buscá los pagos">Los pagos se traen en el momento desde el sistema de gestión Eddis.</Empty></div>
      )}
      {loading && <Loading label="Consultando pagos en Eddis… puede tardar hasta un minuto." />}

      {res && !loading && (
        <>
          {!res.cuit && (
            <div style={{ marginBottom: 12 }}>
              <Alert kind="bad">
                <strong>No se pueden seleccionar pagos: {centro?.nombre} no tiene CUIT cargado.</strong>{' '}
                Para facturar hace falta su CUIT, punto de venta y tope mensual. <Link to="/cuit">Cargar el CUIT de {centro?.nombre}</Link>
              </Alert>
            </div>
          )}
          {res.cuit?.arca_simulado && <div style={{ marginBottom: 12 }}><Alert kind="warn">El CUIT tiene la autorización de ARCA <strong>simulada</strong>: al autorizar se inventan el número, el CAE y su vencimiento. Sin validez fiscal.</Alert></div>}
          {res.cuit && !res.cuit.arca_simulado && res.cuit.modo_prueba && <div style={{ marginBottom: 12 }}><Alert kind="info">El CUIT autoriza en el entorno de homologación de ARCA: los comprobantes no tienen validez fiscal.</Alert></div>}

          <section className="panel">
            <div className="panel-head">
              <div className="toolbar" role="radiogroup" aria-label="Mostrar">
                {[['disponibles', 'Sin facturar'], ['facturados', 'Facturados'], ['todos', 'Todos']].map(([k, l]) => (
                  <Button key={k} size="sm" variant={vista === k ? 'primary' : 'ghost'} role="radio" aria-checked={vista === k} onClick={() => setVista(k)}>
                    {l} <span className="muted" style={vista === k ? { color: 'inherit', opacity: .8 } : undefined}>
                      {k === 'todos' ? pagos.length : pagos.filter((p) => (k === 'facturados') === !!p.comprobante).length}
                    </span>
                  </Button>
                ))}
              </div>
              <div className="toolbar">
                <span className="pago-leyenda" aria-label="Referencia de colores">
                  <span><i className="ley-generado" />Factura generada</span>
                  <span><i className="ley-autorizado" />Factura autorizada</span>
                </span>
                {res.cuit?.importar_cuota_99 && <span className="badge badge-accent">Incluye cuota 99 (examen)</span>}
                {res.tope && libres.length > 0 && <Button size="sm" onClick={hastaElTope}>Seleccionar hasta el tope</Button>}
              </div>
            </div>
            {visibles.length === 0
              ? <Empty title="No hay pagos para mostrar">Probá con otro rango de fechas, otra cuota o la vista Todos.</Empty>
              : (
                <div className="table-wrap" style={{ maxHeight: 'calc(100vh - 380px)', minHeight: 240 }}>
                  <table className="data">
                    <thead>
                      <tr>
                        <th className="check-cell">
                          <label className="check"><input type="checkbox" checked={todosMarcados} onChange={toggleTodos} disabled={!libres.length || !res.cuit} aria-label="Seleccionar todos los pagos sin facturar" /></label>
                        </th>
                        <th>Fecha</th>
                        <th>Alumno</th>
                        <th>Concepto</th>
                        <th className="num">Cuota</th>
                        <th>Origen</th>
                        <th>Factura a</th>
                        <th className="num">Importe</th>
                        <th>Comprobante</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibles.map((p) => {
                        const facturado = !!p.comprobante
                        return (
                          <tr key={p.id} className={facturado ? (p.comprobante.estado === 'AUTORIZADO' ? 'is-autorizado' : 'is-generado') : sel.has(p.id) ? 'is-selected' : ''}
                            onClick={(e) => { if (!facturado && res.cuit && !e.target.closest('input, label')) toggle(p.id) }} style={{ cursor: facturado ? 'default' : 'pointer' }}>
                            <td className="check-cell">
                              <label className="check" title={!res.cuit ? 'Cargá el CUIT del centro para poder facturar' : facturado ? 'Este pago ya está facturado' : undefined}><input type="checkbox" checked={sel.has(p.id)} disabled={facturado || !res.cuit} onChange={() => toggle(p.id)} aria-label={`Seleccionar pago de ${p.alumno} del ${fmtDate(p.fecha)}`} /></label>
                            </td>
                            <td className="nowrap">{fmtDate(p.fecha)}</td>
                            <td>{p.alumno}<div className="muted small">DNI {p.documento}</div></td>
                            <td>{p.concepto}</td>
                            <td className="num">{p.nro_cuota === 99 ? <span className="badge badge-accent">99</span> : p.nro_cuota}</td>
                            <td>{p.origen === 'CENTRAL' ? 'Central' : 'Propio'}{p.forma_pago && <div className="small muted">{p.forma_pago}</div>}</td>
                            <td>{p.tercero ? <span title={`CUIT ${p.tercero.cuit}`} style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><Building size={14} aria-hidden="true" />{p.tercero.razon_social}</span> : <span className="muted">Alumno</span>}</td>
                            <td className="num">{fmtMoney(p.importe)}</td>
                            <td>{p.comprobante ? (
                              <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                                <EstadoBadge estado={p.comprobante.estado} />
                                <span className="small nowrap">{p.comprobante.tipo_nombre} {p.comprobante.numero ? fmtNumero(p.comprobante.punto_venta, p.comprobante.numero) : `#${p.comprobante.id} (sin número)`}</span>
                              </span>
                            ) : <span className="muted">—</span>}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
          </section>

          {res.tope && (
            <TopeGauge tope={res.tope} seleccionado={totalSel} cantidad={sel.size} onEditarTope={res.cuit ? () => setEditTope(true) : undefined}>
              <div className="toolbar">
                {sel.size > 0 && <Button variant="ghost" onClick={() => setSel(new Set())}>Limpiar selección</Button>}
                <Button variant="primary" disabled={!sel.size || excede || res.tope.tope <= 0} onClick={() => setConfirmar(true)}>
                  Generar comprobantes
                </Button>
              </div>
            </TopeGauge>
          )}
          {res.tope && res.tope.tope <= 0 && <div style={{ marginTop: 12 }}><Alert kind="warn">El CUIT no tiene tope mensual cargado; no se pueden generar comprobantes hasta completarlo. <Button size="sm" onClick={() => setEditTope(true)}>Cargar el tope</Button></Alert></div>}
        </>
      )}

      {editTope && res?.cuit && (
        <TopeForm cuit={res.cuit} tope={res.tope} onClose={() => setEditTope(false)}
          onSaved={(tope) => { setRes((r) => ({ ...r, tope })); setEditTope(false) }} />
      )}

      {confirmar && (
        <Modal title="Generar comprobantes" onClose={() => setConfirmar(false)} footer={<>
          <Button onClick={() => setConfirmar(false)}>Cancelar</Button>
          <Button variant="primary" loading={busy} onClick={generar}>Generar comprobantes</Button>
        </>}>
          <div style={{ display: 'grid', gap: 16 }}>
            <dl className="kv">
              <dt>Pagos</dt><dd>{sel.size}</dd>
              <dt>Importe total</dt><dd><strong>{fmtMoney(totalSel)}</strong></dd>
              <dt>A empresas</dt><dd>{seleccionados.filter((p) => p.tercero).length} pagos con datos de terceros</dd>
            </dl>
            <Switch checked={agrupar} onChange={setAgrupar} label="Un comprobante por alumno (agrupa sus pagos)" />
            <p className="muted small">
              {agrupar
                ? `Se generará un comprobante por alumno: ${new Set(seleccionados.map((p) => p.documento)).size} en total.`
                : `Se generará un comprobante por pago: ${sel.size} en total.`}
              {' '}Quedan pendientes hasta que los autorices en Comprobantes fiscales.
            </p>
          </div>
        </Modal>
      )}
    </div>
  )
}

function TopeForm({ cuit, tope, onClose, onSaved }) {
  const [valor, setValor] = useState(tope?.tope ? String(tope.tope) : '')
  const [error, setError] = useState(null)
  const [run, busy] = useAction()

  const guardar = async (e) => {
    e.preventDefault()
    const r = await run(() => api.put(`/cuits/${cuit.id}/tope`, { tope_facturacion: valor }), 'Tope de facturación actualizado.', (err) => setError(err.message))
    if (r) onSaved(r.tope)
  }

  return (
    <Modal title="Tope de facturación mensual" onClose={onClose} footer={<>
      <Button onClick={onClose}>Cancelar</Button>
      <Button variant="primary" type="submit" form="tope-form" loading={busy}>Guardar tope</Button>
    </>}>
      <form id="tope-form" onSubmit={guardar} style={{ display: 'grid', gap: 12 }}>
        <Field label={`Tope mensual de ${cuit.razon_social} ($)`} error={error} htmlFor="tope-valor"
          hint={tope ? `Facturado este mes: ${fmtMoney(tope.facturado)}. El cambio queda guardado en el CUIT.` : 'El cambio queda guardado en el CUIT.'}>
          <input id="tope-valor" className="input" type="number" step="0.01" min="0" value={valor} autoFocus required
            onChange={(e) => { setValor(e.target.value); setError(null) }} aria-invalid={!!error} />
        </Field>
      </form>
    </Modal>
  )
}
