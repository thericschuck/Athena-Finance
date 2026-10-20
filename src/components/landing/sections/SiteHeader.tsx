import Link from 'next/link'
import { Logo } from '@/components/ui/logo'
import { C, F, kicker } from '@/components/landing/landing-tokens'
import { SHELL } from '@/components/landing/shared/layout'

/*
  ══ NAV ══
  Liegt `absolute` über dem Hero und scrollt normal mit weg — nicht
  mehr `fixed`. Dadurch reicht das Aquarell weiter bis an die
  Seitenoberkante, die Leiste bleibt aber dauerhaft transparent, weil
  sie nie über anderem Inhalt als dem Hero steht.
*/
export function SiteHeader() {
  return (
    <header className="site-header">
      <div
        style={{
          ...SHELL,
          height: '66px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Link
          href="/"
          className="nav-brand"
          style={{ display: 'flex', alignItems: 'center', gap: '12px', textDecoration: 'none' }}
        >
          <Logo variant="dark" size={30} priority />
          <span
            className="nav-wordmark"
            style={{
              fontFamily: F.display,
              fontSize: '18px',
              fontWeight: 500,
              letterSpacing: '0.005em',
              color: C.ink,
              whiteSpace: 'nowrap',
            }}
          >
            Athena Finance
          </span>
        </Link>
        <nav style={{ display: 'flex', alignItems: 'center', gap: 'clamp(16px, 3vw, 32px)' }}>
          <a href="#features" className="nav-link">
            <span
              className="af-quiet"
              style={{ ...kicker, fontSize: '11px', color: C.inkSubtle, whiteSpace: 'nowrap' }}
            >
              Instrumentarium
            </span>
          </a>
          <Link href="/login" className="af-btn hero-btn-primary nav-cta" style={{ padding: '11px 22px' }}>
            Anmelden
          </Link>
        </nav>
      </div>
      <div className="af-dentil" />
    </header>
  )
}
