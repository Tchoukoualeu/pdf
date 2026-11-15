import { readFile } from "node:fs/promises";
import { createQpdf } from "@mssio/qpdf-wasm";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { beforeAll, describe, expect, it } from "vitest";
import {
  formatFileSize,
  openUnlockSession,
  removePdfPassword,
  UnlockError,
  unlockedFileName,
} from "./unlock";

let encrypted: Uint8Array;

beforeAll(async () => {
  const doc = await PDFDocument.create();
  doc.setTitle("Unlock fixture");
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([300, 300]);
  page.drawText("Locked page", { x: 40, y: 150, size: 20, font });

  const qpdf = await createQpdf();
  try {
    encrypted = (
      await qpdf.encrypt(await doc.save(), {
        userPassword: "correct horse",
        ownerPassword: "owner horse",
      })
    ).output;
  } finally {
    qpdf.terminate();
  }
}, 20_000);

describe("removePdfPassword", () => {
  it("writes the same document with the password removed", async () => {
    const result = await removePdfPassword(encrypted, "correct horse");

    expect(result.removedPassword).toBe(true);
    expect(result.pageCount).toBe(1);
    const opened = await PDFDocument.load(result.bytes);
    expect(opened.getPageCount()).toBe(1);
    expect(opened.getTitle()).toBe("Unlock fixture");
  }, 20_000);

  it("accepts the owner password", async () => {
    const result = await removePdfPassword(encrypted, "owner horse");
    expect(result.removedPassword).toBe(true);
    expect((await PDFDocument.load(result.bytes)).getTitle()).toBe(
      "Unlock fixture",
    );
  }, 20_000);

  it("rejects a wrong password without repeating it", async () => {
    const password = "not-the-password";
    try {
      await removePdfPassword(encrypted, password);
      expect.fail("expected the password to be rejected");
    } catch (error) {
      expect(error).toBeInstanceOf(UnlockError);
      expect((error as UnlockError).code).toBe("wrong-password");
      expect((error as UnlockError).message).not.toContain(password);
    }
  }, 20_000);

  it("returns an open PDF unchanged", async () => {
    const doc = await PDFDocument.create();
    doc.setTitle("Open fixture");
    doc.addPage([200, 200]);
    const plain = await doc.save();

    const result = await removePdfPassword(plain, "unused");

    expect(result.removedPassword).toBe(false);
    expect(result.pageCount).toBe(1);
    expect((await PDFDocument.load(result.bytes)).getTitle()).toBe(
      "Open fixture",
    );
  }, 20_000);

  it("rejects a file that is not a PDF", async () => {
    await expect(
      removePdfPassword(new TextEncoder().encode("hello"), "x"),
    ).rejects.toMatchObject({ code: "not-pdf" });
  }, 20_000);

  it("unlocks an owner-restricted PDF with that password", async () => {
    const doc = await PDFDocument.create();
    doc.setTitle("Restricted fixture");
    doc.addPage([200, 200]);
    const qpdf = await createQpdf();
    let restricted: Uint8Array;
    try {
      restricted = (
        await qpdf.encrypt(await doc.save(), {
          userPassword: "",
          ownerPassword: "owner-only",
          allow: { modify: false },
        })
      ).output;
    } finally {
      qpdf.terminate();
    }

    const session = await openUnlockSession();
    try {
      await expect(session.inspect(restricted)).resolves.toMatchObject({
        status: "restricted",
        pageCount: 1,
      });
      const unlocked = await session.unlock(restricted, "owner-only");
      expect(unlocked.removedPassword).toBe(true);
      expect((await PDFDocument.load(unlocked.bytes)).getTitle()).toBe(
        "Restricted fixture",
      );
    } finally {
      session.close();
    }
  }, 20_000);

  it("unlocks the published sample", async () => {
    const sample = new Uint8Array(await readFile("public/sample-locked.pdf"));
    const result = await removePdfPassword(sample, "sample");
    expect(result.removedPassword).toBe(true);
    expect(result.pageCount).toBe(2);
    expect((await PDFDocument.load(result.bytes)).getTitle()).toBe(
      "Locked sample",
    );
  }, 20_000);
});

describe("unlockedFileName", () => {
  it("adds an unlocked suffix and keeps an open file's name", () => {
    expect(unlockedFileName("report.pdf")).toBe("report-unlocked.pdf");
    expect(unlockedFileName("Report.PDF")).toBe("Report-unlocked.pdf");
    expect(unlockedFileName("notes", true)).toBe("notes-unlocked.pdf");
    expect(unlockedFileName("report.PDF", false)).toBe("report.PDF");
    expect(unlockedFileName("notes", false)).toBe("notes.pdf");
    expect(unlockedFileName("  ", true)).toBe("document-unlocked.pdf");
  });
});

describe("formatFileSize", () => {
  it("formats bytes, kilobytes, and megabytes", () => {
    expect(formatFileSize(0)).toBe("0 B");
    expect(formatFileSize(900)).toBe("900 B");
    expect(formatFileSize(1536)).toBe("1.5 KB");
    expect(formatFileSize(20_480)).toBe("20 KB");
    expect(formatFileSize(1.5 * 1024 * 1024)).toBe("1.5 MB");
  });
});
