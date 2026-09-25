"use client"

import { useState, useCallback } from "react"
import { withScaffold, type ReplicationNextFile } from "./nextScaffold"

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
let activeToken = 0

async function getWebContainer() {
  const { WebContainer } = await import("@webcontainer/api")
  if (wcInstance) return wcInstance
  if (!wcBootPromise) wcBootPromise = WebContainer.boot()
  wcInstance = await wcBootPromise
  return wcInstance
}

function buildFsTree(files: ReplicationNextFile[]): import("@webcontainer/api").FileSystemTree {
  const tree: import("@webcontainer/api").FileSystemTree = {}

  for (const { path, content } of files) {
    const parts = path.replace(/^\.?\//, "").split("/")
    const fileName = parts.pop()!
    let cursor = tree

    for (const dir of parts) {
      const existing = cursor[dir]
      if (existing && "directory" in existing) {
        cursor = existing.directory
      } else {
        const dirNode: import("@webcontainer/api").FileSystemTree = {}
        cursor[dir] = { directory: dirNode }
        cursor = dirNode
      }
    }

    cursor[fileName] = { file: { contents: content } }
  }

  return tree
}

export function useNextWebContainer() {
  const [state, setState] = useState<WCState>({ status: "idle" })

  const boot = useCallback(async (files: ReplicationNextFile[]) => {
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

      const tree = buildFsTree(withScaffold(files))
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
      }, 60_000)

      wc.on("server-ready", (_port, url) => {
        clearTimeout(readyTimeout)
        if (stillCurrent()) setState({ status: "ready", url })
      })

      devProcess.output.pipeTo(
        new WritableStream({
          write(chunk) {
            devLog += chunk
            console.log("[webcontainer:next]", chunk)
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
