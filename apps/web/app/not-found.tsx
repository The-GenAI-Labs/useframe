import Link from "next/link";

export default function NotFound() {
  return (
    <div className="relative min-h-screen w-full overflow-hidden">
      <img
        src="/useframe notfound.png"
        alt="404 Not Found"
        className="absolute inset-0 h-full w-full object-cover"
        draggable={false}
      />
      <div className="absolute inset-0 flex flex-col items-center justify-end pb-16 gap-4">
        <Link
          href="/"
          className="rounded-full bg-white/90 px-8 py-3 text-sm font-semibold text-slate-800 shadow-lg backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:bg-white hover:shadow-xl active:scale-95"
        >
          Back to home
        </Link>
      </div>
    </div>
  );
}
