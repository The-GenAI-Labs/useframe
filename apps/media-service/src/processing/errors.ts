// Final and user-facing (never retried); `detail` is for logs and never holds file contents.
export class MediaRejectedError extends Error {
  constructor(
    public readonly publicReason: string,
    public readonly detail?: string,
  ) {
    super(detail ? `${publicReason} (${detail})` : publicReason)
    this.name = "MediaRejectedError"
  }
}
