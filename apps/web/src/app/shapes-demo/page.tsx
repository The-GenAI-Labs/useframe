import { CardFive, CardSeven } from "../../components/shapes";

export default function ShapesDemoPage() {
  return (
    <main className="min-h-screen bg-[#FBFBFD] px-6 py-20">
      <div className="mx-auto max-w-6xl">
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-950">
          Shape system
        </h1>
        <p className="mt-2 max-w-xl text-sm text-slate-500">
          SVG-path cards with Figma-style superellipse corner smoothing and concave
          badge-notches. Fully fluid — paths regenerate from the measured box.
        </p>

        <div className="mt-12 grid grid-cols-1 gap-8 lg:grid-cols-2">

          <CardFive
            radius={36}
            smoothing={0.85}
            notchCorner="BR"
            notchDepth={90}
            className="flex min-h-[360px] flex-col justify-end bg-white p-8 shadow-[0_20px_60px_-24px_rgba(0,0,0,0.25)]"
          >
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
              CardFive
            </p>
            <p className="mt-1 text-2xl font-extrabold tracking-tight text-slate-950">
              Single concave notch
            </p>
            <p className="mt-2 max-w-[34ch] text-sm leading-relaxed text-slate-500">
              Rounded TL / TR / BL with a smooth inward cut at the bottom-right that a
              circular badge can nestle into.
            </p>
          </CardFive>

          <CardSeven
            radius={36}
            smoothing={0.9}
            notchCorner="BL"
            notchDepth={80}
            notchWidth={140}
            className="relative flex min-h-[360px] flex-col justify-end p-8 text-white shadow-[0_24px_70px_-24px_rgba(0,87,255,0.55)]"
            style={{
              backgroundImage:
                "linear-gradient(135deg, #0057FF 0%, #1A73FF 55%, #5EB7FF 100%)",
            }}
          >
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 opacity-60"
              style={{
                backgroundImage:
                  "radial-gradient(120% 60% at 20% 0%, rgba(255,255,255,0.35), transparent 60%)",
              }}
            />
            <p className="relative text-xs font-semibold uppercase tracking-[0.18em] text-white/70">
              CardSeven
            </p>
            <p className="relative mt-1 text-2xl font-extrabold tracking-tight">
              Wide two-transition notch
            </p>
            <p className="relative mt-2 max-w-[34ch] text-sm leading-relaxed text-white/80">
              A wider concave well with eased dip-in / dip-out transitions — the
              handcrafted seven-corner silhouette, on a premium SaaS gradient.
            </p>
          </CardSeven>

        </div>
      </div>
    </main>
  );
}
