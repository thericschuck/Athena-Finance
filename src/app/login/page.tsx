import { signIn } from './actions'
import Link from 'next/link'
import { Logo } from '@/components/ui/logo'
import { C, F, kicker } from '@/components/landing/landing-tokens'
import './login.css'
import { OliveVines } from '@/components/landing/olive-vines'

interface LoginPageProps {
  searchParams: Promise<{ error?: string; message?: string }>
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { error, message } = await searchParams

  return (
    <main
      className="login-main"
      style={{
        position: 'relative',
        minHeight: '100dvh',
        overflow: 'hidden',
        backgroundColor: C.parchment,
        color: C.ink,
        fontFamily: F.sans,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'clamp(72px, 12vh, 120px) 24px 48px',
      }}
    >
      <OliveVines tone="light" opacity={0.42} width="clamp(150px, 26vw, 400px)" />

      {/* Zurück zur Startseite */}
      <div style={{ position: 'absolute', top: '22px', left: 'clamp(20px, 4vw, 32px)', zIndex: 2 }}>
        <Link
          href="/"
          className="login-brand"
          style={{ display: 'flex', alignItems: 'center', gap: '11px', textDecoration: 'none' }}
        >
          <Logo variant="dark" size={28} priority />
          <span
            className="login-brand-name"
            style={{ fontFamily: F.display, fontSize: '17px', fontWeight: 500, color: C.ink, whiteSpace: 'nowrap' }}
          >
            Athena Finance
          </span>
        </Link>
      </div>

      <div style={{ position: 'relative', zIndex: 1, width: '100%', maxWidth: '400px' }}>
        {/* Überschrift */}
        <div style={{ textAlign: 'center', marginBottom: '36px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '14px', marginBottom: '20px' }}>
            <span style={{ height: '1px', width: '40px', backgroundColor: C.rule }} />
            <span className="login-kicker" style={{ ...kicker, color: C.inkSubtle, whiteSpace: 'nowrap' }}>
              Anmeldung
            </span>
            <span style={{ height: '1px', width: '40px', backgroundColor: C.rule }} />
          </div>
          <h1
            style={{
              fontFamily: F.display,
              fontWeight: 400,
              fontSize: 'clamp(30px, 5vw, 40px)',
              lineHeight: 1.1,
              letterSpacing: '-0.02em',
              color: C.ink,
              margin: '0 0 12px',
            }}
          >
            Willkommen zurück
          </h1>
          <p style={{ fontFamily: F.serif, fontSize: '15px', lineHeight: 1.7, color: C.inkBody, margin: 0 }}>
            Melde dich an, um fortzufahren.
          </p>
        </div>

        {/* Rückmeldungen */}
        {error && (
          <div
            role="alert"
            style={{
              marginBottom: '18px',
              border: `1px solid rgba(169,85,60,.3)`,
              backgroundColor: 'rgba(169,85,60,.07)',
              padding: '13px 16px',
              fontSize: '13px',
              lineHeight: 1.6,
              color: '#8C4430',
            }}
          >
            {error}
          </div>
        )}
        {message && (
          <div
            role="status"
            style={{
              marginBottom: '18px',
              border: `1px solid rgba(74,91,61,.3)`,
              backgroundColor: 'rgba(74,91,61,.07)',
              padding: '13px 16px',
              fontSize: '13px',
              lineHeight: 1.6,
              color: C.oliveDeep,
            }}
          >
            {message}
          </div>
        )}

        {/* Formular */}
        <div
          className="login-card"
          style={{
            border: `1px solid ${C.rule}`,
            backgroundColor: C.paper,
            boxShadow: '0 24px 60px -30px rgba(26,26,26,.24)',
          }}
        >
          <form style={{ display: 'flex', flexDirection: 'column', gap: '20px', padding: 'clamp(26px, 4vw, 34px)' }}>
            <div>
              <label
                htmlFor="email"
                style={{ display: 'block', ...kicker, fontSize: '10px', color: C.inkSubtle, marginBottom: '9px' }}
              >
                E-Mail
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                placeholder="name@example.com"
                className="af-field"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                style={{ display: 'block', ...kicker, fontSize: '10px', color: C.inkSubtle, marginBottom: '9px' }}
              >
                Passwort
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                autoComplete="current-password"
                placeholder="••••••••"
                className="af-field"
              />
            </div>

            <button type="submit" formAction={signIn} className="af-submit" style={{ marginTop: '4px' }}>
              Einloggen
            </button>
          </form>
        </div>

        <p style={{ textAlign: 'center', marginTop: '28px' }}>
          <Link href="/" className="af-quiet login-back" style={{ ...kicker, fontSize: '10px', color: C.inkSubtle }}>
            Zurück zur Startseite
          </Link>
        </p>
      </div>
    </main>
  )
}
