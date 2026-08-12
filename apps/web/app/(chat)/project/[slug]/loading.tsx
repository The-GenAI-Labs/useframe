export default function WorkspaceLoading() {
  return (
    <div className="flex h-full flex-col bg-surface animate-pulse">
      <div className="flex items-center justify-between border-b border-base px-4 py-2 shrink-0">
        <div className="flex items-center gap-3">
          <div className="h-4 w-32 rounded bg-tertiary" />
          <div className="h-5 w-16 rounded-full bg-tertiary" />
          <div className="flex items-center gap-1.5">
            <div className="h-1.5 w-6 rounded-full bg-tertiary" />
            <div className="h-1.5 w-1.5 rounded-full bg-tertiary" />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-3 w-20 rounded bg-tertiary" />
          <div className="h-7 w-28 rounded-lg bg-tertiary" />
          <div className="h-7 w-52 rounded-lg bg-tertiary" />
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-8">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
      </div>
    </div>
  )
}
