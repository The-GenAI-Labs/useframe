export default function WorkspaceLoading() {
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-4">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
      <p className="text-sm text-muted-foreground">Loading workspace...</p>
    </div>
  )
}
