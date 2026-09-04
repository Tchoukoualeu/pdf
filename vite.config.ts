import { writeFileSync } from "node:fs";
import { defineConfig } from "vitest/config";
import { SITE_URL } from "./seo.config";

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
    "</urlset>",
    "",
  ].join("\n"),
);

export default defineConfig({
  base: "/",
  test: {
    environment: "node",
  },
});
