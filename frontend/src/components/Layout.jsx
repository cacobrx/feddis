import { useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  Menu, ExternalLink, Sun, Moon, Monitor, ShieldCheck, LogOut, Settings, UserCog, ChevronDown,
  LayoutDashboard, Wallet, FileText, Building2, Search, Users2, ScrollText, Users, SlidersHorizontal, MapPin,
} from 'lucide-react'
import { useSession } from '../context/Session'
import { diasHasta, fmtDate, MARCA } from '../lib/format'
import Logo from './Logo'

const LS_MENU = 'eddisfac.menu'

function CertChip() {
  const { centro, session } = useSession()
  if (!centro) return null
  const dias = diasHasta(centro.venc_certificado)
  const alerta = session?.dias_alerta_certificado ?? 30
  let cls = ''
  let text
  if (dias === null) { cls = 'is-warn'; text = 'Certificado sin fecha' }
  else if (dias < 0) { cls = 'is-bad'; text = `Certificado vencido hace ${-dias} d` }
  else if (dias <= alerta) { cls = 'is-warn'; text = `Certificado vence en ${dias} d` }
  else text = `Certificado hasta ${fmtDate(centro.venc_certificado)}`
  return (
    <span className={`cert-chip ${cls}`} title={`Certificado digital ARCA de ${centro.nombre}: ${centro.venc_certificado ? fmtDate(centro.venc_certificado) : 'sin fecha cargada'}`}>
      <ShieldCheck size={14} aria-hidden="true" />
      <span className="cert-text">{text}</span>
    </span>
  )
}

function ThemeToggle() {
  const { tema, setTema } = useSession()
  const next = { sistema: 'claro', claro: 'oscuro', oscuro: 'sistema' }[tema] ?? 'claro'
  const Icon = tema === 'claro' ? Sun : tema === 'oscuro' ? Moon : Monitor
  const label = { claro: 'Tema claro', oscuro: 'Tema oscuro', sistema: 'Tema del sistema' }[tema]
  return (
    <button className="icon-btn" onClick={() => setTema(next)} title={`${label}. Cambiar`} aria-label={`${label}. Cambiar tema`}>
      <Icon size={18} />
    </button>
  )
}

function UserMenu() {
  const { usuario, esStaff, logout } = useSession()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const navigate = useNavigate()
  useEffect(() => {
    if (!open) return
    const close = (e) => { if (!ref.current?.contains(e.target)) setOpen(false) }
    const esc = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc) }
  }, [open])
  const iniciales = `${usuario.nombre?.[0] ?? ''}${usuario.apellido?.[0] ?? ''}`.toUpperCase()
  const go = (path) => { setOpen(false); navigate(path) }
  return (
    <div className="user-menu" ref={ref}>
      <button className="user-btn" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="menu">
        <span className="avatar" aria-hidden="true">{iniciales}</span>
        <span className="who">{usuario.nombre} {usuario.apellido}<small>{esStaff ? 'Staff' : 'Facturación'} · DNI {usuario.documento}</small></span>
        <ChevronDown size={14} aria-hidden="true" />
      </button>
      {open && (
        <div className="menu-pop" role="menu">
          <button role="menuitem" onClick={() => go('/mi-cuenta')}><UserCog size={16} /> Mis preferencias</button>
          {esStaff && <button role="menuitem" onClick={() => go('/utilidades/configuracion')}><Settings size={16} /> Configuración</button>}
          <hr />
          <button role="menuitem" onClick={logout}><LogOut size={16} /> Cerrar sesión</button>
        </div>
      )}
    </div>
  )
}

function SedeSelect() {
  const { centros, centroId, setCentroId } = useSession()
  const grupos = ['EDDIS', 'SB'].map((m) => [m, centros.filter((c) => c.marca === m)]).filter(([, l]) => l.length)
  return (
    <label className="sede-select">
      <span className="marca-dot" aria-hidden="true" />
      <span className="sr-only">Sede</span>
      <select value={centroId ?? ''} onChange={(e) => setCentroId(Number(e.target.value))}>
        {grupos.map(([m, lista]) => (
          <optgroup key={m} label={MARCA[m]}>
            {lista.map((c) => <option key={c.id} value={c.id}>{m === 'SB' ? c.nombre.replace(/^Studio Beauty\s+/i, '') : c.nombre}</option>)}
          </optgroup>
        ))}
      </select>
    </label>
  )
}

const NAV = [
  { items: [{ to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard }] },
  {
    title: 'Administración',
    items: [
      { to: '/pagos', label: 'Pagos', icon: Wallet },
      { to: '/comprobantes', label: 'Comprobantes fiscales', icon: FileText },
      { to: '/cuit', label: 'CUIT', icon: Building2 },
      { to: '/consulta-arca', label: 'Consulta ARCA', icon: Search },
      { to: '/terceros', label: 'Datos de terceros', icon: Users2 },
      { to: '/auditoria', label: 'Auditoría', icon: ScrollText },
    ],
  },
  {
    title: 'Utilidades',
    staff: true,
    items: [
      { to: '/utilidades/usuarios', label: 'Usuarios', icon: Users },
      { to: '/utilidades/centros', label: 'Centros', icon: MapPin },
      { to: '/utilidades/configuracion', label: 'Configuración', icon: SlidersHorizontal },
    ],
  },
]

export default function Layout() {
  const { centro, esStaff, session } = useSession()
  const [collapsed, setCollapsed] = useState(() => { try { return localStorage.getItem(LS_MENU) === '1' } catch { return false } })
  const [mobileOpen, setMobileOpen] = useState(false)
  const location = useLocation()
  useEffect(() => { setMobileOpen(false) }, [location.pathname])

  const toggleMenu = () => {
    if (window.matchMedia('(max-width: 720px)').matches) { setMobileOpen((o) => !o); return }
    setCollapsed((c) => {
      try { localStorage.setItem(LS_MENU, c ? '0' : '1') } catch { /* sin almacenamiento */ }
      return !c
    })
  }
  const nuevaPestana = () => window.open(`${window.location.pathname}#/dashboard`, '_blank', 'noopener')

  return (
    <div className={`shell ${collapsed ? 'is-collapsed' : ''} ${mobileOpen ? 'is-mobile-open' : ''}`}>
      <header className="topbar">
        <div className="logo"><Logo marca={centro?.marca} /></div>
        <button className="icon-btn" onClick={toggleMenu} aria-label={collapsed ? 'Expandir menú' : 'Contraer menú'} title="Contraer o expandir menú"><Menu size={19} /></button>
        <button className="icon-btn hide-sm" onClick={nuevaPestana} aria-label="Abrir en una pestaña nueva" title="Abrir el sistema en una pestaña nueva"><ExternalLink size={17} /></button>
        <div className="spacer" />
        <SedeSelect />
        <CertChip />
        <ThemeToggle />
        <UserMenu />
      </header>
      <div className="shell-body">
        <nav className="sidebar" aria-label="Menú principal">
          {NAV.filter((g) => !g.staff || esStaff).map((g, i) => (
            <div className="nav-group" key={i}>
              {g.title && <div className="nav-group-title">{g.title}</div>}
              {g.items.map((it) => (
                <NavLink key={it.to} to={it.to} className="nav-link" title={collapsed ? it.label : undefined}>
                  <it.icon size={18} aria-hidden="true" /><span>{it.label}</span>
                </NavLink>
              ))}
            </div>
          ))}
          {session?.simulacion && session.simulados?.length > 0 && (
            <div className="sim-banner">Modo simulación: {session.simulados.join(', ')} {session.simulados.length === 1 ? 'responde' : 'responden'} con datos de prueba.</div>
          )}
        </nav>
        <main className="main" id="contenido">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
