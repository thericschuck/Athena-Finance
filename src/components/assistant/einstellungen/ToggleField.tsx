'use client'

import { useState } from 'react'
import { Checkbox } from '@/components/ui/checkbox'

/** Checkbox von Radix liefert keinen Formularwert — ein verstecktes Input
    daneben trägt den Zustand in die FormData, damit die Server Action mit dem
    üblichen `=== 'on'` auskommt. */
export function ToggleField({
  name,
  label,
  hint,
  defaultChecked,
}: {
  name: string
  label: string
  hint: string
  defaultChecked: boolean
}) {
  const [checked, setChecked] = useState(defaultChecked)
  return (
    <label
      htmlFor={name}
      className="flex min-h-14 cursor-pointer items-start gap-3 px-4 py-3 transition-colors hover:bg-muted/40"
    >
      <Checkbox
        id={name}
        checked={checked}
        onCheckedChange={(value) => setChecked(value === true)}
        className="mt-0.5"
      />
      {checked && <input type="hidden" name={name} value="on" />}
      <span className="min-w-0">
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-xs text-muted-foreground">{hint}</span>
      </span>
    </label>
  )
}
