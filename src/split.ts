import { PDFDocument } from "pdf-lib";

export type SplitPage = {
  pageNumber: number;
  bytes: Uint8Array;
};

export async function splitPdf(
  input: ArrayBuffer | Uint8Array,
): Promise<SplitPage[]> {
  const src = await PDFDocument.load(input);
  const pageCount = src.getPageCount();
  const pages: SplitPage[] = [];

  for (let i = 0; i < pageCount; i++) {
    const out = await PDFDocument.create();
    const [copied] = await out.copyPages(src, [i]);
    out.addPage(copied);
    pages.push({
      pageNumber: i + 1,
      bytes: await out.save(),
    });
  }

  return pages;
}

export function pageFileName(
  originalName: string,
  pageNumber: number,
  pageCount: number,
): string {
  const base = originalName.replace(/\.pdf$/i, "") || "document";
  const width = String(pageCount).length;
  const n = String(pageNumber).padStart(width, "0");
  return `${base}-page-${n}.pdf`;
}
