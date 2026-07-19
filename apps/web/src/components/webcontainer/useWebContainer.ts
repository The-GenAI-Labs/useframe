"use client"

import { useState, useRef, useCallback } from "react"
import type { SiteSpec } from "@repo/schemas"
import { buildFsTree } from "./fsTree"

type WCState =
  | { status: "idle" }
  | { status: "booting" }
  | { status: "installing" }
  | { status: "starting" }
  | { status: "ready"; url: string }
  | { status: "error"; message: string }

let wcInstance: import("@webcontainer/api").WebContainer | null = null

export function useWebContainer() {
  const [state, setState] = useState<WCState>({ status: "idle" })
  const mountedRef = useRef(false)

  const boot = useCallback(async (spec: SiteSpec) => {
    if (mountedRef.current) return
    mountedRef.current = true

    try {
      setState({ status: "booting" })

      const { WebContainer } = await import("@webcontainer/api")

      if (!wcInstance) {
        wcInstance = await WebContainer.boot()
      }

      const tree = buildFsTree(spec)
      await wcInstance.mount(tree)

      setState({ status: "installing" })

      const installProcess = await wcInstance.spawn("npm", ["install"])
      const installExitCode = await installProcess.exit

      if (installExitCode !== 0) {
        throw new Error(`npm install failed with code ${installExitCode}`)
      }

      setState({ status: "starting" })

      const devProcess = await wcInstance.spawn("npm", ["run", "dev"])

      wcInstance.on("server-ready", (_port, url) => {
        setState({ status: "ready", url })
      })

      devProcess.output.pipeTo(
        new WritableStream({
          write(chunk) {
            console.log("[webcontainer]", chunk)
          },
        })
      )
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "WebContainer failed to start"
      setState({ status: "error", message })
    }
  }, [])

  return { state, boot }
}
