import Image from 'next/image'
import { cn } from '@/lib/utils'

type LogoVariant = 'auto' | 'dark' | 'light' | 'transparent'

interface LogoProps {
  /**
   * `auto`        – Badge folgt dem Theme (heller Badge im Light-, dunkler im Dark-Mode)
   * `dark`        – Badge mit dunklem Hintergrund (für fest dunkle Flächen wie Landing/Login)
   * `light`       – Badge mit hellem Hintergrund
   * `transparent` – nur die Marke, ohne Badge-Kreis
   */
  variant?: LogoVariant
  size?: number
  className?: string
  priority?: boolean
}

const SRC: Record<Exclude<LogoVariant, 'auto'>, string> = {
  dark: '/logo_dark.svg',
  light: '/logo_light.svg',
  transparent: '/logo_transparent.svg',
}

export function Logo({ variant = 'auto', size = 24, className, priority }: LogoProps) {
  const shared = {
    width: size,
    height: size,
    priority,
    // SVGs werden vom Next Image Optimizer ohne `dangerouslyAllowSVG` abgelehnt –
    // und brauchen ohnehin keine Optimierung.
    unoptimized: true,
    className: cn('rounded-full shrink-0', className),
  }

  if (variant !== 'auto') {
    return <Image src={SRC[variant]} alt="Athena Finance" {...shared} />
  }

  // Kein useTheme() → kein Hydration-Flash: beide Varianten rendern, CSS entscheidet.
  return (
    <>
      <Image src={SRC.light} alt="Athena Finance" {...shared} className={cn(shared.className, 'dark:hidden')} />
      <Image src={SRC.dark} alt="" aria-hidden {...shared} className={cn(shared.className, 'hidden dark:block')} />
    </>
  )
}
