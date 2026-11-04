import { useState } from 'react'
import { Plus, Pencil, Search, RefreshCw } from 'lucide-react'
import { useSession } from '../context/Session'
import { api } from '../lib/api'
import { Alert, Button, Empty, Field, Loading, Modal, PageHead, Switch, useAction, useApi, useForm } from '../components/ui'
import { fmtDateTime, MARCA } from '../lib/format'
import MultiCombo from '../components/MultiCombo'

export default function Usuarios() {
  // refresh: al crear o editar un usuario pueden crearse centros nuevos, que tienen que aparecer en el combo de sedes.
  const { centros, refresh } = useSession()
  const { data, loading, error, reload } = useApi('/usuarios')
  const [edit, setEdit] = useState(null)
  const nombreCentro = (id) => centros.find((c) => c.id === id)?.nombre ?? `#${id}`

  return (
    <div className="page">
      <PageHead title="Usuarios" actions={<Button variant="primary" onClick={() => setEdit({ nuevo: true, es_staff: false, activo: true, centros: [] })}><Plus size={16} /> Habilitar usuario</Button>}>
        Personas habilitadas para facturar y los centros en los que pueden hacerlo. Se dan de alta buscando su documento en Eddis o, si no está ahí, en Studio Beauty.
      </PageHead>
      {error && <Alert kind="bad">{error}</Alert>}
      <section className="panel">
        {loading && !data ? <Loading /> : !data?.length ? <Empty title="No hay usuarios habilitados" /> : (
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>Usuario</th><th>Email</th><th>Rol</th><th>Centros</th><th>Último ingreso</th><th>Estado</th><th></th></tr></thead>
              <tbody>
                {data.map((u) => (
                  <tr key={u.id} className={u.activo ? '' : 'is-disabled'}>
                    <td>{u.apellido}, {u.nombre}<div className="small muted">DNI {u.documento}{u.eddis_user_id ? ` · ${MARCA[u.origen_usuario] ?? 'Eddis'} #${u.eddis_user_id}` : ''}</div></td>
                    <td className="small">{u.email ?? <span className="muted">—</span>}</td>
                    <td>{u.es_staff ? <span className="badge badge-accent">Staff</span> : 'Facturación'}</td>
                    <td className="small">{u.es_staff ? <span className="muted">Todos los centros</span> : u.centros.map(nombreCentro).join(', ') || <span className="muted">Sin centros</span>}</td>
                    <td className="small nowrap">{u.ultimo_login ? fmtDateTime(u.ultimo_login) : <span className="muted">Nunca</span>}</td>
                    <td>{u.activo ? <span className="badge badge-ok">Activo</span> : <span className="badge">Baja</span>}</td>
                    <td style={{ textAlign: 'right' }}><button className="icon-btn" onClick={() => setEdit(u)} aria-label="Editar" title="Editar"><Pencil size={16} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {edit && <UsuarioForm inicial={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload(); refresh() }} />}
    </div>
  )
}

function BuscarEnEddis({ elegido, onElegir }) {
  const [documento, setDocumento] = useState('')
  const [res, setRes] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  const buscar = async () => {
    setBusy(true)
    setError(null)
    setRes(null)
    onElegir(null)
    try {
      const r = await api.get('/usuarios/buscar', { documento })
      setRes(r)
      if (r.resultados.length === 1 && !r.ya_habilitado) onElegir(r.resultados[0])
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
        <Field label="Documento" htmlFor="u-doc" className="" >
          <input id="u-doc" className="input" inputMode="numeric" value={documento} style={{ width: 200 }}
            onChange={(e) => setDocumento(e.target.value.replace(/\D/g, ''))}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (documento.length >= 6) buscar() } }} />
        </Field>
        <Button type="button" onClick={buscar} loading={busy} disabled={documento.length < 6}><Search size={15} /> Buscar</Button>
      </div>
      {error && <Alert kind="bad">{error}</Alert>}
      {res && res.ya_habilitado && <Alert kind="warn">El DNI {res.documento} ya está habilitado ({res.ya_habilitado.nombre}). Editalo desde el listado.</Alert>}
      {res && !res.ya_habilitado && res.resultados.length === 0 && <Alert kind="warn">No hay ningún usuario de Eddis ni de Studio Beauty con el documento {res.documento}.</Alert>}
      {res && !res.ya_habilitado && res.resultados.length > 0 && (
        <div role="radiogroup" aria-label="Usuario de Eddis" style={{ display: 'grid', gap: 6 }}>
          {res.origen === 'SB' && <Alert kind="info">El documento no está en Eddis: los datos se toman de Studio Beauty.</Alert>}
          {res.resultados.length > 1 && <span className="small muted">Hay {res.resultados.length} usuarios de {MARCA[res.origen]} con ese documento. Elegí cuál habilitar.</span>}
          {res.resultados.map((r) => (
            <label key={r.eddis_user_id} className="check" style={{ padding: '10px 12px', border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)', background: elegido?.eddis_user_id === r.eddis_user_id ? 'var(--accent-soft)' : undefined }}>
              <input type="radio" name="eddis-user" checked={elegido?.eddis_user_id === r.eddis_user_id} onChange={() => onElegir(r)} />
              <span style={{ flex: 1 }}>
                <strong style={{ fontWeight: 600 }}>{r.apellido}, {r.nombre}</strong>
                <span className="small muted" style={{ display: 'block' }}>
                  DNI {r.documento} · {r.email || 'sin email'} · {MARCA[r.origen]} #{r.eddis_user_id} · {r.centros_origen.length ? r.centros_origen.map((c) => `${c.nombre}${c.marca === 'SB' && r.origen === 'EDDIS' ? ' (SB)' : ''}`).join(', ') : 'sin centros'}
                </span>
              </span>
              <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <span className={`badge ${r.origen === 'SB' ? 'badge-accent' : ''}`}>{MARCA[r.origen]}</span>
                {r.autorizado_facturar ? <span className="badge badge-ok">Factura en {MARCA[r.origen]}</span> : <span className="badge badge-warn">Sin permiso de facturación</span>}
                {!r.tiene_claveint && <span className="badge">Sin clave interna</span>}
              </span>
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

function UsuarioForm({ inicial, onClose, onSaved }) {
  const { centros, usuario: yo } = useSession()
  const { values: v, setValues, errors, fail } = useForm(inicial)
  const [elegido, setElegido] = useState(null)
  const [run, busy] = useAction()

  // Usuarios vinculados a Eddis: los centros elegibles son los autorizados en Eddis (centro + otroscentros).
  const vinculado = inicial.nuevo || !!inicial.eddis_user_id
  const remotos = useApi(`/usuarios/${inicial.id}/centros-origen`, null, { skip: inicial.nuevo || !inicial.eddis_user_id })
  const centrosEddis = inicial.nuevo ? (elegido?.centros_origen ?? []) : (remotos.data?.centros_origen ?? [])
  const origen = inicial.nuevo ? elegido?.origen : inicial.origen_usuario
  const [selEddis, setSelEddis] = useState(null)
  // Sin centros autorizados en su base (por ejemplo, es staff en Eddis): se elige entre todos los centros activos.
  const listo = inicial.nuevo ? !!elegido : !!remotos.data
  const sinAutorizados = vinculado && listo && centrosEddis.length === 0 && remotos.data?.encontrado !== false
  const disponibles = useApi('/usuarios/centros-disponibles', null, { skip: !sinAutorizados })
  const opciones = sinAutorizados ? [...(disponibles.data?.EDDIS ?? []), ...(disponibles.data?.SB ?? [])] : centrosEddis
  // En edición, se marcan los centros que el usuario ya tiene asignados.
  const marcadosEddis = selEddis ?? opciones.filter((c) => c.centro_id && v.centros.includes(c.centro_id)).map((c) => c.clave)
  const vinculadosLocal = new Set(opciones.map((c) => c.centro_id).filter(Boolean))
  const cambiarMarca = (marca, valores) => setSelEddis([...marcadosEddis.filter((k) => !k.startsWith(marca + ':')), ...valores])
  // Centros asignados que no vienen de la autorización de Eddis (por ejemplo, Studio Beauty).
  const otrosAsignados = v.centros.filter((id) => !vinculadosLocal.has(id))

  const elegir = (r) => { setElegido(r); setSelEddis([]) }
  const toggleEddis = (id) => setSelEddis(marcadosEddis.includes(id) ? marcadosEddis.filter((x) => x !== id) : [...marcadosEddis, id])
  const toggleCentro = (id) => setValues((s) => ({ ...s, centros: s.centros.includes(id) ? s.centros.filter((x) => x !== id) : [...s.centros, id] }))
  const save = async (e) => {
    e.preventDefault()
    const centros = vinculado ? otrosAsignados : v.centros
    const ok = inicial.nuevo
      ? await run(() => api.post('/usuarios', { origen: elegido.origen, eddis_user_id: elegido.eddis_user_id, es_staff: v.es_staff, centros_origen: marcadosEddis, centros: [] }), 'Usuario habilitado.', fail)
      : await run(() => api.put(`/usuarios/${inicial.id}`, { es_staff: v.es_staff, activo: v.activo, centros_origen: vinculado ? marcadosEddis : [], centros }), 'Cambios guardados.', fail)
    if (ok) onSaved()
  }
  const sincronizar = async () => {
    const r = await run(() => api.post(`/usuarios/${inicial.id}/sincronizar`), (r) => (r.sin_cambios ? 'Los datos ya coincidían con Eddis.' : 'Datos actualizados desde Eddis.'))
    if (r) onSaved()
  }
  const esYo = inicial.id === yo.id

  return (
    <Modal title={inicial.nuevo ? 'Habilitar usuario' : `${inicial.nombre} ${inicial.apellido}`} onClose={onClose} footer={<>
      {!inicial.nuevo && inicial.eddis_user_id && <Button type="button" variant="ghost" onClick={sincronizar} style={{ marginRight: 'auto' }}><RefreshCw size={15} /> Actualizar desde {MARCA[inicial.origen_usuario] ?? 'Eddis'}</Button>}
      <Button onClick={onClose}>Cancelar</Button>
      <Button variant="primary" type="submit" form="u-form" loading={busy} disabled={inicial.nuevo && !elegido}>{inicial.nuevo ? 'Habilitar usuario' : 'Guardar cambios'}</Button>
    </>}>
      <form id="u-form" onSubmit={save} style={{ display: 'grid', gap: 18 }}>
        {inicial.nuevo
          ? <BuscarEnEddis elegido={elegido} onElegir={elegir} />
          : <p className="small muted">DNI {inicial.documento} · {inicial.email || 'sin email'}{inicial.eddis_user_id ? ` · vinculado a ${MARCA[inicial.origen_usuario] ?? 'Eddis'} #${inicial.eddis_user_id}` : ''}</p>}

        {(!inicial.nuevo || elegido) && (
          <>
            <div style={{ display: 'grid', gap: 10 }}>
              <Switch checked={v.es_staff} disabled={esYo} onChange={(x) => setValues((s) => ({ ...s, es_staff: x }))} label="Staff: administra CUIT, usuarios y configuración en todos los centros" />
              {!inicial.nuevo && <Switch checked={v.activo} disabled={esYo} onChange={(x) => setValues((s) => ({ ...s, activo: x }))} label="Usuario activo" />}
              {esYo && <span className="small muted">No podés cambiar tu propio rol ni darte de baja.</span>}
            </div>
            <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
              <legend className="small" style={{ fontWeight: 500, color: 'var(--ink-2)', marginBottom: 8 }}>
                {vinculado && !sinAutorizados ? (origen === 'SB' ? 'Centros autorizados en Studio Beauty' : 'Centros autorizados en Eddis y Studio Beauty') : 'Centros en los que factura'} {v.es_staff && <span className="muted">(staff accede a todos)</span>}
              </legend>
              {errors.centros && <div className="small" style={{ color: 'var(--bad)', marginBottom: 6 }}>{errors.centros}</div>}
              {vinculado ? (
                <>
                  {remotos.loading && <Loading label="Consultando centros autorizados…" />}
                  {remotos.data?.encontrado === false && <Alert kind="warn">El usuario ya no figura en {MARCA[remotos.data?.origen] ?? 'Eddis'}: no se pueden elegir centros nuevos.</Alert>}
                  {sinAutorizados && (
                    <div style={{ display: 'grid', gap: 12 }}>
                      <Alert kind="info">No tiene centros asignados en {origen === 'SB' ? 'Studio Beauty' : 'Eddis ni en Studio Beauty'} (por ejemplo, porque allí es staff). Elegí los centros activos en los que va a facturar acá.</Alert>
                      {disponibles.loading && <Loading label="Cargando centros activos…" />}
                      {disponibles.error && <Alert kind="bad">{disponibles.error}</Alert>}
                      {disponibles.data && (
                        <div className="mc-par">
                          {['EDDIS', 'SB'].map((m) => (
                            <MultiCombo key={m} label={`Centros ${MARCA[m]}`}
                              opciones={(disponibles.data[m] ?? []).map((c) => ({ value: c.clave, label: c.nombre, hint: c.centro_id ? 'ya en el sistema' : null }))}
                              valores={marcadosEddis.filter((k) => k.startsWith(m + ':'))}
                              onChange={(vals) => cambiarMarca(m, vals)}
                              placeholder={`Buscar centro de ${MARCA[m]}…`} vacio="Ningún centro coincide con lo que escribiste." />
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  {!sinAutorizados && ['EDDIS', 'SB'].map((m) => {
                    const lista = centrosEddis.filter((c) => c.marca === m)
                    if (!lista.length) return null
                    return (
                      <div key={m} style={{ marginBottom: 12 }}>
                        <div className="small" style={{ fontWeight: 600, marginBottom: 6 }}>{MARCA[m]}</div>
                        <div className="grid-form" style={{ gap: 8 }}>
                          {lista.map((c) => (
                            <label key={c.clave} className="check" title={c.activo ? `Centro ${c.codigo} de ${MARCA[c.marca]}` : `Centro inactivo en ${MARCA[c.marca]}`} style={c.activo || c.centro_id ? undefined : { opacity: 0.55, cursor: 'not-allowed' }}>
                              <input type="checkbox" checked={marcadosEddis.includes(c.clave)} disabled={!c.activo && !c.centro_id} onChange={() => toggleEddis(c.clave)} />
                              {c.nombre}
                              {c.principal && <span className="badge badge-accent">Principal</span>}
                              {!c.activo && <span className="muted small">inactivo</span>}
                            </label>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                  {otrosAsignados.length > 0 && (
                    <div style={{ marginTop: 12 }}>
                      <div className="small muted" style={{ marginBottom: 6 }}>Otros centros asignados (no figuran en su autorización)</div>
                      <div className="grid-form" style={{ gap: 8 }}>
                        {otrosAsignados.map((id) => {
                          const c = centros.find((x) => x.id === id)
                          return <label key={id} className="check"><input type="checkbox" checked onChange={() => toggleCentro(id)} />{c?.nombre ?? `Centro #${id}`}</label>
                        })}
                      </div>
                    </div>
                  )}
                  {inicial.nuevo && opciones.some((c) => !c.centro_id && c.activo) && (
                    <p className="small muted" style={{ marginTop: 10 }}>Los centros que todavía no existen en este sistema se crean al habilitar el usuario. Después completá su CUIT.</p>
                  )}
                </>
              ) : (
                <div className="grid-form" style={{ gap: 8 }}>
                  {centros.map((c) => (
                    <label key={c.id} className="check"><input type="checkbox" checked={v.centros.includes(c.id)} onChange={() => toggleCentro(c.id)} />{c.nombre} <span className="muted small">{MARCA[c.marca]}</span></label>
                  ))}
                </div>
              )}
            </fieldset>
          </>
        )}
      </form>
    </Modal>
  )
}
