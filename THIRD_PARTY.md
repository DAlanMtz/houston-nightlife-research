# Third-party inventory

| Component | Version | Licence | File |
|---|---|---|---|
| React | 18.3.1 | MIT | `interactive/vendor/react.production.min.js` |
| ReactDOM | 18.3.1 | MIT | `interactive/vendor/react-dom.production.min.js` |
| prop-types | 15.8.1 | MIT | `interactive/vendor/prop-types.min.js` |
| Recharts | 2.15.4 | MIT | `interactive/vendor/Recharts.js` |
| htm | 3.1.1 | Apache-2.0 | `interactive/vendor/htm.umd.js` |
| Source Serif 4 | vendored | SIL OFL 1.1 | `assets/fonts/` |
| Inter | vendored | SIL OFL 1.1 | `assets/fonts/` |
| IBM Plex Mono | vendored | SIL OFL 1.1 | `assets/fonts/` |

`Recharts.js` is a minified UMD bundle with no package manifest. Its upstream
v2.15.4 lockfile resolves these dependencies: clsx 2.1.0, eventemitter3 4.0.7,
lodash 4.17.21, react-is 18.3.1, react-smooth 4.0.4, recharts-scale 0.4.5,
tiny-invariant 1.3.3, decimal.js-light 2.5.1, fast-equals 5.0.1, dom-helpers 5.2.1,
react-transition-group 4.4.5 (BSD-3-Clause), @babel/runtime 7.27.6, loose-envify
1.4.0, victory-vendor 36.9.1 and its d3 modules (d3-array 3.2.4, d3-color 3.1.0,
d3-ease 3.0.1, d3-format 3.1.0, d3-interpolate 3.0.1, d3-path 3.1.0, d3-scale
4.0.2, d3-shape 3.2.0, d3-time 3.1.0, d3-time-format 4.1.0, d3-timer 3.0.1,
internmap 2.0.3). All texts are in `LICENSES/vendor/recharts-bundled-deps.LICENSE`;
the upstream notice is `LICENSES/vendor/Recharts.js.LICENSE.txt`.

**Residual uncertainty:** these versions are the upstream-declared tree, not a
byte-level inventory of the minified bundle, so which packages are actually
inlined, and at which versions, is not independently verified.
`react-dom.production.min.js` embeds a Modernizr 3.0.0pre (MIT) notice; the
Modernizr MIT text is in the same file, taken from the project's current LICENSE
because the 3.0.0pre banner itself says only "MIT".

Licence texts are in `LICENSES/`. The UIArc reference repository was studied for
interaction patterns only; no source, CSS, class names, images or assets were
copied.
