// publicMessage is shown to users; detail stays in buildLog/logs for support.
export class DeployError extends Error {
  constructor(
    readonly publicMessage: string,
    readonly detail?: string,
  ) {
    super(detail ? `${publicMessage}: ${detail}` : publicMessage);
    this.name = "DeployError";
  }
}

export function publicReason(err: unknown): string {
  return err instanceof DeployError ? err.publicMessage : "Deployment failed due to an internal error.";
}
