import type { StateSetter } from "./types";

function messageForError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function withControllerError(setError: StateSetter<string>, fn: () => Promise<void>) {
  return async () => {
    setError("");
    try {
      await fn();
    } catch (error) {
      setError(messageForError(error));
    }
  };
}
