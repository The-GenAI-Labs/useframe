import { spawnSync } from "node:child_process"
import { mkdtemp, stat, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { beforeAll, describe, expect, it } from "vitest"
import { MediaRejectedError } from "@/processing/errors.js"
import { ffprobe, runTool, type FfmpegConfig } from "@/processing/ffmpeg.js"
import { checkProbe, processVideo } from "@/processing/video.js"

const hasFfmpeg = spawnSync("ffmpeg", ["-version"]).status === 0 && spawnSync("ffprobe", ["-version"]).status === 0
const cfg: FfmpegConfig = { ffmpegPath: "ffmpeg", ffprobePath: "ffprobe", timeoutMs: 120_000, threads: 2 }

const probe = (format: Record<string, unknown>, streams: Record<string, unknown>[]) => ({ format, streams })
const mp4 = { format_name: "mov,mp4,m4a,3gp,3g2,mj2", duration: "12.5", filename: "/work/in" }

describe("checkProbe", () => {
  it("accepts the MP4 and WebM families and reports duration and audio", () => {
    expect(
      checkProbe(
        probe(mp4, [{ codec_type: "video", width: 1920, height: 1080 }, { codec_type: "audio" }]),
        "/work/in",
        60,
      ),
    ).toEqual({
      width: 1920,
      height: 1080,
      durationMs: 12_500,
      hasAudio: true,
    })
    expect(
      checkProbe(
        probe({ ...mp4, format_name: "matroska,webm" }, [{ codec_type: "video", width: 640, height: 360 }]),
        "/work/in",
        60,
      ).hasAudio,
    ).toBe(false)
  })

  it("rejects playlists, concat lists, image sequences and other containers", () => {
    for (const format_name of ["hls", "concat", "image2", "gif", "avi", "mpegts"]) {
      expect(() =>
        checkProbe(probe({ ...mp4, format_name }, [{ codec_type: "video", width: 10, height: 10 }]), "/work/in", 60),
      ).toThrow(MediaRejectedError)
    }
  })

  it("rejects a probe that points at another input", () => {
    expect(() =>
      checkProbe(
        probe({ ...mp4, filename: "/etc/passwd" }, [{ codec_type: "video", width: 10, height: 10 }]),
        "/work/in",
        60,
      ),
    ).toThrow("Couldn't read this video")
  })

  it("rejects over-long, over-4K and video-less files", () => {
    expect(() =>
      checkProbe(probe({ ...mp4, duration: "90" }, [{ codec_type: "video", width: 10, height: 10 }]), "/work/in", 60),
    ).toThrow("Videos can be up to 60 seconds long")
    expect(() => checkProbe(probe(mp4, [{ codec_type: "video", width: 4096, height: 2160 }]), "/work/in", 60)).toThrow(
      "4K",
    )
    expect(() => checkProbe(probe(mp4, [{ codec_type: "audio" }]), "/work/in", 60)).toThrow("no video track")
    expect(() =>
      checkProbe(
        probe(mp4, [{ codec_type: "video", width: 300, height: 300, disposition: { attached_pic: 1 } }]),
        "/work/in",
        60,
      ),
    ).toThrow("no video track")
  })

  it("swaps dimensions for rotated phone footage", () => {
    const rotated = checkProbe(
      probe(mp4, [{ codec_type: "video", width: 1920, height: 1080, side_data_list: [{ rotation: -90 }] }]),
      "/work/in",
      60,
    )
    expect([rotated.width, rotated.height]).toEqual([1080, 1920])
  })
})

describe.skipIf(!hasFfmpeg)("processVideo (ffmpeg)", { timeout: 180_000 }, () => {
  let dir = ""
  let clip = ""

  async function synth(name: string, seconds: number, size: string, audio = true): Promise<string> {
    const out = path.join(dir, name)
    await runTool(
      "ffmpeg",
      [
        "-nostdin",
        "-loglevel",
        "error",
        "-y",
        "-f",
        "lavfi",
        "-i",
        `testsrc2=size=${size}:rate=30:duration=${seconds}`,
        ...(audio ? ["-f", "lavfi", "-i", `sine=frequency=440:duration=${seconds}`] : []),
        "-c:v",
        "libx264",
        "-preset",
        "ultrafast",
        "-pix_fmt",
        "yuv420p",
        ...(audio ? ["-c:a", "aac", "-shortest"] : []),
        "-metadata",
        "title=secret-title",
        "-metadata",
        "location=+51.5000-000.1000/",
        out,
      ],
      120_000,
    )
    return out
  }

  beforeAll(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "media-vid-"))
    clip = await synth("clip.mp4", 3, "1280x720")
  })

  it("produces mp4_720, posters and a thumb with the right duration, keeping upload audio", async () => {
    const outDir = await mkdtemp(path.join(dir, "out-"))
    const out = await processVideo(cfg, clip, outDir, { maxSeconds: 60, stripAudio: false })
    expect(out.variants.map((v) => v.role)).toEqual(["mp4_720", "poster", "poster_last", "thumb"])
    expect(out.durationMs).toBeGreaterThan(2900)
    expect(out.durationMs).toBeLessThan(3200)
    expect(out.hasAudio).toBe(true)
    expect([out.width, out.height]).toEqual([1280, 720])
    const info = (await ffprobe(cfg, out.variants[0]!.path)) as {
      format: { tags?: Record<string, string> }
      streams: { codec_type: string; codec_name: string; pix_fmt?: string; profile?: string }[]
    }
    const video = info.streams.find((s) => s.codec_type === "video")!
    expect(video).toMatchObject({ codec_name: "h264", pix_fmt: "yuv420p", profile: "High" })
    expect(info.streams.some((s) => s.codec_type === "audio" && s.codec_name === "aac")).toBe(true)
    expect(JSON.stringify(info.format.tags ?? {})).not.toMatch(/secret-title|51\.5000/)
    for (const v of out.variants) expect((await stat(v.path)).size).toBeGreaterThan(0)
    expect(out.describeImage).toBe(out.variants.find((v) => v.role === "poster")!.path)
  })

  it("adds mp4_1080 for 1080p sources and strips audio when asked", async () => {
    const hd = await synth("hd.mp4", 1, "1920x1080")
    const outDir = await mkdtemp(path.join(dir, "out-"))
    const out = await processVideo(cfg, hd, outDir, { maxSeconds: 60, stripAudio: true })
    expect(out.variants.map((v) => v.role)).toContain("mp4_1080")
    expect(out.hasAudio).toBe(false)
    const info = (await ffprobe(cfg, out.variants.find((v) => v.role === "mp4_1080")!.path)) as {
      streams: { codec_type: string; height?: number }[]
    }
    expect(info.streams.some((s) => s.codec_type === "audio")).toBe(false)
    expect(info.streams.find((s) => s.codec_type === "video")?.height).toBe(1080)
  })

  it("rejects an HLS playlist renamed to .mp4 at probe time", async () => {
    const playlist = path.join(dir, "playlist.mp4")
    await writeFile(playlist, "#EXTM3U\n#EXT-X-TARGETDURATION:10\n#EXTINF:10,\nfile:///etc/passwd\n#EXT-X-ENDLIST\n")
    const outDir = await mkdtemp(path.join(dir, "out-"))
    await expect(processVideo(cfg, playlist, outDir, { maxSeconds: 60, stripAudio: false })).rejects.toBeInstanceOf(
      MediaRejectedError,
    )
  })

  it("rejects a 90-second video", async () => {
    const long = await synth("long.mp4", 90, "64x64", false)
    const outDir = await mkdtemp(path.join(dir, "out-"))
    await expect(processVideo(cfg, long, outDir, { maxSeconds: 60, stripAudio: false })).rejects.toMatchObject({
      publicReason: "Videos can be up to 60 seconds long",
    })
  })
})
