'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { parseScope } from './scope'
import { SCOPE_COOKIE } from './cookie'

/**
 * Speichert den gewaehlten Scope im Cookie und laedt das Layout neu. Ob der Scope fuer den Nutzer
 * verfuegbar ist, entscheidet `resolveScope` beim Lesen (unverfuegbar -> 'ich'); das Cookie ist nur eine Praeferenz.
 */
export async function setScope(scope: string): Promise<void> {
  const parsed = parseScope(scope)
  if (!parsed) return
  const store = await cookies()
  store.set(SCOPE_COOKIE, parsed, {
    path: '/',
    httpOnly: false,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 365,
  })
  revalidatePath('/', 'layout')
}
