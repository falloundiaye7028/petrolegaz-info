# Actualités verification

## Local verification status — 3 October 2026

- **Passed:** all 14 offline regression suites, including the new API and DOM suites and the existing PostgreSQL/PGlite access-control suites; rerun against the final local code
- **Passed:** reader list/detail rendering logic, dates/source/metadata, pagination and previous page, filter/reset and Back/Forward state, focus after pagination, cursor recovery, empty/filtered-empty versus unavailable, retries, invalid or unpublished article IDs, unsafe URL rejection, inert HTML/XSS text, broken-photo removal, and menu Escape/outside-click behavior
- **Passed:** stale-response protection and timeout isolation, including a deliberately uncooperative fetch that ignores abort; the previous request's timeout does not abort the current request
- **Not run:** real-browser/layout assertions and screenshot capture. Installed Chromium could not start because the execution environment denied its local process socket (`socket() failed: Operation not permitted`). The supported cloud browser separately rejected the local preview URL with `net::ERR_BLOCKED_BY_CLIENT`. No UI screenshots are claimed or supplied
- **Not established by these tests:** live Airtable configuration, real editorial data, live photo rendering, desktop/mobile visual fit, browser accessibility-tree behavior, or deployed end-to-end success

All new publication fixtures are local test data explicitly labelled **TEST**. No fictional publications are inserted into Airtable or production. The browser harness intercepts external requests and serves fixture responses only.

### Preview HTTP checks

The coordinating task reported these read-only checks through the authorized Vercel connector against the first preview deployment on 3 October 2026:

- News list/detail HTML and their JavaScript/CSS assets returned HTTP 200
- The news API returned HTTP 503 while the required Airtable table was missing; this is an unavailable backend, not a verified empty newsroom
- Existing APIs still returned 60 PME and 8 notices, including 3 demonstration notices
- The preview browser required sign-in, so these HTTP checks do not establish rendered visual or end-to-end editorial behavior

These deployed HTTP results are separate from the local tests above. They do not establish a production deployment or successful live publication.

## Offline tests

Run the API and DOM logic tests with Node.js:

```sh
node tests/actualites-api.cjs
node tests/actualites-dom.cjs
```

Run the full offline regression set, excluding the real-browser suite:

```sh
for file in tests/*.cjs; do
  [ "$file" = tests/actualites-ui.cjs ] && continue
  node "$file" || exit 1
done
```

The existing SQL tests require `@electric-sql/pglite`. Set `PGLITE_MODULE` to its installed module location if it is not resolvable normally.

The DOM suite uses a small offline DOM model and is deliberately labelled as logic coverage. It does not claim CSS layout, real image loading, screen-reader, or rendering-engine coverage.

## Real-browser suite

Use an environment that permits local HTTP and Chromium processes, with `playwright` installed:

```sh
NEWS_QA_OUTPUT_DIR=/tmp/petrolegaz-news-qa node tests/actualites-ui.cjs
```

Supported overrides:

- `PLAYWRIGHT_MODULE`: installed Playwright package or module path
- `CHROMIUM_PATH`: Chromium executable (default `/usr/bin/chromium`)
- `NEWS_QA_OUTPUT_DIR`: output directory outside the repository

The suite writes `results.json` and desktop/mobile screenshots. It covers 360/390/800/1024/1280/1440-pixel reader layouts, homepage navigation around the 1200-pixel breakpoint, keyboard menu behavior, and all principal reader states. Empty/unavailable previews are captured separately from visibly TEST-labelled populated fixtures. Browser startup must succeed before any of these checks can be claimed as passed.

## Manual local preview

```sh
node tests/support/actualites-preview.cjs
```

Open `http://127.0.0.1:4387/__qa__/scenario?mode=empty` only in an environment that supports localhost browsing. The server binds to loopback only. It must never be deployed.

Modes: `empty`, `populated`, `unavailable`, `notfound`, `xss`, `race`. Add `width=360`, `width=390`, or `width=1440` to view a fixed-width iframe. Add `page=detail` or `page=home` for those pages. The default mode is empty; populated modes are explicitly TEST-only.
