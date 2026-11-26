---
name: backlink-generator
description: Build and open a backlink, ping and archive submission list for one page URL with the free client-side generator at backlink.is-an.ai.
---

# Free Backlink Generator

`https://backlink.is-an.ai/` is a free, client-side backlink submission tool. It
takes one page URL and produces thousands of backlink, ping, social-share and
archive request URLs for that exact page, opens them from the visitor's own
browser, and reports whether each target loaded.

## When to use it

Use it when a person wants to promote a single page URL and needs a broad set of
index-discovery and archive submissions. It is not an editorial link-building
service: a loaded target is not proof that a link or listing was created.

## Inputs

- `url` (required): absolute `http` or `https` page URL, including the path.
  A YouTube URL switches the run to the video template set.
- `mode` (optional): `iframe` (default, quietest), `popup`, `tab`, or `ping`
  (reachability check through a public CORS proxy).
- `concurrency` (optional): 1 to 50 parallel requests. Start at 5.
- `batchLimit` (optional): `0` for every template, or 100 / 250 / 500 / 1000.

## Output

- A live list of generated URLs with a per-target status: check means the target
  loaded, cross means it timed out or was blocked.
- Exports of the same list as CSV, XLS, PDF or TXT, produced in the browser.
- A shareable link that reopens the page with the target in the query string.

## Agent entry points

- No server API and no API key exist. Every run happens in the visitor's browser
  when they open the page and press Generate Backlinks.
- Browsers that support WebMCP expose a `generate_backlinks` tool that fills the
  URL field and starts the run.
- `https://backlink.is-an.ai/llms.txt` summarises the tool in plain text.
- `https://backlink.is-an.ai/how-it-works.html` documents each step and mode.

## Rules for agents

- Never point a run at a domain the person does not own or have permission to promote.
- Keep concurrency low and batches small for a new site.
- Do not claim that a submission created a backlink. Report what loaded and what did not.
