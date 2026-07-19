"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { CreateProjectModal } from "@/components/project/CreateProjectModal"

export default function NewProjectPage() {
  const router = useRouter()
  const [open, setOpen] = useState(true)

  return (
    <CreateProjectModal
      open={open}
      onClose={() => {
        setOpen(false)
        router.back()
      }}
    />
  )
}
