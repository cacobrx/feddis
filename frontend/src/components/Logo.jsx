// Logotipos tipográficos provisorios. Para usar los logos oficiales, colocar
// los archivos en frontend/public/logos/ (eddis.svg y sb.svg) y cambiar USAR_ARCHIVOS a true.
const USAR_ARCHIVOS = false

export default function Logo({ marca = 'EDDIS', height = 26, inverse = false }) {
  if (USAR_ARCHIVOS) {
    return <img src={`./logos/${marca === 'SB' ? 'sb' : 'eddis'}.svg`} alt={marca === 'SB' ? 'Studio Beauty' : 'Eddis'} style={{ height }} />
  }
  const ink = inverse ? '#ffffff' : 'var(--ink)'
  if (marca === 'SB') {
    return (
      <svg height={height} viewBox="0 0 172 32" role="img" aria-label="Studio Beauty">
        <rect x="0" y="2" width="28" height="28" rx="14" fill={inverse ? '#ffffff' : 'var(--accent)'} />
        <text x="14" y="21.5" textAnchor="middle" fontFamily="Onest, sans-serif" fontWeight="700" fontSize="12.5" fill={inverse ? '#b0306a' : 'var(--accent-ink)'}>SB</text>
        <text x="38" y="22" fontFamily="Onest, sans-serif" fontWeight="500" fontSize="17" letterSpacing="-0.2" fill={ink}>Studio Beauty</text>
      </svg>
    )
  }
  return (
    <svg height={height} viewBox="0 0 92 32" role="img" aria-label="Eddis">
      <text x="0" y="24" fontFamily="Onest, sans-serif" fontWeight="700" fontSize="26" letterSpacing="-1" fill={ink}>eddis</text>
      <rect x="66" y="18" width="7" height="7" rx="1.5" fill={inverse ? '#9fb0ff' : 'var(--accent)'} />
    </svg>
  )
}
