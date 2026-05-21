export default function ChatHomePage() {
  return (
    <div className="flex h-full items-center justify-center bg-[#0a0a0a]">
      <div className="flex flex-col gap-4 w-full max-w-2xl px-8">

        {/* Large square card */}
        <div className="w-48 h-48 rounded-2xl border border-white/15 bg-transparent" />

        {/* Two medium cards side by side */}
        <div className="flex gap-4">
          <div className="flex-1 h-14 rounded-xl border border-white/15" />
          <div className="flex-1 h-14 rounded-xl border border-white/15" />
        </div>

        {/* Wide card */}
        <div className="w-full h-24 rounded-2xl border border-white/15" />

      </div>
    </div>
  );
}