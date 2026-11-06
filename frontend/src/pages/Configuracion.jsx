import { useEffect, useState } from 'react'
import { PlugZap } from 'lucide-react'
import { useSession } from '../context/Session'
import { api } from '../lib/api'
import { Alert, Button, Field, Loading, PageHead, Switch, useAction, useApi } from '../components/ui'
import { fmtDateTime } from '../lib/format'

const SECCIONES = [
  {
    titulo: 'Usuarios y centros de Eddis',
    descripcion: 'API de Eddis (api_fac_feddis.php) con la que se valida el ingreso y se buscan usuarios y centros de Eddis y Studio Beauty.',
    campos: [['url_api_eddis', 'URL de la API de usuarios'], ['token_api_eddis', 'Token de acceso', true]],
    probar: [['api_eddis', 'Probar conexión']],
  },
  {
    titulo: 'Validación de usuarios',
    descripcion: 'Se consulta al ingresar: primero Eddis y, si el documento no existe, Studio Beauty.',
    campos: [['url_validacion_eddis', 'URL de validación Eddis'], ['url_validacion_sb', 'URL de validación Studio Beauty']],
    probar: [['validacion_eddis', 'Probar Eddis'], ['validacion_sb', 'Probar Studio Beauty']],
  },
  {
    titulo: 'Pagos Eddis',
    descripcion: 'API de Eddis (api_pagos.php) de la que se traen los pagos de los alumnos.',
    campos: [['url_pagos_eddis', 'URL de la API de pagos'], ['token_pagos_eddis', 'Token de acceso (opcional)', true], ['pais_sistema', 'paissistema para Eddis', false, 'text'], ['pais_sistema_sb', 'paissistema para Studio Beauty', false, 'text']],
    probar: [['pagos', 'Probar conexión']],
  },
  {
    titulo: 'Facturación ARCA',
    descripcion: 'API que autoriza los comprobantes en ARCA (resuelve WSAA y WSFE). Se le agrega /autorizar.',
    campos: [['url_arca', 'URL base de la API de ARCA'], ['token_arca', 'Token de acceso', true]],
    probar: [['arca', 'Probar conexión']],
  },
  {
    titulo: 'Consulta de comprobantes ARCA',
    descripcion: 'API que consulta en ARCA los comprobantes emitidos y el último número autorizado (Utilidades → Consulta ARCA). Recibe por POST la acción, el CUIT, el punto de venta y el certificado de la sede.',
    campos: [['url_arca_consulta', 'URL de la API de consulta'], ['token_arca_consulta', 'Token de acceso (opcional)', true]],
    probar: [['arca_consulta', 'Probar conexión']],
  },
]

export default function Configuracion() {
  const { refresh } = useSession()
  const { data, loading, error, reload } = useApi('/configuracion')
  const [v, setV] = useState(null)
  const [errors, setErrors] = useState({})
  const [pruebas, setPruebas] = useState({})
  const [run, busy] = useAction()

  useEffect(() => {
    if (!data) return
    const base = {}
    for (const [k, val] of Object.entries(data.valores)) base[k] = typeof val === 'object' ? '' : val
    setV(base)
  }, [data])

  const set = (k) => (e) => { setV((s) => ({ ...s, [k]: e.target.value })); setErrors((s) => ({ ...s, [k]: undefined })) }

  const save = async (e) => {
    e.preventDefault()
    const r = await run(() => api.put('/configuracion', v), (r) => (r.cambios ? `Se guardaron ${r.cambios} cambios.` : 'No había cambios para guardar.'),
      (err) => err.data?.campo && setErrors({ [err.data.campo]: err.message }))
    if (r) { reload(); refresh() }
  }

  const probar = async (servicio) => {
    setPruebas((p) => ({ ...p, [servicio]: { cargando: true } }))
    try {
      const r = await api.post('/configuracion/probar', { servicio })
      setPruebas((p) => ({ ...p, [servicio]: r }))
    } catch (err) {
      setPruebas((p) => ({ ...p, [servicio]: { ok: false, mensaje: err.message } }))
    }
  }

  if (loading && !v) return <div className="page"><Loading /></div>
  if (error) return <div className="page"><Alert kind="bad">{error}</Alert></div>
  if (!v) return null

  return (
    <div className="page">
      <PageHead title="Configuración" actions={<Button variant="primary" type="submit" form="conf-form" loading={busy}>Guardar configuración</Button>}>
        Direcciones y credenciales de las APIs externas. Los tokens se guardan cifrados y no se vuelven a mostrar.
        {data.ultimo_cambio?.usuario && ` Último cambio: ${data.ultimo_cambio.usuario}, ${fmtDateTime(data.ultimo_cambio.updated_at)}.`}
      </PageHead>

      <form id="conf-form" onSubmit={save} style={{ display: 'grid', gap: 16, maxWidth: 900 }}>
        <section className="panel">
          <div className="panel-body" style={{ display: 'grid', gap: 10 }}>
            <Switch checked={v.modo_simulacion === '1'} onChange={(x) => setV((s) => ({ ...s, modo_simulacion: x ? '1' : '0' }))}
              label="Modo simulación: responder con datos de prueba sin contactar servicios externos" />
            {v.modo_simulacion === '1' && <Alert kind="warn">La simulación solo reemplaza a los servicios que no tienen URL cargada: los que tienen URL usan siempre el servicio real.</Alert>}
          </div>
        </section>

        {SECCIONES.map((s) => (
          <section className="panel" key={s.titulo}>
            <div className="panel-head">
              <div><h2>{s.titulo}</h2><p className="small muted">{s.descripcion}</p></div>
              <div className="toolbar">
                {s.probar.map(([srv, label]) => (
                  <Button key={srv} type="button" size="sm" loading={pruebas[srv]?.cargando} onClick={() => probar(srv)}><PlugZap size={14} /> {label}</Button>
                ))}
              </div>
            </div>
            <div className="panel-body" style={{ display: 'grid', gap: 14 }}>
              {s.campos.map(([k, label, secreto, tipo]) => (
                <Field key={k} label={label} error={errors[k]} htmlFor={`cf-${k}`}
                  hint={secreto ? (data.valores[k]?.configurado ? 'Hay un token guardado. Dejalo vacío para conservarlo.' : 'Sin token guardado.') : undefined}>
                  <input id={`cf-${k}`} className="input" type={secreto ? 'password' : tipo === 'text' ? 'text' : 'url'} autoComplete="off" value={v[k] ?? ''} onChange={set(k)}
                    style={tipo === 'text' ? { maxWidth: 120 } : undefined}
                    placeholder={secreto ? (data.valores[k]?.configurado ? '••••••••••••' : '') : tipo === 'text' ? 'ar' : 'https://'} />
                </Field>
              ))}
              {s.probar.map(([srv]) => pruebas[srv] && !pruebas[srv].cargando && (
                <Alert key={srv} kind={pruebas[srv].ok ? 'info' : 'bad'}>{pruebas[srv].mensaje}</Alert>
              ))}
            </div>
          </section>
        ))}

        <section className="panel">
          <div className="panel-head"><h2>Parámetros generales</h2></div>
          <div className="panel-body grid-form">
            <Field label="Tiempo de espera de las APIs (segundos)" error={errors.timeout_segundos} htmlFor="cf-t">
              <input id="cf-t" className="input" type="number" min="1" value={v.timeout_segundos} onChange={set('timeout_segundos')} />
            </Field>
            <Field label="Avisar vencimiento del certificado con (días)" error={errors.dias_alerta_certificado} htmlFor="cf-d">
              <input id="cf-d" className="input" type="number" min="1" value={v.dias_alerta_certificado} onChange={set('dias_alerta_certificado')} />
            </Field>
          </div>
        </section>
      </form>
    </div>
  )
}
