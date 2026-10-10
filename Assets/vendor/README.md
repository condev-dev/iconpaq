# Vendored libraries

These files are checked in on purpose so the site works with no external requests:
it renders correctly offline, behind a proxy, or in regions where a CDN is slow or
blocked. Update them by hand when a new version is needed.

| Library | Version | File(s) | License |
| --- | --- | --- | --- |
| Bootstrap | 4.6.2 | `bootstrap/bootstrap.min.css`, `bootstrap/bootstrap.bundle.min.js` | MIT |
| jQuery | 3.6.0 | `jquery/jquery.min.js` | MIT |
| Font Awesome | 4.7.0 | `font-awesome/css/font-awesome.min.css`, `font-awesome/fonts/*` | SIL OFL 1.1 (fonts), MIT (CSS) |
| html2canvas | 1.4.1 | `html2canvas/html2canvas.min.js` | MIT |

Local change: the `@font-face` block in `font-awesome.min.css` was trimmed to the
`woff2`, `woff` and `ttf` sources. The legacy `eot` and `svg` webfonts are not
shipped, so those two references were removed to avoid 404 requests.

All libraries were downloaded unmodified apart from that single `@font-face` block.
