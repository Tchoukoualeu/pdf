import { downloadBytes } from "./download";
import "./style.css";
import {
  formatFileSize,
  openUnlockSession,
  UnlockError,
  unlockedFileName,
  type UnlockSession,
} from "./unlock";

function required<T extends Element>(selector: string): T {
  const node = document.querySelector<T>(selector);
  if (!node) throw new Error(`Missing ${selector}`);
  return node;
}

const dropzone = required<HTMLElement>("#dropzone");
const fileInput = required<HTMLInputElement>("#file-input");
const sampleRow = required<HTMLElement>("#sample-row");
const trySampleBtn = required<HTMLButtonElement>("#try-sample");
const form = required<HTMLFormElement>("#unlock-form");
const fileNameEl = required<HTMLParagraphElement>("#file-name");
const fileSizeEl = required<HTMLParagraphElement>("#file-size");
const changeFileBtn = required<HTMLButtonElement>("#change-file");
const passwordInput = required<HTMLInputElement>("#password");
const passwordHint = required<HTMLParagraphElement>("#password-hint");
const togglePasswordBtn = required<HTMLButtonElement>("#toggle-password");
const submitBtn = required<HTMLButtonElement>("#unlock-submit");
const statusEl = required<HTMLDivElement>("#status");
const resultsEl = required<HTMLElement>("#results");
const resultsTitle = required<HTMLParagraphElement>("#results-title");
const resultsMeta = required<HTMLParagraphElement>("#results-meta");
const preview = required<HTMLDivElement>("#preview");
const downloadBtn = required<HTMLButtonElement>("#download-unlocked");
const resetBtn = required<HTMLButtonElement>("#reset");

type ReadyFile = {
  fileName: string;
  bytes: Uint8Array;
  pageCount: number;
  removedPassword: boolean;
};

let selected: File | null = null;
let ready: ReadyFile | null = null;
let requestId = 0;
let sessionPromise: Promise<UnlockSession> | null = null;

dropzone.addEventListener("click", (event) => {
  if (event.target === fileInput) return;
  fileInput.click();
});

dropzone.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    fileInput.click();
  }
});

fileInput.addEventListener("change", () => {
  const file = fileInput.files?.[0];
  if (file) void acceptFile(file);
});

for (const eventName of ["dragenter", "dragover"] as const) {
  dropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropzone.classList.add("is-over");
  });
}

dropzone.addEventListener("dragleave", (event) => {
  const next = event.relatedTarget;
  if (next instanceof Node && dropzone.contains(next)) return;
  dropzone.classList.remove("is-over");
});

dropzone.addEventListener("drop", (event) => {
  event.preventDefault();
  dropzone.classList.remove("is-over");
  const file = event.dataTransfer?.files[0];
  if (file) void acceptFile(file);
});

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const file = selected;
  if (!file) return;
  const password = passwordInput.value;
  if (password.length === 0) {
    showStatus("Enter the password for this PDF.", "error");
    passwordInput.focus();
    return;
  }
  void unlock(file, password);
});

togglePasswordBtn.addEventListener("click", () => {
  const show = passwordInput.type === "password";
  passwordInput.type = show ? "text" : "password";
  togglePasswordBtn.textContent = show ? "Hide" : "Show";
  togglePasswordBtn.setAttribute("aria-pressed", String(show));
  togglePasswordBtn.setAttribute(
    "aria-label",
    show ? "Hide password" : "Show password",
  );
  passwordInput.focus();
});

passwordInput.addEventListener("input", () => {
  passwordInput.removeAttribute("aria-invalid");
});

changeFileBtn.addEventListener("click", () => {
  reset({ pick: true });
});

downloadBtn.addEventListener("click", () => {
  if (!ready) return;
  downloadBytes(ready.bytes, ready.fileName);
});

resetBtn.addEventListener("click", () => {
  reset();
});

trySampleBtn.addEventListener("click", () => {
  void loadSample();
});

window.addEventListener("pagehide", () => {
  void sessionPromise?.then((session) => session.close()).catch(() => {});
});

function getSession(): Promise<UnlockSession> {
  sessionPromise ??= openUnlockSession().catch((error: unknown) => {
    sessionPromise = null;
    throw error;
  });
  return sessionPromise;
}

async function acceptFile(file: File, hint?: string): Promise<void> {
  if (!isPdf(file)) {
    showStatus("Please choose a PDF file.", "error");
    fileInput.value = "";
    return;
  }

  const id = ++requestId;
  selected = file;
  ready = null;
  dropzone.hidden = true;
  sampleRow.hidden = true;
  form.hidden = true;
  resultsEl.hidden = true;
  showStatus("Reading PDF…", "busy");

  try {
    const session = await getSession();
    if (id !== requestId) return;
    const inspection = await session.inspect(file);
    if (id !== requestId) return;

    if (inspection.status === "open") {
      showReady({
        fileName: unlockedFileName(file.name, false),
        bytes: inspection.bytes,
        pageCount: inspection.pageCount,
        removedPassword: false,
      });
      return;
    }

    showForm(
      file,
      hint ??
        (inspection.status === "restricted"
          ? "This PDF opens, but protection is still attached. Enter the password to remove it. The password stays in this browser."
          : undefined),
    );
    showStatus("", "idle");
  } catch (error) {
    if (id !== requestId) return;
    selected = null;
    showChooser();
    showStatus(messageFrom(error, "Could not read that PDF."), "error");
  } finally {
    fileInput.value = "";
  }
}

async function unlock(file: File, password: string): Promise<void> {
  const id = ++requestId;
  setBusy(true);
  showStatus("Removing the password…", "busy");

  try {
    const session = await getSession();
    if (id !== requestId) return;
    const unlocked = await session.unlock(file, password);
    if (id !== requestId) return;
    passwordInput.value = "";
    showReady({
      fileName: unlockedFileName(file.name, true),
      bytes: unlocked.bytes,
      pageCount: unlocked.pageCount,
      removedPassword: true,
    });
  } catch (error) {
    if (id !== requestId) return;
    setBusy(false);
    const wrongPassword =
      error instanceof UnlockError && error.code === "wrong-password";
    showStatus(
      messageFrom(error, "Could not remove the password from that PDF."),
      "error",
    );
    if (wrongPassword) {
      passwordInput.setAttribute("aria-invalid", "true");
      passwordInput.focus();
      passwordInput.select();
    }
  }
}

async function loadSample(): Promise<void> {
  showStatus("Loading sample…", "busy");
  try {
    const response = await fetch(
      `${import.meta.env.BASE_URL}sample-locked.pdf`,
    );
    if (!response.ok) throw new Error("Could not load the sample PDF.");
    const blob = await response.blob();
    const file = new File([blob], "sample-locked.pdf", {
      type: "application/pdf",
    });
    await acceptFile(file, "The sample password is sample.");
  } catch (error) {
    showChooser();
    showStatus(
      error instanceof Error ? error.message : "Could not load the sample PDF.",
      "error",
    );
  }
}

function showForm(file: File, hint?: string): void {
  fileNameEl.textContent = file.name;
  fileSizeEl.textContent = formatFileSize(file.size);
  passwordHint.textContent =
    hint ??
    "Enter the password you use to open this PDF. It stays in this browser and is only used to unlock the file.";
  passwordInput.value = "";
  passwordInput.type = "password";
  passwordInput.removeAttribute("aria-invalid");
  togglePasswordBtn.textContent = "Show";
  togglePasswordBtn.setAttribute("aria-pressed", "false");
  togglePasswordBtn.setAttribute("aria-label", "Show password");
  setBusy(false);
  form.hidden = false;
  passwordInput.focus();
}

function showReady(file: ReadyFile): void {
  ready = file;
  selected = null;
  form.hidden = true;
  dropzone.hidden = true;
  sampleRow.hidden = true;
  resultsTitle.textContent = file.fileName;
  resultsMeta.textContent = file.removedPassword
    ? `Password removed · ${pageLabel(file.pageCount)}`
    : `No password on this file · ${pageLabel(file.pageCount)}`;
  preview.replaceChildren();
  preview.textContent = "1";
  resultsEl.hidden = false;
  showStatus("", "idle");
  downloadBtn.focus();

  const bytes = file.bytes;
  void import("./thumbnails")
    .then(({ renderPageThumbnail }) => renderPageThumbnail(bytes, 1, 200))
    .then((canvas) => {
      if (ready?.bytes !== bytes) return;
      preview.replaceChildren(canvas);
    })
    .catch(() => {
      if (ready?.bytes !== bytes) return;
      preview.textContent = "1";
    });
}

function showChooser(): void {
  dropzone.hidden = false;
  sampleRow.hidden = false;
  form.hidden = true;
  resultsEl.hidden = true;
}

function reset(options?: { pick?: boolean }): void {
  requestId += 1;
  selected = null;
  ready = null;
  passwordInput.value = "";
  passwordInput.removeAttribute("aria-invalid");
  setBusy(false);
  showChooser();
  showStatus("", "idle");
  fileInput.value = "";
  if (options?.pick) fileInput.click();
}

function setBusy(busy: boolean): void {
  submitBtn.disabled = busy;
  passwordInput.disabled = busy;
  changeFileBtn.disabled = busy;
  togglePasswordBtn.disabled = busy;
  submitBtn.textContent = busy ? "Removing password…" : "Remove password";
}

type StatusKind = "idle" | "busy" | "error" | "done";

function showStatus(message: string, kind: StatusKind): void {
  if (!message) {
    statusEl.hidden = true;
    statusEl.textContent = "";
    statusEl.dataset.kind = "idle";
    return;
  }
  statusEl.hidden = false;
  statusEl.textContent = message;
  statusEl.dataset.kind = kind;
}

function messageFrom(error: unknown, fallback: string): string {
  return error instanceof UnlockError ? error.message : fallback;
}

function pageLabel(count: number): string {
  return count === 1 ? "1 page" : `${count} pages`;
}

function isPdf(file: File): boolean {
  return file.type.includes("pdf") || file.name.toLowerCase().endsWith(".pdf");
}
