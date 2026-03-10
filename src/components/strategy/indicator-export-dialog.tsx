'use client'

import { useState } from 'react'
import { Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'

export function IndicatorExportDialog() {
  const [open, setOpen] = useState(false)
  const [withBacktests, setWithBacktests] = useState(false)

  function handleExport() {
    const url = `/api/export/indicators?with_backtests=${withBacktests}`
    window.location.href = url
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Download className="size-4 mr-1.5" />
          Export
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Indikatoren exportieren</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={withBacktests}
              onChange={(e) => setWithBacktests(e.target.checked)}
              className="size-4 rounded border-border accent-primary"
            />
            <span className="text-sm">Backtests mit exportieren</span>
          </label>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
              Abbrechen
            </Button>
            <Button size="sm" onClick={handleExport}>
              <Download className="size-4 mr-1.5" />
              Exportieren
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
