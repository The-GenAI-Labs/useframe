"use client"

import { useState, useCallback } from "react"
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
let wcBootPromise: Promise<import("@webcontainer/api").WebContainer> | null = null
let currentDevProcess: import("@webcontainer/api").WebContainerProcess | null = null

// Only one preview can run inside the shared WebContainer at a time. Each
// boot() call gets a token; if a newer call starts before this one finishes,
// this one abandons itself instead of racing the newer one for the container.
let activeToken = 0

async function getWebContainer() {
  const { WebContainer } = await import("@webcontainer/api")
  if (wcInstance) return wcInstance
  if (!wcBootPromise) wcBootPromise = WebContainer.boot()
  wcInstance = await wcBootPromise
  return wcInstance
}

export function useWebContainer() {
  const [state, setState] = useState<WCState>({ status: "idle" })

  const boot = useCallback(async (spec: SiteSpec) => {
    const myToken = ++activeToken
    const stillCurrent = () => activeToken === myToken

    try {
      setState({ status: "booting" })

      const wc = await getWebContainer()
      if (!stillCurrent()) return

      if (currentDevProcess) {
        currentDevProcess.kill()
        currentDevProcess = null
      }

      const tree = buildFsTree(spec)
      await wc.mount(tree)
      if (!stillCurrent()) return

      setState({ status: "installing" })

      const installProcess = await wc.spawn("npm", ["install"])
      let installLog = ""
      installProcess.output.pipeTo(
        new WritableStream({
          write(chunk) {
            installLog += chunk
          },
        })
      )
      const installExitCode = await installProcess.exit
      if (!stillCurrent()) return

      if (installExitCode !== 0) {
        throw new Error(
          `npm install failed (code ${installExitCode}): ${installLog.slice(-500) || "no output"}`
        )
      }

      setState({ status: "starting" })

      const devProcess = await wc.spawn("npm", ["run", "dev"])
      if (!stillCurrent()) {
        devProcess.kill()
        return
      }
      currentDevProcess = devProcess
      let devLog = ""

      const readyTimeout = setTimeout(() => {
        if (stillCurrent()) {
          setState({
            status: "error",
            message: `Dev server didn't start in time.\n${devLog.slice(-500)}`,
          })
        }
      }, 30_000)

      wc.on("server-ready", (_port, url) => {
        clearTimeout(readyTimeout)
        if (stillCurrent()) setState({ status: "ready", url })
      })

      devProcess.output.pipeTo(
        new WritableStream({
          write(chunk) {
            devLog += chunk
            console.log("[webcontainer]", chunk)
          },
        })
      )
    } catch (err) {
      if (!stillCurrent()) return
      const message =
        err instanceof Error ? err.message : "WebContainer failed to start"
      setState({ status: "error", message })
    }
  }, [])

  return { state, boot }
}
