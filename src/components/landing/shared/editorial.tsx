import { C, F, kicker } from '@/components/landing/landing-tokens'

// ── Editorial-Bausteine ───────────────────────────────────────────────────────

/** Gesperrte Kapitälchen, optional mit flankierenden Haarlinien. */
export function Kicker({
  children,
  color = C.inkSubtle,
  rules = false,
  ruleColor = C.rule,
  center = false,
}: {
  children: React.ReactNode
  color?: string
  rules?: boolean
  ruleColor?: string
  center?: boolean
}) {
  const label = (
    <span className="af-kicker" style={{ ...kicker, color, whiteSpace: 'nowrap' }}>
      {children}
    </span>
  )
  if (!rules) return label
  const rule = (
    <span
      className="af-kicker-rule"
      style={{ height: '1px', width: 'clamp(24px, 8vw, 72px)', backgroundColor: ruleColor, flexShrink: 0 }}
    />
  )
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '16px',
        justifyContent: center ? 'center' : 'flex-start',
      }}
    >
      {center && rule}
      {label}
      {rule}
    </div>
  )
}

/** Doppellinie mit Raute — klassischer Absatztrenner. */
export function Lozenge({ color = C.rule, mark = C.goldInk }: { color?: string; mark?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '14px', justifyContent: 'center' }}>
      <span style={{ height: '1px', flex: 1, maxWidth: '160px', backgroundColor: color }} />
      <span
        style={{
          width: '6px',
          height: '6px',
          backgroundColor: mark,
          transform: 'rotate(45deg)',
          flexShrink: 0,
        }}
      />
      <span style={{ height: '1px', flex: 1, maxWidth: '160px', backgroundColor: color }} />
    </div>
  )
}

export function SectionHead({
  index,
  label,
  title,
  emphasis,
  lead,
  tone = 'light',
  align = 'center',
}: {
  index?: string
  label: string
  title: string
  emphasis?: string
  lead?: string
  tone?: 'light' | 'dark'
  align?: 'center' | 'left'
}) {
  const dark = tone === 'dark'
  return (
    <div
      style={{
        textAlign: align,
        maxWidth: align === 'center' ? '760px' : undefined,
        margin: align === 'center' ? '0 auto' : undefined,
      }}
    >
      <div style={{ display: 'flex', justifyContent: align === 'center' ? 'center' : 'flex-start', marginBottom: '22px' }}>
        <Kicker
          rules
          center={align === 'center'}
          color={dark ? C.onSubtle : C.inkSubtle}
          ruleColor={dark ? C.ruleOn : C.rule}
        >
          {index ? `${index} · ${label}` : label}
        </Kicker>
      </div>
      <h2
        className="af-balance"
        style={{
          fontFamily: F.display,
          fontWeight: 400,
          fontSize: 'clamp(26px, 3.6vw, 44px)',
          lineHeight: 1.1,
          letterSpacing: '-0.015em',
          color: dark ? C.onCream : C.ink,
          margin: 0,
        }}
      >
        {title}
        {emphasis && (
          <>
            <br />
            <em style={{ fontStyle: 'italic', color: dark ? C.gold : C.goldInk }}>{emphasis}</em>
          </>
        )}
      </h2>
      {lead && (
        <p
          className="af-balance"
          style={{
            fontFamily: F.serif,
            fontSize: 'clamp(14px, 1.3vw, 16px)',
            lineHeight: 1.8,
            color: dark ? C.onBody : C.inkBody,
            marginTop: '20px',
            maxWidth: '600px',
            marginLeft: align === 'center' ? 'auto' : 0,
            marginRight: align === 'center' ? 'auto' : 0,
          }}
        >
          {lead}
        </p>
      )}
    </div>
  )
}
