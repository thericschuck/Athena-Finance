import { signIn, signUp } from './actions'

interface LoginPageProps {
  searchParams: Promise<{ error?: string; message?: string }>
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { error, message } = await searchParams

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm">
        {/* Logo / Heading */}
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold text-gray-900">Athena Finance</h1>
          <p className="mt-1 text-sm text-gray-500">Melde dich an oder erstelle ein Konto</p>
        </div>

        {/* Feedback messages */}
        {error && (
          <div className="mb-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700 border border-red-200">
            {error}
          </div>
        )}
        {message && (
          <div className="mb-4 rounded-md bg-green-50 px-4 py-3 text-sm text-green-700 border border-green-200">
            {message}
          </div>
        )}

        {/* Form */}
        <div className="rounded-xl border border-gray-200 bg-white px-8 py-8 shadow-sm">
          <form className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                E-Mail
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                placeholder="du@example.com"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                Passwort
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                autoComplete="current-password"
                placeholder="••••••••"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
              />
            </div>

            <div className="flex flex-col gap-2 pt-2">
              <button
                formAction={signIn}
                className="w-full rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:ring-offset-2 transition-colors"
              >
                Einloggen
              </button>
              <button
                formAction={signUp}
                className="w-full rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:ring-offset-2 transition-colors"
              >
                Registrieren
              </button>
            </div>
          </form>
        </div>
      </div>
    </main>
  )
}
