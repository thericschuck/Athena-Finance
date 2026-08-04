import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Athena Finance',
    short_name: 'Athena',
    description: 'Personal finance & trading dashboard',
    start_url: '/dashboard',
    display: 'standalone',
    background_color: '#08090e',
    theme_color: '#0A0A09',
    lang: 'de',
    icons: [
      { src: '/logo_dark.svg', type: 'image/svg+xml', sizes: 'any' },
      { src: '/icon-192.png', type: 'image/png', sizes: '192x192', purpose: 'maskable' },
      { src: '/icon-512.png', type: 'image/png', sizes: '512x512', purpose: 'maskable' },
    ],
  }
}
