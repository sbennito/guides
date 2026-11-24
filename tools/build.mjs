// Builds lgkm.org/guides/ from guides/ into public/guides/.
// Usage: node tools/build.mjs          writes the pages
//        node tools/build.mjs --check  fails if public/guides/ differs from a fresh build (CI runs this)
// guides/series.json lists each series and its guides in order. A guide is written when guides/<series>/<nn>-<slug>.md
// exists, with front matter (title, summary, eli5: the guide in one plain sentence, topic: one of the lgkm.org topics,
// lab: the lab step it builds or "none") and a Markdown body. A planned guide shows on its series page without a link.
// A line {figure: <name>} places guides/<series>/img/<name>.svg inline, so the drawing can use the page's tokens
// (var(--ink) and the rest) and follows the light and dark themes. Links in a guide may be root-relative (/notes/):
// they are rewritten relative to the page, because every lgkm.org section uses relative links. No dependencies.
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "public", "guides");
const ORIGIN = "https://lgkm.org";
const REPO = "https://github.com/sbennito/guides";
const DISCLAIMER = "Personal work and my own view, not my employer's. Tools named here are free or have a free tier; I have no tie to any of them.";
const TOPICS = { architecture: "Architecture and strategy", identity: "Identity and access", network: "Network and segmentation", exposure: "Exposure and threat", data: "Data protection", cloud: "Cloud and platforms", ai: "AI", resilience: "Resilience and regulation" };

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// ---- Markdown (the subset the guides use: headings, paragraphs, lists, quotes, code, pipe tables, inline figures) ----

function rewriteUrl(url, depth) {
  if (/^[a-z][a-z0-9+.-]*:/i.test(url) || url.startsWith("#") || url.startsWith("//")) return url;
  if (url.startsWith("/")) return "../".repeat(depth) + url.slice(1);
  return url;
}

function inline(text, depth) {
  const codes = [];
  let t = esc(text).replace(/`([^`]+)`/g, (_, c) => `\u0000${codes.push(c) - 1}\u0000`);
  t = t.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, url) => {
    const external = /^https?:/i.test(url);
    return `<a href="${rewriteUrl(url, depth)}"${external ? ' rel="noopener"' : ""}>${label}</a>`;
  });
  t = t.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/(^|[\s(])\*([^*\s][^*]*)\*(?=[\s).,;:!?]|$)/g, "$1<em>$2</em>");
  return t.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codes[Number(i)]}</code>`);
}

const cells = (row) => row.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());

function markdown(src, depth, imgDir, file) {
  const lines = src.replace(/\r\n/g, "\n").split("\n");
  const out = [];
  let i = 0;
  const blockStart = (l) => /^(#{2,3} |[-*] |\d+\. |> |```|\||\{figure:)/.test(l);
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    let m;
    if (line.startsWith("```")) {
      const code = [];
      for (i++; i < lines.length && !lines[i].startsWith("```"); i++) code.push(lines[i]);
      i++;
      out.push(`<pre><code>${esc(code.join("\n"))}</code></pre>`);
    } else if ((m = line.match(/^\{figure:\s*([a-z0-9-]+)\s*\}$/))) {
      const svgFile = join(imgDir, `${m[1]}.svg`);
      if (!existsSync(svgFile)) throw new Error(`${file}: {figure: ${m[1]}} needs ${svgFile}`);
      out.push(`<figure class="lg-figure">${readFileSync(svgFile, "utf8").trim()}</figure>`);
      i++;
    } else if ((m = line.match(/^(#{2,3}) (.+)$/))) {
      const level = m[1].length;
      const id = m[2].toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      out.push(`<h${level} id="${id}">${inline(m[2], depth)}</h${level}>`);
      i++;
    } else if (line.startsWith("|")) {
      const rows = [];
      while (i < lines.length && lines[i].startsWith("|")) rows.push(lines[i++]);
      const [head, , ...body] = rows;
      out.push(`<div class="lg-table-wrap"><table class="lg-table"><thead><tr>${cells(head).map((c) => `<th>${inline(c, depth)}</th>`).join("")}</tr></thead><tbody>${body.map((r) => `<tr>${cells(r).map((c) => `<td>${inline(c, depth)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`);
    } else if (/^[-*] /.test(line) || /^\d+\. /.test(line)) {
      const ordered = /^\d+\. /.test(line), items = [];
      while (i < lines.length && (ordered ? /^\d+\. / : /^[-*] /).test(lines[i])) items.push(inline(lines[i++].replace(/^([-*]|\d+\.) /, ""), depth));
      out.push(`<${ordered ? "ol" : "ul"}>${items.map((x) => `<li>${x}</li>`).join("")}</${ordered ? "ol" : "ul"}>`);
    } else if (line.startsWith("> ")) {
      const quote = [];
      while (i < lines.length && lines[i].startsWith("> ")) quote.push(lines[i++].slice(2));
      out.push(`<blockquote><p>${inline(quote.join(" "), depth)}</p></blockquote>`);
    } else {
      const para = [];
      while (i < lines.length && lines[i].trim() && !blockStart(lines[i])) para.push(lines[i++]);
      out.push(`<p>${inline(para.join(" "), depth)}</p>`);
    }
  }
  return out.join("\n");
}

function frontMatter(file, text, keys) {
  const m = text.replace(/\r\n/g, "\n").match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) throw new Error(`${file}: needs front matter between --- lines`);
  const meta = Object.fromEntries(m[1].split("\n").map((l) => l.match(/^([a-z0-9]+):\s*(.*)$/)).filter(Boolean).map((x) => [x[1], x[2].trim().replace(/^(["'])(.*)\1$/, "$2")]));
  for (const key of keys) if (!meta[key]) throw new Error(`${file}: front matter needs ${key}`);
  if (!TOPICS[meta.topic]) throw new Error(`${file}: topic "${meta.topic}" is not an lgkm.org topic (${Object.keys(TOPICS).join(", ")})`);
  return { meta, body: m[2] };
}

// ---- Pages ----

const CSS = `/* Generated by tools/build.mjs. The tokens and components come from tokens.css and lg.css (copies from sbennito/branding). */
@font-face{font-family:"Instrument Sans";src:url(../../shared/fonts/instrument-sans.woff2) format("woff2");font-weight:400 700;font-style:normal;font-display:swap}
@font-face{font-family:"JetBrains Mono";src:url(../../shared/fonts/jetbrains-mono.woff2) format("woff2");font-weight:400 500;font-style:normal;font-display:swap}
body{padding:0 var(--space-4) var(--space-16)}
p{max-width:none}
lgkm-nav{display:block;max-width:760px;min-height:38px;margin:0 auto var(--space-12)}
main{max-width:760px;margin:0 auto}
p,ul,ol,blockquote,figure,pre{margin:0}
main>*+*{margin-top:var(--space-4)}
h2{margin-top:var(--space-8)}
h3{margin-top:var(--space-6)}
ul,ol{padding-left:22px;display:flex;flex-direction:column;gap:var(--space-2)}
blockquote{border-left:2px solid var(--line-strong);padding-left:var(--space-4);color:var(--ink-muted)}
pre{overflow-x:auto;padding:var(--space-4);border:1px solid var(--line);border-radius:var(--radius-md);background:var(--surface-sunken);font-family:var(--font-mono);font-size:14px;line-height:22px}
.lg-eyebrow a{color:inherit}
.lg-eyebrow+h1{margin-top:var(--space-2)}
.list{list-style:none;padding:0;gap:0;border-top:1px solid var(--line)}
.list li{padding:var(--space-4) 0;border-bottom:1px solid var(--line);display:flex;flex-direction:column;gap:var(--space-1)}
.list .title{color:var(--ink);font-size:18px;line-height:26px;font-weight:600}
.list a.title{text-decoration:none}
.list a.title:hover,.list a.title:focus-visible{color:var(--signal-ink);text-decoration:underline}
.list p{color:var(--ink-muted);font-size:15px;line-height:24px}
.small{font-size:15px;line-height:24px;color:var(--ink-muted)}
.foot{color:var(--ink-muted);font-size:15px;line-height:24px;border-top:1px solid var(--line);padding-top:var(--space-4);margin-top:var(--space-12)}
.fig text{fill:var(--ink);font-family:var(--font-sans);font-size:13px}
.fig .title{font-size:15px;font-weight:600}
.fig .name{font-weight:600}
.fig .muted{fill:var(--ink-muted);font-size:12px}
.fig .box{fill:none;stroke:var(--line-strong);stroke-width:1.25}
.fig .dash{stroke-dasharray:5 4}
.fig .hi{fill:var(--signal-tint);stroke:var(--signal);stroke-width:2}
.fig .edge{fill:none;stroke:var(--line-strong);stroke-width:1.25}
.fig .arrow{fill:var(--line-strong)}
.lg-footer{margin:var(--space-16) calc(-1 * var(--space-4)) calc(-1 * var(--space-16))}
`;

function page({ title, description, depth, body, canonical, type = "website" }) {
  const up = "../".repeat(depth);
  const assets = "../".repeat(depth - 1) + "assets/";
  return `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta name="robots" content="noindex,nofollow">
<meta property="og:type" content="${type}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${ORIGIN}${canonical}">
<meta property="og:image" content="https://lgkm.org/shared/og-card.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="lgkm: security leadership, architecture, and things built at home.">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="${up}favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="${up}apple-touch-icon.png">
<link rel="stylesheet" href="${assets}tokens.css">
<link rel="stylesheet" href="${assets}lg.css">
<link rel="stylesheet" href="${assets}guides.css">
</head>
<body>
<lgkm-nav><a href="${up}">lgkm.org</a></lgkm-nav>
<script src="https://lgkm.org/shared/nav.js" defer></script>
<main>
${body}
<p class="foot">${DISCLAIMER}</p>
</main>
<footer class="lg-footer"><div class="lg-footer-inner"><span>lgkm.org</span><a href="${up}cookies/">Cookies: none set by this site</a></div></footer>
</body>
</html>
`;
}

function load() {
  const { series } = JSON.parse(readFileSync(join(ROOT, "guides", "series.json"), "utf8"));
  for (const s of series) {
    const dir = join(ROOT, "guides", s.id);
    const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".md")) : [];
    for (const f of files) {
      const m = f.match(/^(\d{2})-([a-z0-9-]+)\.md$/);
      if (!m) throw new Error(`guides/${s.id}/${f}: name it <nn>-<slug>.md`);
      const g = s.guides.find((x) => x.slug === m[2]);
      if (!g || g.n !== Number(m[1])) throw new Error(`guides/${s.id}/${f}: not in guides/series.json as number ${Number(m[1])}, slug ${m[2]}`);
      const { meta, body } = frontMatter(`guides/${s.id}/${f}`, readFileSync(join(dir, f), "utf8"), ["title", "summary", "eli5", "topic", "lab"]);
      Object.assign(g, meta, { body, file: `guides/${s.id}/${f}`, written: true });
    }
  }
  return series;
}

function guidePage(s, g) {
  const written = s.guides.filter((x) => x.written);
  const at = written.indexOf(g);
  const prev = written[at - 1], next = written[at + 1];
  const nav = [prev && `<li><span class="lg-eyebrow">Previous</span><a class="title" href="../${prev.slug}/">${prev.n}. ${esc(prev.title)}</a></li>`, next && `<li><span class="lg-eyebrow">Next</span><a class="title" href="../${next.slug}/">${next.n}. ${esc(next.title)}</a></li>`].filter(Boolean);
  const lab = g.lab === "none" ? "" : `<p class="small">This guide builds lab step ${esc(g.lab)}: <a href="${REPO}/tree/main/lab" rel="noopener">the lab on GitHub</a>.</p>`;
  const body = `<p class="lg-eyebrow"><a href="../../">Guides</a> · <a href="../">${esc(s.label)}</a> · Guide ${g.n} · <a href="../../../topics/${g.topic}/">${esc(TOPICS[g.topic])}</a></p>
<h1>${esc(g.title)}</h1>
<p class="lg-lede">${esc(g.summary)}</p>
<div class="lg-callout"><p class="lg-callout-label">In plain words</p><p class="lg-callout-body">${esc(g.eli5)}</p></div>
${lab}
${markdown(g.body, 3, join(ROOT, "guides", s.id, "img"), g.file)}
${nav.length ? `<ul class="list">${nav.join("")}</ul>` : ""}
<p class="small"><a href="../">All ${esc(s.label)} guides</a></p>`;
  return page({ title: `${g.title} · lgkm.org guides`, description: g.summary, depth: 3, body, canonical: `/guides/${s.id}/${g.slug}/`, type: "article" });
}

function seriesPage(s) {
  const items = s.guides.map((g) => g.written
    ? `<li><span class="lg-eyebrow">Guide ${g.n}</span><a class="title" href="${g.slug}/">${esc(g.title)}</a><p>${esc(g.question)}</p></li>`
    : `<li><span class="lg-eyebrow">Guide ${g.n} · coming</span><span class="title">${esc(g.title)}</span><p>${esc(g.question)}</p></li>`).join("\n");
  const body = `<p class="lg-eyebrow"><a href="../">Guides</a></p>
<h1>${esc(s.label)}</h1>
<p class="lg-lede">${esc(s.summary)}</p>
${s.guides.length ? `<ul class="list">\n${items}\n</ul>` : "<p>The first guides in this series follow the See series.</p>"}`;
  return page({ title: `${s.label} · lgkm.org guides`, description: s.summary, depth: 2, body, canonical: `/guides/${s.id}/` });
}

function indexPage(series) {
  const items = series.map((s) => `<li><span class="lg-eyebrow">${s.guides.filter((g) => g.written).length} of ${s.guides.length || "a few"} written</span><a class="title" href="${s.id}/">${esc(s.label)}</a><p>${esc(s.summary)}</p></li>`).join("\n");
  const body = `<h1>Guides</h1>
<p class="lg-lede">How-to guides in three series: see, then understand, then control. Each guide uses free or freemium tools and builds one step of a lab you can run on your own computer: a small, made-up retailer called Cairnmoor Outdoor.</p>
<ul class="list">
${items}
</ul>
<p class="small">The guide text and the lab are public at <a href="${REPO}" rel="noopener">github.com/sbennito/guides</a>. Shorter pieces are in the <a href="../notes/">field notes</a>.</p>`;
  return page({ title: "Guides · lgkm.org", description: "How-to guides on seeing, understanding and controlling IT and security, with free tools and a lab you can run.", depth: 1, body, canonical: "/guides/" });
}

function build() {
  const series = load();
  const files = new Map();
  files.set("index.html", indexPage(series));
  files.set("assets/guides.css", CSS);
  files.set("assets/tokens.css", readFileSync(join(ROOT, "site", "tokens.css"), "utf8"));
  files.set("assets/lg.css", readFileSync(join(ROOT, "site", "lg.css"), "utf8"));
  for (const s of series) {
    files.set(`${s.id}/index.html`, seriesPage(s));
    for (const g of s.guides.filter((x) => x.written)) files.set(`${s.id}/${g.slug}/index.html`, guidePage(s, g));
  }
  return files;
}

function walk(dir, base = dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p, base) : [p.slice(base.length + 1)];
  });
}

const files = build();
if (process.argv.includes("--check")) {
  const stale = [...files].filter(([f, text]) => !existsSync(join(OUT, f)) || readFileSync(join(OUT, f), "utf8") !== text).map(([f]) => f);
  const extra = walk(OUT).filter((f) => !files.has(f));
  if (stale.length || extra.length) {
    console.error(`public/guides/ is out of date; run node tools/build.mjs.\n${[...stale.map((f) => `  differs: ${f}`), ...extra.map((f) => `  not built: ${f}`)].join("\n")}`);
    process.exit(1);
  }
  console.log(`public/guides/ is up to date (${files.size} files).`);
} else {
  rmSync(OUT, { recursive: true, force: true });
  for (const [f, text] of files) {
    mkdirSync(dirname(join(OUT, f)), { recursive: true });
    writeFileSync(join(OUT, f), text);
  }
  console.log(`Wrote ${files.size} files to public/guides/.`);
}
