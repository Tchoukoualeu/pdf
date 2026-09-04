import * as pdfjs from "pdfjs-dist";
import pdfjsWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjs.GlobalWorkerOptions.workerSrc = pdfjsWorker;

export async function renderPageThumbnail(
  data: Uint8Array,
  pageNumber: number,
  maxWidth = 220,
): Promise<HTMLCanvasElement> {
  const pdf = await pdfjs.getDocument({ data: data.slice() }).promise;
  const page = await pdf.getPage(pageNumber);
  const base = page.getViewport({ scale: 1 });
  const scale = maxWidth / base.width;
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Could not create canvas context");
  }

  await page.render({ canvasContext: context, viewport }).promise;
  await pdf.destroy();
  return canvas;
}
