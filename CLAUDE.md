# Guides

Served at `lgkm.org/guides/` by the Cloudflare Worker `guides`. The map of every lgkm.org section, and how routing
between them works, is in the CLAUDE.md of sbennito/lgkm-site. This repo is public.

- Cloudflare builds and deploys the Worker from the `main` branch on every push. Only `public/` is published, under
  `public/guides/`, because the Worker sees the full path including `/guides`.
- Guide pages are generated from Markdown in `guides/`: edit the Markdown, run the build, commit the result.
- Nothing links to a page without content: a series gets its page (and a place in the bar menu in sbennito/lgkm-site) only once it has a written guide, and a planned guide is listed without a link.
- The lab lives in `lab/`; each guide links to the lab step it builds.
- Links stay relative, never root-absolute. Every page carries the shared lgkm.org bar (`<lgkm-nav>` and
  `https://lgkm.org/shared/nav.js`); never hand-write it.
- Look and feel is the lgkm brand from sbennito/branding (read its `AGENTS.md` first): tokens only, one signal accent,
  sentence case, first person, `lgkm` lowercase, no hype.
- Never present banking or any sector as where the author works, and never name the employer. Pictures come after the
  words they explain.
- localStorage keys, if ever added, start with `guides-`.
- One change per pull request.
