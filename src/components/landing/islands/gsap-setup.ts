/**
 * Einmalige Registrierung des ScrollTrigger-Plugins für alle Landing-Inseln.
 * Früher stand das als Modul-Seiteneffekt oben in LandingClient.tsx; die
 * scroll-getriebenen Inseln importieren gsap jetzt von hier, damit die
 * Registrierung garantiert vor der ersten Nutzung läuft.
 */
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

if (typeof window !== 'undefined') gsap.registerPlugin(ScrollTrigger)

export { gsap, ScrollTrigger }
