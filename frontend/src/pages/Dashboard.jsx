import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ShieldCheck, ShieldAlert } from 'lucide-react'
import { useSession } from '../context/Session'
import { Alert, Empty, Field, Loading, PageHead, useApi } from '../components/ui'
import BarChart from '../components/BarChart'
import { fmtDate, fmtMoney, MESES, MARCA, fmtCuit } from '../lib/format'

export default function Dashboard() {
  const { session } = useSession()
  const [anio, setAnio] = useState(new Date().getFullYear())
  const { data, loading, error } = useApi('/dashboard', { anio })

  const alerta = session?.dias_alerta_certificado ?? 30
  // Solo los centros con facturación en el año: así los colores no se repiten y la tabla no se llena de columnas vacías.
  const conDatos = new Set((data?.series ?? []).filter((x) => x.meses.some((v) => v !== 0)).map((x) => x.centro_id))
  const centros = (data?.centros ?? []).filter((c) => conDatos.has(c.id))
  const seriesVisibles = (data?.series ?? []).filter((x) => conDatos.has(x.centro_id))
  const orden = new Map(centros.map((c, i) => [c.id, i]))
  const colorOf = (id) => `var(--series-${(orden.get(id) % 8) + 1})`
  const nameOf = (id) => (data?.centros ?? []).find((c) => c.id === id)?.nombre ?? ''
  const totalMes = MESES.map((_, m) => (data?.series ?? []).reduce((s, x) => s + x.meses[m], 0))
  const totalAnio = totalMes.reduce((a, b) => a + b, 0)
  const simMes = MESES.map((_, m) => (data?.series ?? []).reduce((s, x) => s + (x.meses_simulado?.[m] ?? 0), 0))
  const simAnio = simMes.reduce((a, b) => a + b, 0)
  const SimTag = ({ v }) => (v ? <div><span className="badge badge-warn" title="CAE simulado o de homologación: sin validez fiscal">Simulada {fmtMoney(v)}</span></div> : null)

  return (
    <div className="page">
      <PageHead title="Dashboard" actions={<>
        <Field label="Año" className="" htmlFor="anio">
          <select id="anio" className="select" value={anio} onChange={(e) => setAnio(Number(e.target.value))} style={{ width: 110 }}>
            {(data?.anios ?? [anio]).map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </Field>
      </>}>
        Facturación autorizada de {anio}, neta de notas de crédito. Lo simulado o de homologación se incluye con su etiqueta: no tiene validez fiscal.
      </PageHead>

      {error && <Alert kind="bad">{error}</Alert>}
      {loading && !data && <Loading />}
      {data && (
        <>
          <div className="stat-row">
            <div className="stat"><small>Facturado en {anio}</small><strong>{fmtMoney(totalAnio)}</strong>{simAnio !== 0 && <span className="badge badge-warn">incluye {fmtMoney(simAnio)} simulado</span>}</div>
            <div className="stat"><small>Facturas autorizadas</small><strong>{data.cantidad_facturas.toLocaleString('es-AR')}</strong>{data.cantidad_simuladas > 0 && <span className="badge badge-warn">{data.cantidad_simuladas} {data.cantidad_simuladas === 1 ? 'simulada' : 'simuladas'}</span>}</div>
            <div className="stat"><small>Pendientes de autorizar</small><strong>{data.pendientes}</strong>{data.pendientes > 0 && <Link to="/comprobantes?estado=PENDIENTE">Ver pendientes</Link>}</div>
            <div className="stat"><small>Rechazados por ARCA</small><strong style={data.errores ? { color: 'var(--bad)' } : undefined}>{data.errores}</strong>{data.errores > 0 && <Link to="/comprobantes?estado=ERROR">Revisar</Link>}</div>
          </div>

          <div className="dash-grid">
            <div style={{ display: 'grid', gap: 16, minWidth: 0, gridTemplateColumns: 'minmax(0, 1fr)' }}>
              <section className="panel">
                <div className="panel-head">
                  <h2>Facturación por mes y centro</h2>
                  <div className="chart-legend">
                    {centros.map((c) => <span key={c.id}><i style={{ background: colorOf(c.id) }} />{c.nombre}</span>)}
                    {simAnio !== 0 && <span><i style={{ background: 'repeating-linear-gradient(135deg, var(--ink-2) 0 2px, var(--surface) 2px 4px)', outline: '1px solid var(--ink-2)' }} />Rayado: simulado</span>}
                  </div>
                </div>
                <div className="panel-body">
                  {totalAnio === 0
                    ? <Empty title={`Sin facturación autorizada en ${anio}`}>Cuando autorices comprobantes vas a ver la evolución mensual acá.</Empty>
                    : <BarChart series={seriesVisibles} colorOf={colorOf} nameOf={nameOf} />}
                </div>
              </section>

              <section className="panel">
                <div className="panel-head"><h2>Total por mes</h2></div>
                <div className="table-wrap">
                  <table className="data">
                    <thead>
                      <tr>
                        <th>Mes</th>
                        {centros.map((c) => <th key={c.id} className="num">{c.nombre}</th>)}
                        <th className="num">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {MESES.map((m, i) => (
                        <tr key={m}>
                          <td>{m}</td>
                          {seriesVisibles.map((s) => <td key={s.centro_id} className="num">{s.meses[i] ? <>{fmtMoney(s.meses[i])}<SimTag v={s.meses_simulado[i]} /></> : <span className="muted">—</span>}</td>)}
                          <td className="num"><strong>{fmtMoney(totalMes[i])}</strong><SimTag v={simMes[i]} /></td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td>{anio}</td>
                        {seriesVisibles.map((s) => <td key={s.centro_id} className="num">{fmtMoney(s.meses.reduce((a, b) => a + b, 0))}<SimTag v={s.meses_simulado.reduce((a, b) => a + b, 0)} /></td>)}
                        <td className="num">{fmtMoney(totalAnio)}<SimTag v={simAnio} /></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </section>
            </div>

            <div style={{ display: 'grid', gap: 16, minWidth: 0, gridTemplateColumns: 'minmax(0, 1fr)' }}>
              <section className="panel">
                <div className="panel-head"><h2>Vencimiento de certificados</h2></div>
                <ul className="cert-list">
                  {data.certificados.map((c) => {
                    const estado = c.dias === null ? 'warn' : c.dias < 0 ? 'bad' : c.dias <= alerta ? 'warn' : 'ok'
                    const Icon = estado === 'ok' ? ShieldCheck : ShieldAlert
                    return (
                      <li key={c.centro_id}>
                        <div>
                          <div>{c.nombre}</div>
                          <div className="sub">{MARCA[c.marca]} · {c.cuit ? fmtCuit(c.cuit) : 'sin CUIT'}</div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <span className={`badge badge-${estado}`}><Icon size={12} aria-hidden="true" />
                            {c.dias === null ? 'Sin fecha' : c.dias < 0 ? `Vencido` : `${c.dias} días`}
                          </span>
                          <div className="sub">{c.venc_certificado ? fmtDate(c.venc_certificado) : '—'}</div>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </section>

              <section className="panel">
                <div className="panel-head"><h2>Tope del mes en curso</h2></div>
                <ul className="cert-list">
                  {data.topes.map((t) => {
                    const pct = t.tope > 0 ? Math.min(100, (t.facturado / t.tope) * 100) : 0
                    return (
                      <li key={t.centro_id}>
                        <div>{nameOf(t.centro_id)}</div>
                        <div className="num small">{Math.round(pct)}% usado</div>
                        <div className="mini-bar" role="img" aria-label={`${fmtMoney(t.facturado)} de ${fmtMoney(t.tope)}`}>
                          <span style={{ width: `${pct}%`, background: pct >= 90 ? 'var(--bad)' : undefined }} />
                        </div>
                        <div className="sub" style={{ gridColumn: '1 / -1' }}>{fmtMoney(t.facturado)} de {fmtMoney(t.tope)} · disponible {fmtMoney(t.disponible)}</div>
                      </li>
                    )
                  })}
                  {data.topes.length === 0 && <li className="muted">Ningún centro tiene CUIT activo.</li>}
                </ul>
              </section>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
