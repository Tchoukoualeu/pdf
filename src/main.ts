import { downloadBytes, downloadZip } from "./download";
import "./style.css";
import { pageFileName, splitPdf, type SplitPage } from "./split";

function required<T extends Element>(selector: string): T {
  const node = document.querySelector<T>(selector);
  if (!node) throw new Error(`Missing ${selector}`);
  return node;
}

const dropzone = required<HTMLElement>("#dropzone");
const fileInput = required<HTMLInputElement>("#file-input");
const statusEl = required<HTMLDivElement>("#status");
const resultsEl = required<HTMLElement>("#results");
const resultsTitle = required<HTMLParagraphElement>("#results-title");
const resultsMeta = required<HTMLParagraphElement>("#results-meta");
const pageGrid = required<HTMLUListElement>("#page-grid");
const downloadAllBtn = required<HTMLButtonElement>("#download-all");
const resetBtn = required<HTMLButtonElement>("#reset");
const trySampleBtn = required<HTMLButtonElement>("#try-sample");
const sampleRow = required<HTMLElement>("#sample-row");

type AppState = {
  fileName: string;
  pages: SplitPage[];
};

let state: AppState | null = null;

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
  if (file) void handleFile(file);
});

dropzone.addEventListener("dragenter", (event) => {
  event.preventDefault();
  dropzone.classList.add("is-over");
});

dropzone.addEventListener("dragover", (event) => {
  event.preventDefault();
  dropzone.classList.add("is-over");
});

dropzone.addEventListener("dragleave", (event) => {
  // Ignore the dragleave that fires when moving between child elements.
  const next = event.relatedTarget;
  if (next instanceof Node && dropzone.contains(next)) return;
  dropzone.classList.remove("is-over");
});

dropzone.addEventListener("drop", (event) => {
  event.preventDefault();
  dropzone.classList.remove("is-over");
  const file = event.dataTransfer?.files[0];
  if (file) void handleFile(file);
});

downloadAllBtn.addEventListener("click", () => {
  const current = state;
  if (!current) return;
  const files = current.pages.map((page) => ({
    name: pageFileName(current.fileName, page.pageNumber, current.pages.length),
    bytes: page.bytes,
  }));
  const zipName = `${current.fileName.replace(/\.pdf$/i, "") || "document"}-pages.zip`;
  void downloadZip(files, zipName);
});

resetBtn.addEventListener("click", reset);
trySampleBtn.addEventListener("click", () => {
  void loadSample();
});

async function handleFile(file: File): Promise<void> {
  if (!file.type.includes("pdf") && !file.name.toLowerCase().endsWith(".pdf")) {
    showStatus("Please choose a PDF file.", "error");
    return;
  }

  dropzone.hidden = true;
  sampleRow.hidden = true;
  resultsEl.hidden = true;
  showStatus("Splitting pages…", "busy");

  try {
    const buffer = await file.arrayBuffer();
    const pages = await splitPdf(buffer);

    if (pages.length === 0) {
      throw new Error("This PDF has no pages.");
    }

    state = { fileName: file.name, pages };
    renderResults();
    showStatus(
      pages.length === 1
        ? "Done. This PDF has 1 page, so you get 1 file."
        : `Done. Split into ${pages.length} separate PDF files.`,
      "done",
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not read that PDF.";
    showStatus(message, "error");
    dropzone.hidden = false;
    sampleRow.hidden = false;
    state = null;
  } finally {
    fileInput.value = "";
  }
}

function renderResults(): void {
  if (!state) return;

  const { fileName, pages } = state;
  resultsTitle.textContent = fileName;
  resultsMeta.textContent =
    pages.length === 1
      ? "1 page → 1 PDF"
      : `${pages.length} pages → ${pages.length} PDFs`;

  pageGrid.replaceChildren();

  for (const [index, page] of pages.entries()) {
    const name = pageFileName(fileName, page.pageNumber, pages.length);
    const item = document.createElement("li");
    item.className = "page-card";
    item.style.setProperty("--i", String(Math.min(index, 12)));

    const preview = document.createElement("div");
    preview.className = "page-preview";
    preview.setAttribute("aria-hidden", "true");

    const label = document.createElement("p");
    label.className = "page-label";
    label.textContent = `Page ${page.pageNumber}`;

    const fileLabel = document.createElement("p");
    fileLabel.className = "page-file";
    fileLabel.textContent = name;

    const button = document.createElement("button");
    button.type = "button";
    button.className = "btn btn-small";
    button.textContent = "Download";
    button.addEventListener("click", () => downloadBytes(page.bytes, name));

    item.append(preview, label, fileLabel, button);
    pageGrid.append(item);

    void import("./thumbnails")
      .then(({ renderPageThumbnail }) => renderPageThumbnail(page.bytes, 1))
      .then((canvas) => {
        preview.replaceChildren(canvas);
      })
      .catch(() => {
        preview.textContent = String(page.pageNumber);
      });
  }

  resultsEl.hidden = false;
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

function reset(): void {
  state = null;
  pageGrid.replaceChildren();
  resultsEl.hidden = true;
  dropzone.hidden = false;
  sampleRow.hidden = false;
  showStatus("", "idle");
  fileInput.value = "";
}

async function loadSample(): Promise<void> {
  const response = await fetch(
    `${import.meta.env.BASE_URL}sample-3-pages.pdf`,
  );
  if (!response.ok) {
    showStatus("Could not load the sample PDF.", "error");
    return;
  }
  const blob = await response.blob();
  const file = new File([blob], "sample-3-pages.pdf", {
    type: "application/pdf",
  });
  await handleFile(file);
}
