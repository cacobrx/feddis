import { useRef, useState } from 'react'
import { Plus, Pencil, Trash2, RotateCcw, FileKey2 } from 'lucide-react'
import { useSession } from '../context/Session'
import { api } from '../lib/api'
import { Alert, Button, Confirm, Empty, Field, Loading, Modal, PageHead, Switch, useAction, useApi, useForm } from '../components/ui'
import { CONDICION_IVA, diasHasta, fmtCuit, fmtDate, fmtMoney, MARCA } from '../lib/format'

const VACIO = {
  centro_id: '', cuit: '', razon_social: '', nombre_fantasia: '', domicilio: '', ciudad: '', condicion_iva: 'MONOTRIBUTO',
  ingresos_brutos: '', alicuota: '0', punto_venta: '', inicio_actividades: '', venc_certificado: '', tope_facturacion: '', modo_prueba: true, arca_simulado: true, importar_cuota_99: false,
}

// Minúsculas y sin acentos, para buscar sin importar cómo se escribió.
const norm = (t) => String(t ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

/** Coincide por razón social, nombre de fantasía, CUIT (con o sin guiones) o centro. */
function coincide(c, q) {
  const texto = norm(q).trim()
  if (!texto) return true
  const digitos = texto.replace(/\D/g, '')
  if (digitos && digitos === texto.replace(/[\s-]/g, '') && String(c.cuit).includes(digitos)) return true
  const campos = norm([c.razon_social, c.nombre_fantasia, c.centro_nombre, c.cuit, fmtCuit(c.cuit)].join(' '))
  return texto.split(/\s+/).every((p) => campos.includes(p))
}

export default function Cuit() {
  const { esStaff, refresh } = useSession()
  const { data, loading, error, reload } = useApi('/cuits')
  const [edit, setEdit] = useState(null)
  const [borrar, setBorrar] = useState(null)
  const [cert, setCert] = useState(null)
  const [q, setQ] = useState('')
  const [run] = useAction()
  const lista = (data ?? []).filter((c) => coincide(c, q))

  const done = () => { reload(); refresh() }

  return (
    <div className="page">
      <PageHead title="CUIT" actions={esStaff && <Button variant="primary" onClick={() => setEdit({ ...VACIO })}><Plus size={16} /> Agregar CUIT</Button>}>
        {esStaff ? 'Datos fiscales de cada centro. Cada centro tiene un CUIT activo.' : 'Datos fiscales de tus centros. Mantenelos al día: se usan en cada comprobante.'}
      </PageHead>
      {error && <Alert kind="bad">{error}</Alert>}
      {data?.length > 0 && (
        <div className="filters">
          <Field label="Buscar" className="wide" htmlFor="cuit-q">
            <input id="cuit-q" className="input" type="search" value={q} onChange={(e) => setQ(e.target.value)}
              placeholder={esStaff ? 'Razón social, nombre de fantasía, CUIT o centro' : 'Razón social, nombre de fantasía o CUIT'} />
          </Field>
          {q.trim() && <p className="muted small" style={{ alignSelf: 'end', paddingBottom: 10 }}>{lista.length} de {data.length}</p>}
        </div>
      )}
      <section className="panel">
        {loading && !data ? <Loading /> : !data?.length ? <Empty title="Todavía no hay CUIT cargados">{esStaff ? 'Agregá el primero para poder facturar.' : 'Pedí a un usuario staff que cargue el CUIT de tu centro.'}</Empty> : !lista.length ? <Empty title="Ningún CUIT coincide con la búsqueda">Probá con otra parte del nombre, del CUIT o del centro.</Empty> : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  {esStaff && <th>Centro</th>}
                  <th>Razón social</th><th>CUIT</th><th>Condición IVA</th><th className="num">Pto. venta</th>
                  <th className="num">Tope mensual</th><th>Certificado</th><th>Autorización ARCA</th>
                  {esStaff && <th>Cuota 99</th>}
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {lista.map((c) => {
                  const dias = diasHasta(c.venc_certificado)
                  return (
                    <tr key={c.id} className={c.activo ? '' : 'is-disabled'}>
                      {esStaff && <td>{c.centro_nombre}<div className="small muted">{MARCA[c.centro_marca]}</div></td>}
                      <td>{c.razon_social}<div className="small muted">{c.nombre_fantasia}</div></td>
                      <td className="nowrap">{fmtCuit(c.cuit)}</td>
                      <td>{CONDICION_IVA[c.condicion_iva]}{c.condicion_iva === 'RI' && <div className="small muted">IVA {c.alicuota}%</div>}</td>
                      <td className="num">{c.punto_venta}</td>
                      <td className="num">{fmtMoney(c.tope_facturacion)}</td>
                      <td className="nowrap">{fmtDate(c.venc_certificado)}{!c.certificado && <div className="small muted">Sin archivos</div>}{dias !== null && dias <= 30 && <div className="small" style={{ color: dias < 0 ? 'var(--bad)' : 'var(--warn)' }}>{dias < 0 ? 'Vencido' : `Vence en ${dias} d`}</div>}</td>
                      <td>{!c.activo ? <span className="badge">Inactivo</span> : (
                        <span style={{ display: 'inline-flex', gap: 4, flexWrap: 'wrap' }}>
                          {c.arca_simulado ? <span className="badge badge-warn">Simulada</span> : <span className="badge badge-ok">Real</span>}
                          {!c.arca_simulado && (c.modo_prueba ? <span className="badge">Homologación</span> : <span className="badge badge-accent">Producción</span>)}
                        </span>
                      )}</td>
                      {esStaff && <td>{c.importar_cuota_99 ? 'Importa' : <span className="muted">No</span>}</td>}
                      <td className="nowrap" style={{ textAlign: 'right' }}>
                        <button className="icon-btn" onClick={() => setEdit({ ...VACIO, ...c, alicuota: String(c.alicuota), tope_facturacion: String(c.tope_facturacion), inicio_actividades: c.inicio_actividades ?? '', venc_certificado: c.venc_certificado ?? '', ingresos_brutos: c.ingresos_brutos ?? '' })} aria-label="Editar" title="Editar"><Pencil size={16} /></button>
                        <button className="icon-btn" onClick={() => setCert(c)} aria-label="Certificado ARCA" title="Certificado ARCA (.crt y .key)"><FileKey2 size={16} /></button>
                        {esStaff && (c.activo
                          ? <button className="icon-btn" onClick={() => setBorrar(c)} aria-label="Dar de baja" title="Dar de baja"><Trash2 size={16} /></button>
                          : <button className="icon-btn" onClick={async () => { if (await run(() => api.post(`/cuits/${c.id}/reactivar`), 'CUIT reactivado.')) done() }} aria-label="Reactivar" title="Reactivar"><RotateCcw size={16} /></button>)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {edit && <CuitForm inicial={edit} existentes={data ?? []} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); done() }} />}
      {cert && <CertificadoModal cuit={cert} otros={(data ?? []).filter((o) => o.cuit === cert.cuit && o.id !== cert.id)} onClose={() => setCert(null)} onSaved={() => { setCert(null); done() }} />}
      {borrar && (
        <Confirm title="Dar de baja el CUIT" danger confirmLabel="Dar de baja" onClose={() => setBorrar(null)}
          onConfirm={async () => { if (await run(() => api.del(`/cuits/${borrar.id}`), (r) => r.desactivado ? 'El CUIT tiene comprobantes: quedó inactivo.' : 'CUIT eliminado.')) done() }}
          message={`${borrar.razon_social} (${fmtCuit(borrar.cuit)}). Si tiene comprobantes emitidos se desactiva en lugar de borrarse, para conservar la trazabilidad.`} />
      )}
    </div>
  )
}

// Campos fiscales que se copian de un CUIT ya cargado (el centro y la cuota 99 son propios de cada alta).
const CAMPOS_COPIABLES = ['razon_social', 'nombre_fantasia', 'domicilio', 'ciudad', 'condicion_iva', 'ingresos_brutos', 'alicuota', 'punto_venta',
  'inicio_actividades', 'venc_certificado', 'tope_facturacion', 'modo_prueba', 'arca_simulado']

function CuitForm({ inicial, existentes, onClose, onSaved }) {
  const { esStaff, centros } = useSession()
  const { values: v, set, setValues, errors, fail } = useForm(inicial)
  const [run, busy] = useAction()
  const nuevo = !inicial.id
  const [copiado, setCopiado] = useState(null)
  const ultimoBuscado = useRef('')

  // Al dar de alta, si el CUIT ingresado ya existe en otro centro, se cargan sus datos (una vez por número).
  const cambiarCuit = (e) => {
    set('cuit')(e)
    if (!nuevo) return
    const digitos = e.target.value.replace(/\D/g, '')
    if (digitos.length !== 11) { ultimoBuscado.current = ''; setCopiado(null); return }
    if (digitos === ultimoBuscado.current) return
    ultimoBuscado.current = digitos
    const previo = existentes.filter((c) => c.cuit === digitos).sort((a, b) => (b.activo - a.activo) || (b.id - a.id))[0]
    if (!previo) { setCopiado(null); return }
    const datos = {}
    for (const k of CAMPOS_COPIABLES) datos[k] = previo[k] ?? ''
    datos.alicuota = String(previo.alicuota)
    datos.tope_facturacion = String(previo.tope_facturacion)
    datos.punto_venta = String(previo.punto_venta)
    setValues((s) => ({ ...s, ...datos }))
    setCopiado(previo)
  }

  const save = async (e) => {
    e.preventDefault()
    const payload = { ...v, cuit: String(v.cuit).replace(/\D/g, '') }
    const ok = await run(() => (nuevo ? api.post('/cuits', payload) : api.put(`/cuits/${v.id}`, payload)),
      (r) => (nuevo ? (r?.certificado_copiado ? 'CUIT agregado, con el certificado ARCA que ya tenía cargado.' : 'CUIT agregado.') : 'Cambios guardados.'), fail)
    if (ok) onSaved()
  }

  const f = (k, label, props = {}) => (
    <Field label={label} error={errors[k]} htmlFor={`cu-${k}`} className={props.span ? 'span-2' : ''}>
      <input id={`cu-${k}`} className="input" value={v[k] ?? ''} onChange={set(k)} aria-invalid={!!errors[k]} {...props} span={undefined} />
    </Field>
  )

  return (
    <Modal wide title={nuevo ? 'Agregar CUIT' : `Editar ${inicial.razon_social}`} onClose={onClose} footer={<>
      <Button onClick={onClose}>Cancelar</Button>
      <Button variant="primary" type="submit" form="cuit-form" loading={busy}>{nuevo ? 'Agregar CUIT' : 'Guardar cambios'}</Button>
    </>}>
      <form id="cuit-form" onSubmit={save} className="grid-form">
        {esStaff && (
          <Field label="Centro" error={errors.centro_id} htmlFor="cu-centro">
            <select id="cu-centro" className="select" value={v.centro_id} onChange={set('centro_id')} required>
              <option value="">Elegí un centro</option>
              {centros.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </Field>
        )}
        {nuevo && f('cuit', 'CUIT', { required: true, inputMode: 'numeric', placeholder: '30-12345678-9', onChange: cambiarCuit, autoFocus: !esStaff })}
        {copiado && (
          <div className="span-2">
            <Alert kind="info">Este CUIT ya está cargado{copiado.centro_nombre ? ` en ${copiado.centro_nombre}` : ''}{copiado.activo ? '' : ' (inactivo)'}: se completaron sus datos. Revisalos antes de guardar, en especial el punto de venta.</Alert>
          </div>
        )}
        {f('razon_social', 'Razón social', { required: true, span: true })}
        {f('nombre_fantasia', 'Nombre fantasía')}
        {!nuevo && f('cuit', 'CUIT', { required: true, inputMode: 'numeric', placeholder: '30-12345678-9' })}
        {f('domicilio', 'Domicilio')}
        {f('ciudad', 'Ciudad')}
        <Field label="Condición IVA" error={errors.condicion_iva} htmlFor="cu-iva">
          <select id="cu-iva" className="select" value={v.condicion_iva} onChange={set('condicion_iva')}>
            <option value="RI">Responsable Inscripto</option>
            <option value="MONOTRIBUTO">Monotributo</option>
            <option value="EXENTO">Exento</option>
          </select>
        </Field>
        <Field label="Alícuota IVA (%)" error={errors.alicuota} hint={v.condicion_iva === 'RI' ? 'Se aplica a toda la factura.' : 'Solo para Responsable Inscripto.'} htmlFor="cu-alicuota">
          <input id="cu-alicuota" className="input" type="number" step="0.01" min="0" max="100" value={v.alicuota} onChange={set('alicuota')} disabled={v.condicion_iva !== 'RI'} />
        </Field>
        {f('ingresos_brutos', 'Ingresos Brutos (n.º)', { placeholder: 'Se imprime en el comprobante' })}
        {f('punto_venta', 'Punto de venta', { type: 'number', min: 1, required: true })}
        {f('inicio_actividades', 'Inicio de actividades', { type: 'date' })}
        {inicial.certificado
          ? <Field label="Vencimiento del certificado ARCA" hint="Se toma del certificado cargado." htmlFor="cu-venc_certificado">
              <input id="cu-venc_certificado" className="input" type="date" value={v.venc_certificado ?? ''} disabled />
            </Field>
          : f('venc_certificado', 'Vencimiento del certificado ARCA', { type: 'date' })}
        <Field label="Tope de facturación mensual ($)" error={errors.tope_facturacion} htmlFor="cu-tope">
          <input id="cu-tope" className="input" type="number" step="0.01" min="0" value={v.tope_facturacion} onChange={set('tope_facturacion')} required />
        </Field>
        <div className="span-2" style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 4 }}>
          <fieldset style={{ border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)', padding: '10px 14px 12px', margin: 0 }}>
            <legend className="small" style={{ fontWeight: 500, color: 'var(--ink-2)', padding: '0 4px' }}>Autorización en ARCA</legend>
            <div style={{ display: 'grid', gap: 8 }} role="radiogroup">
              <label className="check"><input type="radio" name="arca-modo" checked={!!v.arca_simulado} onChange={() => set('arca_simulado')(true)} />
                <span><strong style={{ fontWeight: 600 }}>Simulada</strong> <span className="muted small">— no contacta ARCA: inventa número de comprobante, CAE y vencimiento del CAE. Sin validez fiscal.</span></span></label>
              <label className="check"><input type="radio" name="arca-modo" checked={!v.arca_simulado} onChange={() => set('arca_simulado')(false)} />
                <span><strong style={{ fontWeight: 600 }}>Real</strong> <span className="muted small">— envía el comprobante a la API de ARCA.</span></span></label>
            </div>
            {!v.arca_simulado && (
              <div style={{ marginTop: 10, paddingLeft: 24 }}>
                <Switch checked={v.modo_prueba} onChange={set('modo_prueba')} label="Homologación: autorizar en el entorno de prueba de ARCA, sin validez fiscal" />
              </div>
            )}
          </fieldset>
          {esStaff && <Switch checked={v.importar_cuota_99} onChange={set('importar_cuota_99')} label="Importar cuota 99 (derecho de examen) en Pagos" />}
        </div>
      </form>
    </Modal>
  )
}

const leerBase64 = (file) => new Promise((resolve, reject) => {
  const r = new FileReader()
  r.onload = () => resolve(String(r.result).split(',')[1] ?? '')
  r.onerror = () => reject(new Error(`No se pudo leer ${file.name}.`))
  r.readAsDataURL(file)
})

function CertificadoModal({ cuit, otros, onClose, onSaved }) {
  const [crt, setCrt] = useState(null)
  const [key, setKey] = useState(null)
  const [claveKey, setClaveKey] = useState('')
  const [errors, setErrors] = useState({})
  const [quitar, setQuitar] = useState(false)
  const [run, busy] = useAction()
  const actual = cuit.certificado
  const enOtros = otros.length ? ` y en ${otros.length === 1 ? 'otro registro' : `otros ${otros.length} registros`} con el mismo CUIT (${otros.map((o) => o.centro_nombre || o.razon_social).join(', ')})` : ''

  const subir = async (e) => {
    e.preventDefault()
    const errs = {}
    if (!crt) errs.crt = 'Elegí el archivo .crt.'
    if (!key) errs.key = 'Elegí el archivo .key.'
    setErrors(errs)
    if (Object.keys(errs).length) return
    const r = await run(async () => api.post(`/cuits/${cuit.id}/certificado`, {
      crt: await leerBase64(crt), key: await leerBase64(key), clave_key: claveKey || undefined,
    }), (r) => {
      const donde = r.registros > 1 ? ` en ${r.registros} registros con el mismo CUIT` : ''
      return r.avisos?.length ? `Certificado cargado${donde}. ${r.avisos.join(' ')}` : `Certificado cargado${donde}: vence el ${fmtDate(r.hasta)}.`
    },
    (err) => { if (err?.data?.campo) setErrors({ [err.data.campo]: err.message }) })
    if (r) onSaved()
  }

  const archivo = (k, label, accept, file, setFile) => (
    <Field label={label} error={errors[k]} hint={file ? file.name : undefined} htmlFor={`ce-${k}`}>
      <input id={`ce-${k}`} className="input" type="file" accept={accept}
        onChange={(e) => { setFile(e.target.files?.[0] ?? null); setErrors((s) => ({ ...s, [k]: undefined })) }} />
    </Field>
  )

  return (
    <Modal title={`Certificado ARCA · ${cuit.razon_social}`} onClose={onClose} footer={<>
      {actual && <Button variant="danger" onClick={() => setQuitar(true)} style={{ marginRight: 'auto' }}>Quitar certificado</Button>}
      <Button onClick={onClose}>Cancelar</Button>
      <Button variant="primary" type="submit" form="cert-form" loading={busy}>{actual ? 'Reemplazar' : 'Subir certificado'}</Button>
    </>}>
      <form id="cert-form" onSubmit={subir} style={{ display: 'grid', gap: 14 }}>
        {actual ? (
          <Alert kind="info">
            Cargado el {fmtDate(actual.subido_at?.slice(0, 10))}{actual.titular ? ` · ${actual.titular}` : ''}. Válido del {fmtDate(actual.desde)} al {fmtDate(actual.hasta)}.
            Subí archivos nuevos para reemplazarlo.
          </Alert>
        ) : (
          <p className="small muted" style={{ margin: 0 }}>
            CUIT {fmtCuit(cuit.cuit)}. Subí el certificado que descargaste de ARCA y la clave privada con la que generaste el pedido (CSR).
            El vencimiento se completa solo a partir del certificado.
          </p>
        )}
        {archivo('crt', 'Certificado (.crt)', '.crt,.pem,.cer', crt, setCrt)}
        {archivo('key', 'Clave privada (.key)', '.key,.pem', key, setKey)}
        <Field label="Contraseña de la clave privada" hint="Solo si la clave está protegida con contraseña." htmlFor="ce-clave">
          <input id="ce-clave" className="input" type="password" autoComplete="off" value={claveKey} onChange={(e) => setClaveKey(e.target.value)} />
        </Field>
        <p className="small muted" style={{ margin: 0 }}>
          Se guarda en este centro{enOtros}. La clave privada queda cifrada y no se puede volver a descargar.
        </p>
      </form>
      {quitar && (
        <Confirm title="Quitar certificado" danger confirmLabel="Quitar" onClose={() => setQuitar(false)}
          onConfirm={async () => { if (await run(() => api.del(`/cuits/${cuit.id}/certificado`), (r) => r.registros > 1 ? `Certificado quitado de ${r.registros} registros.` : 'Certificado quitado.')) onSaved() }}
          message={`Se borran el .crt y la clave privada guardados en este centro${enOtros}. La fecha de vencimiento queda como estaba.`} />
      )}
    </Modal>
  )
}
