# Vendored interactive dependencies

No `npm install` was run. These exact UMD builds are vendored so the prototype
works offline and from `file://` with no CDN or package manager.

| File | Package / version | Source | Licence |
|---|---|---|---|
| `react.production.min.js` | React 18.3.1 | https://unpkg.com/react@18.3.1/umd/react.production.min.js | MIT — `react.LICENSE` |
| `react-dom.production.min.js` | React DOM 18.3.1 | https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js | MIT — `react-dom.LICENSE` |
| `prop-types.min.js` | prop-types 15.8.1 | https://unpkg.com/prop-types@15.8.1/prop-types.min.js | MIT — `prop-types.LICENSE` |
| `Recharts.js` | Recharts 2.15.4 | https://unpkg.com/recharts@2.15.4/umd/Recharts.js | MIT — `recharts.LICENSE` |
| `htm.umd.js` | htm 3.1.1 | https://unpkg.com/htm@3.1.1/dist/htm.umd.js | Apache-2.0 — `htm.LICENSE` |

`Recharts.js` externals are React and prop-types, both loaded before it. The
chart code is original and uses `htm` tagged templates, so there is no JSX build
step. `data/data.js` is generated from accepted aggregates by
`scripts/build_interactive_data.py`.

Measured local JavaScript: **853,932 bytes raw / 229,882 bytes gzip** for React,
ReactDOM, prop-types, htm, Recharts, the generated data and the app. Recharts is
the largest piece at 122,223 bytes gzip. The alternative npm-managed build would
allow tree-shaking; it is not required for this prototype.
