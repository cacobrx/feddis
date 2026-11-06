import { useState } from 'react'
import { Search } from 'lucide-react'
import { useSession } from '../context/Session'
import { api } from '../lib/api'
import { Alert, Button, Empty, Field, Loading, PageHead, Switch, useApi } from '../components/ui'
import { CONDICION_IVA, fmtCuit, fmtDate, fmtMoney, fmtNumero } from '../lib/format'

export default function ConsultaArca() {
  const { centro, centroId } = useSession()
  const meta = useApi('/arca/tipos', { centro_id: centroId })
  const [tipo, setTipo] = useState('')
  const [numero, setNumero] = useState('')
  const [real, setReal] = useState(false)
  const [res, setRes] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  const tipoActual = tipo || meta.data?.tipos[0]?.codigo || ''
  // Si el CUIT autoriza en forma simulada, se puede pedir igual la consulta en ARCA real.
  const forzarReal = !!meta.data?.arca_simulado && real

  const consultar = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      setRes(await api.get('/arca/consultar', { centro_id: centroId, tipo: tipoActual, numero, ...(forzarReal ? { real: 1 } : {}) }))
    } catch (err) {
      setError(err.message)
      setRes(null)
    } finally {
      setBusy(false)
    }
  }

  const c = res?.resultado?.comprobante

  return (
    <div className="page">
      <PageHead title="Consulta ARCA">
        Consultá directamente en ARCA los comprobantes emitidos por {centro?.nombre}. Sin número, se informa el último autorizado.
      </PageHead>

      {meta.error && <Alert kind="bad">{meta.error}</Alert>}
      {meta.loading && <Loading />}
      {meta.data && (
        <>
          <p className="muted" style={{ marginBottom: 12 }}>
            CUIT {fmtCuit(meta.data.cuit)} · {CONDICION_IVA[meta.data.condicion_iva]} · punto de venta {meta.data.punto_venta}
            {meta.data.arca_simulado && !forzarReal
              ? ' · autorización simulada: se consultan los comprobantes simulados de este sistema'
              : meta.data.modo_prueba ? ' · consulta en homologación' : ' · consulta en ARCA (producción)'}
          </p>
          {meta.data.arca_simulado && (
            <div style={{ marginBottom: 12 }}>
              <Switch checked={real} onChange={(x) => { setReal(x); setRes(null); setError(null) }}
                label="Consultar en ARCA real los comprobantes no simulados (con el CUIT, punto de venta y certificado de esta sede)" />
              {real && !meta.data.tiene_certificado && (
                <div style={{ marginTop: 8 }}><Alert kind="warn">El CUIT de esta sede no tiene el certificado ARCA cargado. Subilo en Utilidades → CUIT para poder consultar.</Alert></div>
              )}
            </div>
          )}
          <form className="filters" onSubmit={consultar}>
            <Field label="Tipo de comprobante" className="wide" htmlFor="a-tipo">
              <select id="a-tipo" className="select" value={tipoActual} onChange={(e) => setTipo(e.target.value)}>
                {meta.data.tipos.map((t) => <option key={t.codigo} value={t.codigo}>{t.nombre}</option>)}
              </select>
            </Field>
            <Field label="Número" htmlFor="a-num"><input id="a-num" className="input" type="number" min="1" value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="Último" /></Field>
            <Button variant="primary" type="submit" loading={busy}><Search size={15} /> Consultar en ARCA</Button>
          </form>
        </>
      )}

      {error && <Alert kind="bad">{error}</Alert>}
      {res && (
        <section className="panel">
          <div className="panel-head">
            <h2>{res.tipo_nombre}{res.arca_simulado ? <span className="badge badge-warn" style={{ marginLeft: 8 }}>Simulado</span> : <span className="badge" style={{ marginLeft: 8 }}>ARCA{res.modo_prueba ? ' · homologación' : ''}</span>}</h2>
            <span className="muted">Último número autorizado: <strong style={{ color: 'var(--ink)' }}>{res.ultimo_numero ? fmtNumero(res.punto_venta, res.ultimo_numero) : 'ninguno'}</strong></span>
          </div>
          {res.resultado === null ? (
            <Empty title="Ingresá un número para ver el detalle">El último comprobante autorizado de este tipo figura arriba.</Empty>
          ) : !res.resultado.encontrado ? (
            <Empty title={`ARCA no tiene el comprobante ${fmtNumero(res.punto_venta, Number(numero))}`}>Revisá el tipo y el número. Recordá que el punto de venta es el del CUIT de la sede activa.</Empty>
          ) : (
            <div className="panel-body grid-form">
              <dl className="kv">
                <dt>Número</dt><dd>{fmtNumero(c.punto_venta, c.numero)}</dd>
                <dt>Fecha</dt><dd>{fmtDate(c.fecha)}</dd>
                <dt>Resultado</dt><dd>{c.resultado === 'A' ? <span className="badge badge-ok">Aprobado</span> : c.resultado}</dd>
                <dt>CAE</dt><dd>{c.cae}</dd>
                <dt>Vence CAE</dt><dd>{fmtDate(c.cae_vencimiento)}</dd>
              </dl>
              <dl className="kv">
                <dt>Receptor</dt><dd>{c.receptor_doc_tipo === 80 ? `CUIT ${fmtCuit(c.receptor_doc_nro)}` : `Doc. ${c.receptor_doc_nro}`}</dd>
                {res.resultado.local && <><dt>Nombre</dt><dd>{res.resultado.local.receptor_nombre}</dd></>}
                <dt>Neto</dt><dd>{fmtMoney(c.importe_neto)}</dd>
                <dt>IVA</dt><dd>{fmtMoney(c.importe_iva)}</dd>
                <dt>Total</dt><dd><strong>{fmtMoney(c.importe_total)}</strong></dd>
              </dl>
              {!res.resultado.local && <div className="span-2"><Alert kind="warn">Este comprobante está en ARCA pero no fue emitido desde este sistema.</Alert></div>}
            </div>
          )}
        </section>
      )}
    </div>
  )
}
