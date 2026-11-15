type PdfInput = Blob | Uint8Array | ArrayBuffer;

export type PdfInspection =
  | { status: "locked" }
  | { status: "restricted"; pageCount: number }
  | { status: "open"; pageCount: number; bytes: Uint8Array };

export type UnlockedPdf = {
  bytes: Uint8Array;
  pageCount: number;
  removedPassword: boolean;
};

export type UnlockErrorCode =
  | "not-pdf"
  | "wrong-password"
  | "failed";

export class UnlockError extends Error {
  readonly code: UnlockErrorCode;

  constructor(code: UnlockErrorCode, message: string) {
    super(message);
    this.name = "UnlockError";
    this.code = code;
  }
}

export type UnlockSession = {
  inspect(input: PdfInput): Promise<PdfInspection>;
  unlock(input: PdfInput, password: string): Promise<UnlockedPdf>;
  close(): void;
};

export async function openUnlockSession(): Promise<UnlockSession> {
  const { createQpdf, QpdfError } = await import("@mssio/qpdf-wasm");
  const qpdf = await createQpdf();

  function fail(error: unknown, message: string): UnlockError {
    if (error instanceof UnlockError) return error;
    if (error instanceof QpdfError && error.code === "INVALID_PDF") {
      return new UnlockError("not-pdf", "That file is not a readable PDF.");
    }
    return new UnlockError("failed", message);
  }

  return {
    async inspect(input) {
      try {
        const info = await qpdf.info(copyInput(input));
        if (!info.encrypted) {
          return {
            status: "open",
            pageCount: info.pageCount,
            bytes: await bytesOf(input),
          };
        }
        return { status: "restricted", pageCount: info.pageCount };
      } catch (error) {
        if (error instanceof QpdfError && error.code === "INVALID_PASSWORD") {
          return { status: "locked" };
        }
        throw fail(error, "Could not read that PDF.");
      }
    },

    async unlock(input, password) {
      try {
        const { output } = await qpdf.decrypt(copyInput(input), { password });
        const info = await qpdf.info(output.slice());
        if (info.encrypted) {
          throw new UnlockError(
            "failed",
            "Could not remove the password from that PDF.",
          );
        }
        return {
          bytes: output,
          pageCount: info.pageCount,
          removedPassword: true,
        };
      } catch (error) {
        if (error instanceof QpdfError && error.code === "INVALID_PASSWORD") {
          throw new UnlockError(
            "wrong-password",
            "That password did not open this PDF.",
          );
        }
        throw fail(error, "Could not remove the password from that PDF.");
      }
    },

    close() {
      qpdf.terminate();
    },
  };
}

export async function removePdfPassword(
  input: PdfInput,
  password: string,
): Promise<UnlockedPdf> {
  const session = await openUnlockSession();
  try {
    const inspection = await session.inspect(input);
    if (inspection.status === "open") {
      return {
        bytes: inspection.bytes,
        pageCount: inspection.pageCount,
        removedPassword: false,
      };
    }
    return await session.unlock(input, password);
  } finally {
    session.close();
  }
}

export function unlockedFileName(
  originalName: string,
  removedPassword = true,
): string {
  const trimmed = originalName.trim();
  const base = trimmed.replace(/\.pdf$/i, "") || "document";
  if (!removedPassword) {
    return /\.pdf$/i.test(trimmed) ? trimmed : `${base}.pdf`;
  }
  return `${base}-unlocked.pdf`;
}

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 1024) {
    return `${Math.max(0, Math.round(bytes))} B`;
  }
  const kilobytes = bytes / 1024;
  if (kilobytes < 1024) {
    return kilobytes < 10
      ? `${kilobytes.toFixed(1)} KB`
      : `${Math.round(kilobytes)} KB`;
  }
  return `${(kilobytes / 1024).toFixed(1)} MB`;
}

// qpdf transfers Uint8Array inputs into its worker, so each call needs its own copy.
function copyInput(input: PdfInput): PdfInput {
  if (input instanceof Uint8Array) return new Uint8Array(input);
  if (input instanceof ArrayBuffer) return input.slice(0);
  return input;
}

async function bytesOf(input: PdfInput): Promise<Uint8Array> {
  if (input instanceof Uint8Array) return new Uint8Array(input);
  if (input instanceof ArrayBuffer) return new Uint8Array(input.slice(0));
  return new Uint8Array(await input.arrayBuffer());
}
