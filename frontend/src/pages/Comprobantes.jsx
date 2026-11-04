import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Send, FileMinus2, Trash2, Eye, Printer } from 'lucide-react'
import { useSession } from '../context/Session'
import { api } from '../lib/api'
import { Alert, Button, Confirm, Empty, EstadoBadge, Field, Loading, Modal, PageHead, useAction, useApi } from '../components/ui'
import { addDays, fmtCuit, fmtDate, fmtDateTime, fmtMoney, fmtNumero, today, CONDICION_IVA } from '../lib/format'

const DOC_TIPO = { 80: 'CUIT', 96: 'DNI', 99: 'Sin identificar' }

/** Abre la representación impresa en una pestaña nueva. */
export const imprimir = (ids) => window.open(`${window.location.pathname}#/imprimir?ids=${ids.join(',')}`, '_blank', 'noopener')

export default function Comprobantes() {
  const { centro, centroId } = useSession()
  const [params, setParams] = useSearchParams()
  const [filtros, setFiltros] = useState({ desde: addDays(today(), -90), hasta: today(), clase: '', q: '' })
  const estado = params.get('estado') ?? ''
  const [aplicados, setAplicados] = useState(filtros)
  const { data, loading, error, reload } = useApi('/comprobantes', { centro_id: centroId, ...aplicados, estado })
  const [sel, setSel] = useState(() => new Set())
  const [detalle, setDetalle] = useState(null)
  const [resultado, setResultado] = useState(null)
  const [confirm, setConfirm] = useState(null)
  const [run, busy] = useAction()

  const lista = data?.comprobantes ?? []
  const elegidos = lista.filter((c) => sel.has(c.id))
  const autorizables = elegidos.filter((c) => c.estado !== 'AUTORIZADO')
  const imprimibles = elegidos.filter((c) => c.estado === 'AUTORIZADO')
  const anulables = elegidos.filter((c) => c.clase === 'FACTURA' && c.estado === 'AUTORIZADO' && !c.anulado && !c.nota_credito_id)
  const totalSel = elegidos.reduce((s, c) => s + c.importe_total, 0)
  const todos = lista.length > 0 && lista.every((c) => sel.has(c.id))

  const toggle = (id) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const setEstado = (v) => { setSel(new Set()); setParams(v ? { estado: v } : {}) }

  const autorizar = async () => {
    const r = await run(() => api.post('/comprobantes/autorizar', { ids: autorizables.map((c) => c.id) }))
    if (r) { setResultado(r); setSel(new Set()); reload() }
  }
  const notasCredito = async () => {
    const r = await run(() => api.post('/comprobantes/notas-credito', { ids: anulables.map((c) => c.id) }),
      (r) => `Se generaron ${r.creadas} notas de crédito pendientes de autorizar.`)
    if (r) { setSel(new Set()); reload() }
  }

  const resumen = data?.resumen ?? { PENDIENTE: 0, AUTORIZADO: 0, ERROR: 0 }
  const tabs = [['', 'Todos'], ['PENDIENTE', 'Pendientes'], ['ERROR', 'Rechazados'], ['AUTORIZADO', 'Autorizados']]

  return (
    <div className="page">
      <PageHead title="Comprobantes fiscales">
        Comprobantes de {centro?.nombre} generados desde Pagos. Nacen pendientes; se autorizan en ARCA desde acá.
      </PageHead>

      <form className="filters" onSubmit={(e) => { e.preventDefault(); setSel(new Set()); setAplicados({ ...filtros }) }}>
        <Field label="Desde" htmlFor="c-desde"><input id="c-desde" type="date" className="input" value={filtros.desde} onChange={(e) => setFiltros({ ...filtros, desde: e.target.value })} /></Field>
        <Field label="Hasta" htmlFor="c-hasta"><input id="c-hasta" type="date" className="input" value={filtros.hasta} onChange={(e) => setFiltros({ ...filtros, hasta: e.target.value })} /></Field>
        <Field label="Clase" htmlFor="c-clase">
          <select id="c-clase" className="select" value={filtros.clase} onChange={(e) => setFiltros({ ...filtros, clase: e.target.value })}>
            <option value="">Facturas y notas de crédito</option>
            <option value="FACTURA">Solo facturas</option>
            <option value="NOTA_CREDITO">Solo notas de crédito</option>
          </select>
        </Field>
        <Field label="Buscar" className="wide" htmlFor="c-q"><input id="c-q" className="input" placeholder="Receptor, documento, número o CAE" value={filtros.q} onChange={(e) => setFiltros({ ...filtros, q: e.target.value })} /></Field>
        <Button type="submit">Filtrar</Button>
      </form>

      {error && <Alert kind="bad">{error}</Alert>}

      <section className="panel">
        <div className="panel-head">
          <div className="toolbar" role="tablist" aria-label="Estado">
            {tabs.map(([k, l]) => (
              <Button key={k} size="sm" variant={estado === k ? 'primary' : 'ghost'} role="tab" aria-selected={estado === k} onClick={() => setEstado(k)}>
                {l}{k && <span style={{ opacity: .75 }}>{resumen[k] ?? ''}</span>}
              </Button>
            ))}
          </div>
          <div className="toolbar">
            {sel.size > 0 && <span className="small muted">{sel.size} seleccionados · {fmtMoney(totalSel)}</span>}
            <Button size="sm" disabled={!imprimibles.length} onClick={() => imprimir(imprimibles.map((c) => c.id))} title="Imprime los comprobantes autorizados seleccionados">
              <Printer size={15} /> Imprimir{imprimibles.length ? ` (${imprimibles.length})` : ''}
            </Button>
            <Button size="sm" disabled={!anulables.length} loading={busy && !!anulables.length && !autorizables.length}
              onClick={() => setConfirm({ tipo: 'nc' })} title="Genera una nota de crédito por cada factura autorizada seleccionada">
              <FileMinus2 size={15} /> Generar notas de crédito{anulables.length ? ` (${anulables.length})` : ''}
            </Button>
            <Button size="sm" variant="primary" disabled={!autorizables.length} loading={busy && !!autorizables.length} onClick={autorizar}>
              <Send size={15} /> Autorizar en ARCA{autorizables.length ? ` (${autorizables.length})` : ''}
            </Button>
          </div>
        </div>

        {loading && !data ? <Loading /> : lista.length === 0 ? (
          <Empty title="No hay comprobantes con estos filtros">Generalos desde Pagos seleccionando los pagos a facturar.</Empty>
        ) : (
          <div className="table-wrap" style={{ maxHeight: 'calc(100vh - 320px)', minHeight: 240 }}>
            <table className="data">
              <thead>
                <tr>
                  <th className="check-cell"><label className="check"><input type="checkbox" checked={todos} onChange={() => setSel(todos ? new Set() : new Set(lista.map((c) => c.id)))} aria-label="Seleccionar todos" /></label></th>
                  <th>Fecha</th>
                  <th>Comprobante</th>
                  <th>Receptor</th>
                  <th>Pagos de Eddis</th>
                  <th className="num">Total</th>
                  <th>Estado</th>
                  <th>CAE</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {lista.map((c) => (
                  <tr key={c.id} className={sel.has(c.id) ? 'is-selected' : ''}>
                    <td className="check-cell"><label className="check"><input type="checkbox" checked={sel.has(c.id)} onChange={() => toggle(c.id)} aria-label={`Seleccionar comprobante ${c.id}`} /></label></td>
                    <td className="nowrap">{fmtDate(c.fecha)}</td>
                    <td>
                      <div className="nowrap">{c.tipo_nombre}{c.simulado ? <span className="badge badge-warn" style={{ marginLeft: 6 }} title="CAE simulado: sin validez fiscal">Simulada</span> : c.modo_prueba && <span className="badge" style={{ marginLeft: 6 }}>Homologación</span>}{c.anulado && <span className="badge badge-bad" style={{ marginLeft: 6 }}>Anulada</span>}</div>
                      <div className="small muted nowrap">{fmtNumero(c.punto_venta, c.numero)}{c.asociado && ` · anula ${c.asociado.tipo_nombre} ${fmtNumero(c.asociado.punto_venta, c.asociado.numero)}`}</div>
                    </td>
                    <td>
                      {c.receptor_nombre}
                      <div className="small muted">{DOC_TIPO[c.receptor_doc_tipo]} {c.receptor_doc_tipo === 80 ? fmtCuit(c.receptor_doc_nro) : c.receptor_doc_nro}{c.es_tercero && c.alumno_nombre && ` · alumno ${c.alumno_nombre}`}</div>
                    </td>
                    <td className="small">
                      {c.pagos.length === 0 ? <span className="muted">—</span> : c.pagos.map((pg) => (
                        <div key={pg.pago_id_eddis} className="nowrap" style={pg.activo ? undefined : { textDecoration: 'line-through', color: 'var(--muted)' }} title={pg.activo ? undefined : 'Pago liberado por nota de crédito'}>
                          Pago {pg.pago_id_eddis}{pg.nro_cuota !== null && ` · cuota ${pg.nro_cuota}`}{pg.fecha_pago && ` · ${fmtDate(pg.fecha_pago)}`}
                        </div>
                      ))}
                    </td>
                    <td className="num">{c.clase === 'NOTA_CREDITO' ? '−' : ''}{fmtMoney(c.importe_total)}</td>
                    <td>
                      <EstadoBadge estado={c.estado} />
                      {c.estado === 'ERROR' && <div className="small" style={{ color: 'var(--bad)', maxWidth: 280 }}>{c.error_arca}</div>}
                    </td>
                    <td className="small nowrap">{c.cae ? <>{c.cae}<div className="muted">vence {fmtDate(c.venc_cae)}</div></> : <span className="muted">—</span>}</td>
                    <td className="nowrap" style={{ textAlign: 'right' }}>
                      <button className="icon-btn" onClick={() => setDetalle(c.id)} aria-label="Ver detalle" title="Ver detalle"><Eye size={16} /></button>
                      {c.estado === 'AUTORIZADO' && <button className="icon-btn" onClick={() => imprimir([c.id])} aria-label="Imprimir comprobante" title="Imprimir comprobante"><Printer size={16} /></button>}
                      {c.estado !== 'AUTORIZADO' && (
                        <button className="icon-btn" onClick={() => setConfirm({ tipo: 'del', c })} aria-label="Eliminar" title="Eliminar y liberar los pagos"><Trash2 size={16} /></button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {detalle && <Detalle id={detalle} onClose={() => setDetalle(null)} />}

      {resultado && (
        <Modal title="Resultado de la autorización" onClose={() => setResultado(null)} footer={<Button variant="primary" onClick={() => setResultado(null)}>Listo</Button>}>
          <p style={{ marginBottom: 12 }}>
            <strong>{resultado.autorizados}</strong> autorizados{resultado.con_error > 0 && <>, <strong style={{ color: 'var(--bad)' }}>{resultado.con_error}</strong> con error. Los rechazados quedan para reintentar.</>}
          </p>
          <table className="data">
            <thead><tr><th>Comprobante</th><th>Resultado</th></tr></thead>
            <tbody>
              {resultado.resultados.map((r) => (
                <tr key={r.id}>
                  <td className="nowrap">#{r.id}{r.numero ? ` · n.º ${r.numero}` : ''}</td>
                  <td>{r.ok ? <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}><span className="badge badge-ok">CAE {r.cae}</span><span className="small muted">vence {fmtDate(r.venc_cae)}</span>{r.simulado && <span className="badge badge-warn">Simulada</span>}</span> : <span style={{ color: 'var(--bad)' }}>{r.error}</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Modal>
      )}

      {confirm?.tipo === 'nc' && (
        <Confirm title="Generar notas de crédito" confirmLabel="Generar notas de crédito" onClose={() => setConfirm(null)} onConfirm={notasCredito}
          message={`Se generará una nota de crédito por cada una de las ${anulables.length} facturas seleccionadas, por ${fmtMoney(anulables.reduce((s, c) => s + c.importe_total, 0))}. Al autorizarlas, las facturas quedan anuladas y sus pagos vuelven a estar disponibles.`} />
      )}
      {confirm?.tipo === 'del' && (
        <Confirm title="Eliminar comprobante" danger confirmLabel="Eliminar comprobante" onClose={() => setConfirm(null)}
          onConfirm={async () => { if (await run(() => api.del(`/comprobantes/${confirm.c.id}`), 'Comprobante eliminado. Sus pagos vuelven a estar disponibles.')) reload() }}
          message={`${confirm.c.tipo_nombre} a ${confirm.c.receptor_nombre} por ${fmtMoney(confirm.c.importe_total)}. No está autorizado en ARCA; al eliminarlo, sus pagos se pueden volver a facturar.`} />
      )}
    </div>
  )
}

function Detalle({ id, onClose }) {
  const { data, loading, error } = useApi(`/comprobantes/${id}`)
  const c = data
  const totalPagos = useMemo(() => (c?.pagos ?? []).reduce((s, p) => s + p.importe, 0), [c])
  return (
    <Modal wide title={c ? `${c.tipo_nombre} ${fmtNumero(c.punto_venta, c.numero)}` : 'Comprobante'} onClose={onClose}
      footer={c?.estado === 'AUTORIZADO' ? <Button variant="primary" onClick={() => imprimir([c.id])}><Printer size={15} /> Imprimir comprobante</Button> : undefined}>
      {loading && <Loading />}
      {error && <Alert kind="bad">{error}</Alert>}
      {c && (
        <div style={{ display: 'grid', gap: 20 }}>
          <div className="toolbar"><EstadoBadge estado={c.estado} />{c.simulado && <span className="badge badge-warn">Autorización simulada: número y CAE inventados, sin validez fiscal</span>}{!c.simulado && c.modo_prueba && <span className="badge">Homologación de ARCA</span>}{c.anulado && <span className="badge badge-bad">Anulada por nota de crédito</span>}</div>
          {c.estado === 'ERROR' && <Alert kind="bad">ARCA: {c.error_arca}</Alert>}
          <div className="grid-form">
            <dl className="kv">
              <dt>Emisor</dt><dd>{c.emisor?.razon_social}</dd>
              <dt>CUIT</dt><dd>{fmtCuit(c.emisor?.cuit)}</dd>
              <dt>Condición</dt><dd>{CONDICION_IVA[c.emisor?.condicion_iva]}</dd>
              <dt>Fecha</dt><dd>{fmtDate(c.fecha)}</dd>
            </dl>
            <dl className="kv">
              <dt>Receptor</dt><dd>{c.receptor_nombre}</dd>
              <dt>{DOC_TIPO[c.receptor_doc_tipo]}</dt><dd>{c.receptor_doc_tipo === 80 ? fmtCuit(c.receptor_doc_nro) : c.receptor_doc_nro}</dd>
              <dt>Condición</dt><dd>{CONDICION_IVA[c.receptor_condicion_iva]}</dd>
              {c.es_tercero && <><dt>Alumno</dt><dd>{c.alumno_nombre} (DNI {c.alumno_documento})</dd></>}
            </dl>
            <dl className="kv">
              <dt>Neto</dt><dd className="num" style={{ textAlign: 'left' }}>{fmtMoney(c.importe_neto)}</dd>
              <dt>IVA {c.alicuota ? `${c.alicuota}%` : ''}</dt><dd>{fmtMoney(c.importe_iva)}</dd>
              <dt>Total</dt><dd><strong>{fmtMoney(c.importe_total)}</strong></dd>
              <dt>CAE</dt><dd>{c.cae ?? '—'}{c.venc_cae && ` (vence ${fmtDate(c.venc_cae)})`}</dd>
            </dl>
          </div>
          {c.asociado && <p className="muted">Anula {c.asociado.tipo_nombre} {fmtNumero(c.asociado.punto_venta, c.asociado.numero)} del {fmtDate(c.asociado.fecha)}.</p>}
          {c.pagos.length > 0 && (
            <table className="data">
              <thead><tr><th>Pago Eddis</th><th>Fecha</th><th>Concepto</th><th className="num">Cuota</th><th className="num">Importe</th></tr></thead>
              <tbody>
                {c.pagos.map((p) => (
                  <tr key={p.pago_id_eddis} className={p.activo ? '' : 'is-disabled'}>
                    <td className="small">{p.pago_id_eddis}{!p.activo && ' · liberado'}</td>
                    <td>{fmtDate(p.fecha_pago)}</td><td>{p.concepto}</td><td className="num">{p.nro_cuota}</td><td className="num">{fmtMoney(p.importe)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr><td colSpan={4}>Total de pagos</td><td className="num">{fmtMoney(totalPagos)}</td></tr></tfoot>
            </table>
          )}
          <p className="small muted">Generado el {fmtDateTime(c.created_at)}{c.autorizado_at && ` · autorizado el ${fmtDateTime(c.autorizado_at)}`} · {c.intentos} {c.intentos === 1 ? 'intento' : 'intentos'} de autorización</p>
        </div>
      )}
    </Modal>
  )
}
