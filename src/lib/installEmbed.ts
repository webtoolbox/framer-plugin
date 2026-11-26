/**
 * Install the embed snippet, falling back to the clipboard when Framer refuses
 * an automatic install — Custom Code is gated behind a paid Framer plan, and a
 * limited collaborator can be refused outright. The user still gets the code to
 * paste by hand, so "Add to site" degrades instead of dead-ending.
 *
 * Side effects are injected so the decision is testable without Framer.
 */
export type InstallResult =
  | { status: "installed" }
  | { status: "copied"; reason: string }
  | { status: "failed"; reason: string }

function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export async function installEmbed(
  code: string,
  install: (code: string) => Promise<void>,
  copy: (code: string) => Promise<void>,
): Promise<InstallResult> {
  try {
    await install(code)
    return { status: "installed" }
  } catch (error) {
    const reason = reasonOf(error)
    try {
      await copy(code)
      return { status: "copied", reason }
    } catch {
      return { status: "failed", reason }
    }
  }
}
