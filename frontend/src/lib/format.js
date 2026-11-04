const money = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 2 })
const moneyShort = new Intl.NumberFormat('es-AR', { notation: 'compact', maximumFractionDigits: 1 })

export const fmtMoney = (n) => money.format(Number(n) || 0)
export const fmtCompact = (n) => '$ ' + moneyShort.format(Number(n) || 0)

export function fmtDate(iso) {
  if (!iso) return '—'
  const [y, m, d] = String(iso).slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}

export function fmtDateTime(iso) {
  if (!iso) return '—'
  const [date, time = ''] = String(iso).split(' ')
  return `${fmtDate(date)} ${time.slice(0, 8)}`
}

export const fmtCuit = (c) => (c && c.length === 11 ? `${c.slice(0, 2)}-${c.slice(2, 10)}-${c.slice(10)}` : c || '—')

export const pad = (n, len) => String(n ?? '').padStart(len, '0')
export const fmtNumero = (pv, n) => (n ? `${pad(pv, 5)}-${pad(n, 8)}` : `${pad(pv, 5)}-········`)

export const today = () => new Date().toLocaleDateString('sv-SE')
export function addDays(iso, days) {
  const d = new Date(iso + 'T12:00:00')
  d.setDate(d.getDate() + days)
  return d.toLocaleDateString('sv-SE')
}
export const firstOfMonth = () => today().slice(0, 8) + '01'

export const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

export const CONDICION_IVA = {
  RI: 'Responsable Inscripto',
  MONOTRIBUTO: 'Monotributo',
  EXENTO: 'Exento',
  CF: 'Consumidor final',
}

export const MARCA = { EDDIS: 'Eddis', SB: 'Studio Beauty' }

export function diasHasta(iso) {
  if (!iso) return null
  const a = new Date(today() + 'T12:00:00')
  const b = new Date(iso.slice(0, 10) + 'T12:00:00')
  return Math.round((b - a) / 86400000)
}
