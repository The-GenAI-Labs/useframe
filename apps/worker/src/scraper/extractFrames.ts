import { execFileSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"

// 8 frames is a deliberate cap, not a suggestion — each extra frame is a
// real, linear cost increase on the vision call that consumes them. Don't
// raise this without a reason.
const MAX_FRAMES = 8

let ffmpegChecked = false
let ffmpegPresent = false

// The video pipeline needs ffmpeg on PATH (see apps/worker/Dockerfile).
// Checked once per process rather than per scan, and used to skip video
// analysis entirely rather than failing the scan — a worker without ffmpeg
// must still complete the ordinary screenshot path.
export function isFfmpegAvailable(): boolean {
  if (ffmpegChecked) return ffmpegPresent
  ffmpegChecked = true
  try {
    execFileSync("ffmpeg", ["-version"], { stdio: "ignore" })
    ffmpegPresent = true
  } catch {
    ffmpegPresent = false
    console.warn("[extractFrames] ffmpeg not found on PATH — video analysis will be skipped")
  }
  return ffmpegPresent
}

export function extractFrames(videoPath: string): Buffer[] {
  const outDir = path.dirname(videoPath)

  // execFile (not execSync with a shell string) so the path can't be
  // interpreted as shell syntax — these paths are generated, but a scan
  // pipeline shelling out on a URL-derived tree is worth keeping tight.
  execFileSync(
    "ffmpeg",
    [
      "-i", videoPath,
      "-vf", "fps=1,scale=800:-1",
      "-frames:v", String(MAX_FRAMES),
      path.join(outDir, "frame_%02d.png"),
    ],
    { stdio: "ignore" },
  )

  const frameFiles = fs
    .readdirSync(outDir)
    .filter((f) => f.startsWith("frame_") && f.endsWith(".png"))
    .sort()

  return frameFiles.map((f) => fs.readFileSync(path.join(outDir, f)))
}
