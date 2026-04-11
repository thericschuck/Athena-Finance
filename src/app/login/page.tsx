import { signIn } from './actions'
import Link from 'next/link'
import { TrendingUp } from 'lucide-react'

const INPUT_STYLE = `
  .af-input { width: 100%; border-radius: 9px; border: 1px solid #1e2130; background-color: #13161e; padding: 10px 14px; font-size: 14px; color: #f3f0ea; outline: none; box-sizing: border-box; transition: border-color 0.15s ease; font-family: inherit; }
  .af-input::placeholder { color: #374151; }
  .af-input:focus { border-color: rgba(240,217,140,0.4); }
  .af-btn-primary { width: 100%; border-radius: 9px; background-color: #f0d98c; padding: 11px 16px; font-size: 14px; font-weight: 700; color: #0d0f14; border: none; cursor: pointer; letter-spacing: -0.01em; transition: opacity 0.15s ease; font-family: inherit; }
  .af-btn-primary:hover { opacity: 0.9; }
  .af-btn-secondary { width: 100%; border-radius: 9px; background-color: transparent; padding: 11px 16px; font-size: 14px; font-weight: 500; color: #9ca3af; border: 1px solid #1e2130; cursor: pointer; transition: border-color 0.15s ease, color 0.15s ease; font-family: inherit; }
  .af-btn-secondary:hover { border-color: #374151; color: #d1d5db; }
`

interface LoginPageProps {
  searchParams: Promise<{ error?: string; message?: string }>
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { error, message } = await searchParams

  return (
    <main style={{ minHeight: '100vh', backgroundColor: '#08090e', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px', fontFamily: 'var(--font-geist-sans)' }}>
      <style dangerouslySetInnerHTML={{ __html: INPUT_STYLE }} />

      {/* Back to landing */}
      <div style={{ position: 'absolute', top: '20px', left: '24px' }}>
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '8px', textDecoration: 'none' }}>
          <div style={{ width: '26px', height: '26px', borderRadius: '6px', background: 'linear-gradient(135deg, #f0d98c, #a8782a)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <TrendingUp size={13} color="#0d0f14" strokeWidth={2.5} />
          </div>
          <span style={{ fontSize: '14px', fontWeight: 700, color: '#f3f0ea', letterSpacing: '-0.01em' }}>Athena Finance</span>
        </Link>
      </div>

      <div style={{ width: '100%', maxWidth: '380px' }}>
        {/* Heading */}
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <h1 style={{ fontSize: '24px', fontWeight: 800, color: '#f3f0ea', marginBottom: '8px', letterSpacing: '-0.025em', fontFamily: 'var(--font-playfair)' }}>
            Willkommen zurück
          </h1>
          <p style={{ fontSize: '14px', color: '#6b7280' }}>Persönliches Finanzsystem von Eric Schuck</p>
        </div>

        {/* Feedback */}
        {error && (
          <div style={{ marginBottom: '16px', borderRadius: '10px', backgroundColor: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)', padding: '12px 16px', fontSize: '13px', color: '#fca5a5' }}>
            {error}
          </div>
        )}
        {message && (
          <div style={{ marginBottom: '16px', borderRadius: '10px', backgroundColor: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.2)', padding: '12px 16px', fontSize: '13px', color: '#86efac' }}>
            {message}
          </div>
        )}

        {/* Card */}
        <div style={{ borderRadius: '16px', border: '1px solid #1e2130', backgroundColor: '#0d0f14', padding: '28px', boxShadow: '0 24px 48px rgba(0,0,0,0.5)' }}>
          <form style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            <div>
              <label htmlFor="email" style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: '#9ca3af', marginBottom: '7px' }}>
                E-Mail
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                placeholder="du@example.com"
                className="af-input"
              />
            </div>

            <div>
              <label htmlFor="password" style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: '#9ca3af', marginBottom: '7px' }}>
                Passwort
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                autoComplete="current-password"
                placeholder="••••••••"
                className="af-input"
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', paddingTop: '4px' }}>
              <button formAction={signIn} className="af-btn-primary">
                Einloggen
              </button>
            </div>
          </form>
        </div>
      </div>
    </main>
  )
}
