"use client"

import { useState, useRef } from "react"
import {
  Popover,
  PopoverContent,
  PopoverAnchor,
} from "@/components/ui/popover"

type VersionItem = {
  id: string
  versionNumber: number
  label: string | null
  createdAt: string
}

type Props = {
  version: VersionItem
  isCurrent: boolean
  onRestore: () => void
  children: React.ReactNode
}

const LONG_PRESS_MS = 500

export function VersionPopover({ version, isCurrent, onRestore, children }: Props) {
  const [open, setOpen] = useState(false)
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    setOpen(true)
  }

  const startLongPress = () => {
    pressTimer.current = setTimeout(() => setOpen(true), LONG_PRESS_MS)
  }

  const cancelLongPress = () => {
    if (pressTimer.current) clearTimeout(pressTimer.current)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div
          onContextMenu={handleContextMenu}
          onTouchStart={startLongPress}
          onTouchEnd={cancelLongPress}
          onTouchMove={cancelLongPress}
        >
          {children}
        </div>
      </PopoverAnchor>
      <PopoverContent className="w-56 gap-2 p-3">
        <div className="flex flex-col gap-0.5">
          <p className="text-[13px] font-semibold text-pri">
            Version {version.versionNumber}
          </p>
          {version.label && (
            <p className="text-[12px] text-mut">{version.label}</p>
          )}
          <p className="text-[11px] text-mut">
            {new Date(version.createdAt).toLocaleString()}
          </p>
        </div>
        <button
          onClick={() => {
            onRestore()
            setOpen(false)
          }}
          disabled={isCurrent}
          className="w-full rounded-lg bg-bubble px-2.5 py-1.5 text-[12px] font-semibold text-pri transition-opacity duration-150 hover:opacity-80 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          {isCurrent ? "This is the current version" : "Restore as current"}
        </button>
      </PopoverContent>
    </Popover>
  )
}
