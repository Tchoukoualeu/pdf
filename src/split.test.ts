import { PDFDocument, StandardFonts } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { pageFileName, splitPdf } from "./split";

async function makePdf(pageCount: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);

  for (let i = 0; i < pageCount; i++) {
    const page = doc.addPage([400, 300]);
    page.drawText(`Page ${i + 1}`, {
      x: 40,
      y: 150,
      size: 24,
      font,
    });
  }

  return doc.save();
}

describe("splitPdf", () => {
  it("returns one single-page PDF for each source page", async () => {
    const source = await makePdf(3);
    const result = await splitPdf(source);

    expect(result).toHaveLength(3);
    expect(result.map((page) => page.pageNumber)).toEqual([1, 2, 3]);

    for (const page of result) {
      const doc = await PDFDocument.load(page.bytes);
      expect(doc.getPageCount()).toBe(1);
    }
  });

  it("returns a single file when the source has one page", async () => {
    const source = await makePdf(1);
    const result = await splitPdf(source);
    expect(result).toHaveLength(1);
    expect((await PDFDocument.load(result[0].bytes)).getPageCount()).toBe(1);
  });
});

describe("pageFileName", () => {
  it("uses the original name and pads page numbers", () => {
    expect(pageFileName("report.pdf", 3, 12)).toBe("report-page-03.pdf");
    expect(pageFileName("notes", 1, 3)).toBe("notes-page-1.pdf");
  });
});
