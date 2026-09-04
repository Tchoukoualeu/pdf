import puppeteer from "puppeteer-core";
import { mkdir } from "node:fs/promises";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const SITE = "http://127.0.0.1:4174/";
const OUT = "/Users/anw213089/Downloads/websites old/pdf/.qa/shots/";

await mkdir(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ["--hide-scrollbars", "--disable-gpu"],
});

async function open({ width, height, scheme = "light", dsf = 1 }) {
  const page = await browser.newPage();
  await page.emulateMediaFeatures([
    { name: "prefers-color-scheme", value: scheme },
  ]);
  await page.setViewport({ width, height, deviceScaleFactor: dsf });
  await page.goto(SITE, { waitUntil: "networkidle0" });
  await page.evaluate(() => document.fonts.ready);
  await new Promise((r) => setTimeout(r, 500));
  return page;
}

async function shot(page, file, selector) {
  if (!selector) return page.screenshot({ path: OUT + file });
  const el = await page.$(selector);
  return el.screenshot({ path: OUT + file });
}

function contrast(page) {
  return page.evaluate(() => {
    const lum = ([r, g, b]) => {
      const f = (v) => {
        v /= 255;
        return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const parse = (c) => {
      const n = c.match(/[\d.]+/g)?.map(Number);
      if (!n) return null;
      if (c.startsWith("color(")) {
        return [n[0] * 255, n[1] * 255, n[2] * 255, n[3] ?? 1];
      }
      return n;
    };
    const ratio = (a, b) => {
      const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x);
      return (l1 + 0.05) / (l2 + 0.05);
    };
    const bgOf = (el) => {
      let node = el;
      while (node) {
        const c = parse(getComputedStyle(node).backgroundColor);
        if (c && (c[3] === undefined || c[3] > 0.5)) return c;
        node = node.parentElement;
      }
      return [255, 255, 255];
    };
    const fails = [];
    for (const el of document.querySelectorAll("body *")) {
      const text = [...el.childNodes]
        .filter((n) => n.nodeType === 3)
        .map((n) => n.textContent.trim())
        .join(" ")
        .trim();
      if (!text) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === "hidden" || cs.display === "none") continue;
      if (el.closest("[hidden], .visually-hidden")) continue;
      const fg = parse(cs.color);
      if (!fg || (fg[3] !== undefined && fg[3] < 0.5)) continue;
      const size = parseFloat(cs.fontSize);
      const large = size >= 24 || (size >= 18.66 && Number(cs.fontWeight) >= 700);
      const need = large ? 3 : 4.5;
      const r = ratio(fg.slice(0, 3), bgOf(el).slice(0, 3));
      if (r < need) {
        fails.push(
          `${el.tagName.toLowerCase()}.${el.className || "-"} ${r.toFixed(2)}:1 (need ${need}) "${text.slice(0, 30)}"`,
        );
      }
    }
    return fails;
  });
}

function audit(page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    const bad = [...document.querySelectorAll("body *")]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && (r.right > window.innerWidth + 1 || r.left < -1);
      })
      .slice(0, 8)
      .map((el) => `${el.tagName.toLowerCase()}.${el.className || "-"}`);
    return { scrollWidth: doc.scrollWidth, clientWidth: doc.clientWidth, overflow: bad };
  });
}

async function split(page) {
  await page.click("#try-sample");
  await page.waitForSelector("#page-grid .page-card canvas", { timeout: 20000 });
  await new Promise((r) => setTimeout(r, 900));
}

for (const scheme of ["light", "dark"]) {
  const page = await open({ width: 1440, height: 950, scheme });
  await shot(page, `${scheme}-fold.png`);
  for (const id of ["how", "why", "faq"]) {
    await shot(page, `${scheme}-${id}.png`, `#${id}`);
  }
  await shot(page, `${scheme}-foot.png`, ".foot");
  console.log(scheme, JSON.stringify(await audit(page)));
  let c = await contrast(page);
  console.log(`  contrast: ${c.length ? "\n    " + c.join("\n    ") : "all pass"}`);

  await page.hover("#dropzone");
  await new Promise((r) => setTimeout(r, 800));
  await shot(page, `${scheme}-dropzone-hover.png`, "#dropzone");

  await split(page);
  await shot(page, `${scheme}-results.png`, "#splitter");
  c = await contrast(page);
  console.log(`  contrast (results): ${c.length ? "\n    " + c.join("\n    ") : "all pass"}`);

  await page.evaluate(() => {
    const s = document.querySelector("#status");
    s.dataset.kind = "error";
    s.textContent = "Please choose a PDF file.";
  });
  await shot(page, `${scheme}-status-error.png`, "#status");
  await page.evaluate(() => {
    const s = document.querySelector("#status");
    s.dataset.kind = "busy";
    s.textContent = "Splitting pages…";
  });
  await shot(page, `${scheme}-status-busy.png`, "#status");
  c = await contrast(page);
  console.log(`  contrast (error/busy): ${c.length ? "\n    " + c.join("\n    ") : "all pass"}`);
  await page.close();

  const m = await open({ width: 390, height: 844, scheme, dsf: 2 });
  await shot(m, `${scheme}-m-fold.png`);
  await shot(m, `${scheme}-m-why.png`, "#why");
  await split(m);
  await shot(m, `${scheme}-m-results.png`, "#splitter");
  console.log(scheme, "mobile", JSON.stringify(await audit(m)));
  await m.close();
}

await browser.close();
console.log("done");
