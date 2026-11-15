import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { SITE_URL, UNLOCK_PATH } from "./seo.config";

const root = dirname(fileURLToPath(import.meta.url));

const origin = SITE_URL.replace(/\/$/, "");

writeFileSync(
  "public/robots.txt",
  ["User-agent: *", "Allow: /", `Sitemap: ${origin}/sitemap.xml`, ""].join("\n"),
);

writeFileSync(
  "public/sitemap.xml",
  [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    "  <url>",
    `    <loc>${origin}/</loc>`,
    `    <lastmod>${new Date().toISOString().slice(0, 10)}</lastmod>`,
    "    <changefreq>weekly</changefreq>",
    "    <priority>1.0</priority>",
    "  </url>",
    "  <url>",
    `    <loc>${origin}${UNLOCK_PATH}</loc>`,
    `    <lastmod>${new Date().toISOString().slice(0, 10)}</lastmod>`,
    "    <changefreq>weekly</changefreq>",
    "    <priority>0.8</priority>",
    "  </url>",
    "</urlset>",
    "",
  ].join("\n"),
);

export default defineConfig({
  base: "/",
  build: {
    rollupOptions: {
      input: {
        main: resolve(root, "index.html"),
        unlock: resolve(root, "remove-password/index.html"),
      },
    },
  },
  optimizeDeps: {
    exclude: ["@mssio/qpdf-wasm"],
  },
  test: {
    environment: "node",
  },
});
