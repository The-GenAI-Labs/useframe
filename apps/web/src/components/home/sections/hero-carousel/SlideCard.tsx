import Link from "next/link";

export function SlideCard({
  tag,
  title,
  description,
}: {
  tag: string;
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col gap-4 text-white">
      <span className="w-fit rounded-full bg-white/20 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-white">
        {tag}
      </span>
      <h2 className="text-3xl font-extrabold leading-tight tracking-tight">
        {title}
      </h2>
      <p className="text-sm leading-relaxed text-white/70">{description}</p>
      <div className="mt-2 flex items-center gap-3">
        <Link
          href="/signin"
          className="cursor-pointer rounded-full bg-white px-5 py-2 text-xs font-bold text-blue-600 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md active:scale-95"
        >
          Get Started
        </Link>
        <button
          type="button"
          className="cursor-pointer rounded-full border border-white/40 px-5 py-2 text-xs font-semibold text-white/90 transition-all hover:border-white/70 hover:bg-white/10 active:scale-95"
        >
          Know More
        </button>
      </div>
    </div>
  );
}
