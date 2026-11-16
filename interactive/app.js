/* Houston Nightlife — interactive chart pilots.
   React 18 UMD + Recharts 2.15.4 + htm. No JSX build step, no runtime data fetch. */
(() => {
  "use strict";

  const { useState, useEffect, useMemo, useRef } = React;
  const { createRoot } = ReactDOM;
  const {
    LineChart, Line, Area, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, ReferenceLine, ReferenceArea, ReferenceDot,
  } = Recharts;
  if (!window.React || !window.ReactDOM || !window.Recharts || !window.htm || !window.HNL_DATA) {
    document.querySelectorAll("[data-react-app]").forEach((el) => {
      el.innerHTML = '<p class="app-error">Interactive charts did not load. <a href="../report/index.html">Open the full report</a>.</p>';
    });
    return;
  }
  const html = htm.bind(React.createElement);
  const D = window.HNL_DATA;

  const MONEY = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
  const INT = new Intl.NumberFormat("en-US");
  const fmtInt = (v) => INT.format(Math.round(v));
  const fmtMoney = (v) => MONEY.format(Math.round(v));
  const fmtM = (v) => `${v < 0 ? "−" : ""}$${Math.abs(v / 1e6).toFixed(1)}M`;
  const fmtPct = (v, d = 1) => (v * 100).toFixed(d).replace("-", "−") + "%";
  const fmtNum = (v, d = 3) => Number(v).toFixed(d);
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const pctDelta = (cur, prev) => (prev ? (cur - prev) / prev : null);
  const ppDelta = (cur, prev) => (prev == null ? null : cur - prev);

  // Prior-year values for tooltip deltas, keyed like the Chapter 3 series.
  const CH3_VALUES = {
    annual: D.ch3.series.venues.values,
    december: D.ch3.series.december.values,
    median: D.ch3.series.median.values,
    mean: D.ch3.series.mean.values,
    real: D.ch3.series.real.values,
    nominal: D.ch3.series.nominal.values,
  };

  function Delta({ value, kind = "pct" }) {
    if (value == null || !Number.isFinite(value)) return null;
    const up = value >= 0;
    const text = kind === "pp"
      ? `${Math.abs(value * 100).toFixed(1)} pp`
      : kind === "raw"
        ? Math.abs(value).toFixed(3)
        : fmtPct(Math.abs(value));
    return html`<span className=${`tip-delta ${up ? "up" : "down"}`}><i className=${up ? "up" : "down"} aria-hidden="true"></i>${text}</span>`;
  }

  const RANGES = [
    { id: "all", label: "2013–2025", range: [2013, 2025] },
    { id: "pre", label: "2013–2019", range: [2013, 2019] },
    { id: "post", label: "2020–2025", range: [2020, 2025] },
  ];

  const BAND_COLORS = {
    lower: "var(--color-compare)",
    primary: "var(--color-accent)",
    upper: "var(--color-ink)",
  };

  const SERIES_META = {
    annual: {
      label: "Annual active",
      format: fmtInt,
      denominator: "At least one positive month in the year.",
    },
    december: {
      label: "December active",
      format: fmtInt,
      denominator: "Positive reported receipts in December.",
    },
    median: {
      label: "Median receipts",
      format: fmtMoney,
      denominator: "Active venues with positive receipts; June 2026 dollars.",
      foot: "June 2026 dollars",
    },
    mean: {
      label: "Mean receipts",
      format: fmtMoney,
      denominator: "Active venues with positive receipts; June 2026 dollars.",
      foot: "June 2026 dollars",
    },
  };

  // Shared Chapter 3 state across three separate React roots.
  const ch3Store = { range: [2013, 2025], focusYear: 2025, hoverYear: null };
  const ch3Listeners = new Set();

  function useCh3() {
    const [state, setState] = useState(() => ({ ...ch3Store }));
    useEffect(() => {
      const listener = () => setState({ ...ch3Store });
      ch3Listeners.add(listener);
      return () => ch3Listeners.delete(listener);
    }, []);
    const update = (patch) => {
      const changed = Object.keys(patch).some((key) => Array.isArray(patch[key])
        ? String(patch[key]) !== String(ch3Store[key])
        : patch[key] !== ch3Store[key]);
      if (!changed) return;
      Object.assign(ch3Store, patch);
      ch3Listeners.forEach((fn) => fn());
    };
    return [state, update];
  }

  function useStatus() {
    const [status, setStatus] = useState("");
    const announce = (text) => setStatus(text);
    return [status, announce];
  }

  function Segmented({ label, options, value, onChange, className = "" }) {
    return html`
      <div className=${`seg-control ${className}`} role="group" aria-label=${label}>
        ${options.map((opt) => html`
          <button
            key=${opt.value}
            type="button"
            className=${`seg-btn ${value === opt.value ? "is-on" : ""}`}
            aria-pressed=${value === opt.value}
            onClick=${() => onChange(opt.value)}
            title=${opt.title || opt.label}
          >${opt.label}</button>
        `)}
      </div>
    `;
  }

  function ToggleChip({ label, checked, onChange, color, disabled = false }) {
    return html`
      <button
        type="button"
        className=${`toggle-chip ${checked ? "is-on" : ""}`}
        aria-pressed=${checked}
        onClick=${onChange}
        disabled=${disabled}
      >
        <span className="chip-swatch" style=${{ background: color }} aria-hidden="true"></span>
        ${label}
      </button>
    `;
  }

  function RangeControl({ range, onChange, onReset, note }) {
    const current = RANGES.find((r) => r.range[0] === range[0] && r.range[1] === range[1]);
    return html`
      <div className="chart-controls">
        <div className="control-cluster">
          <span className="control-label">Time range</span>
          <${Segmented}
            label="Time range"
            value=${current ? current.id : "custom"}
            options=${RANGES.map((r) => ({ value: r.id, label: r.label }))}
            onChange=${(id) => {
              const next = RANGES.find((r) => r.id === id);
              if (next) onChange(next.range);
            }}
          />
        </div>
        <div className="control-cluster control-cluster--right">
          ${note ? html`<span className="control-note">${note}</span>` : null}
          <button type="button" className="reset-btn" onClick=${onReset}>Reset</button>
        </div>
      </div>
    `;
  }

  function FocusYear({ value, onChange, years, id }) {
    return html`
      <label className="focus-year" htmlFor=${id}>
        <span>Inspect year</span>
        <select id=${id} value=${value} onChange=${(e) => onChange(Number(e.target.value))}>
          ${years.map((year) => html`<option key=${year} value=${year}>${year}</option>`)}
        </select>
      </label>
    `;
  }

  function Status({ children }) {
    return html`<p className="chart-status" role="status" aria-live="polite">${children}</p>`;
  }

  function DataTable({ caption, columns, rows, focusYear, note }) {
    return html`
      <details className="data-table react-data-table">
        <summary>Selected values table</summary>
        <div className="table-wrap react-table-wrap" tabIndex="0" role="region" aria-label="Selected data table">
          <p className="table-scroll-hint" aria-hidden="true">Scroll to see all columns →</p>
          <table className="react-table">
            <caption>${caption}</caption>
            <thead>
              <tr>${columns.map((c) => html`<th key=${c.key} scope="col" className=${c.align === "right" ? "num" : ""}>${c.label}</th>`)}</tr>
            </thead>
            <tbody>
              ${rows.map((row) => html`
                <tr key=${row.year} className=${row.year === focusYear ? "is-focus" : ""}>
                  ${columns.map((c) => html`<td key=${c.key} className=${c.align === "right" ? "num" : ""}>${c.format ? c.format(row[c.key], row) : row[c.key]}</td>`)}
                </tr>
              `)}
            </tbody>
          </table>
          ${note ? html`<p className="table-note">${note}</p>` : null}
        </div>
      </details>
    `;
  }

  function Ch3Tooltip({ active, payload, label, meta }) {
    if (!active || !payload || !payload.length) return null;
    const index = D.ch3.years.indexOf(Number(label));
    const foot = payload.map((p) => meta[p.dataKey] && meta[p.dataKey].foot).find(Boolean);
    return html`
      <div className="chart-tip" aria-hidden="true">
        <strong>${label}</strong>
        ${payload.map((p) => {
          const m = meta[p.dataKey];
          if (!m) return null;
          const prior = index > 0 && CH3_VALUES[p.dataKey] ? CH3_VALUES[p.dataKey][index - 1] : null;
          return html`
            <div className="tip-row" key=${p.dataKey}>
              <span><i className="tip-swatch" style=${{ background: p.color }}></i>${m.label}</span>
              <b>${m.format(p.value)}</b>
              <${Delta} value=${pctDelta(p.value, prior)} />
            </div>
          `;
        })}
        ${foot ? html`<div className="tip-foot">${foot}</div>` : null}
      </div>
    `;
  }

  function Readout({ items }) {
    return html`
      <div className="chart-readout">
        ${items.map((item) => html`
          <div className="readout-item" key=${item.label}>
            <span>${item.label}</span>
            <b>${item.value}</b>
            ${item.delta ? html`<small className=${item.delta.tone}>${item.delta.text}</small>` : null}
          </div>
        `)}
      </div>
    `;
  }

  // ------------------------------------------------------------ Chapter 3

  function Ch3Growth() {
    const [shared, setShared] = useCh3();
    const [visible, setVisible] = useState({ annual: true, december: true, median: true, mean: false });
    const [status, announce] = useStatus();
    const rows = useMemo(() => D.ch3.years.map((year, i) => ({
      year,
      annual: D.ch3.series.venues.values[i],
      december: D.ch3.series.december.values[i],
      median: D.ch3.series.median.values[i],
      mean: D.ch3.series.mean.values[i],
      n: D.ch3.series.venues.values[i],
    })), []);
    const filtered = rows.filter((r) => r.year >= shared.range[0] && r.year <= shared.range[1]);
    const activeYear = shared.hoverYear || shared.focusYear;
    const activeRow = rows.find((r) => r.year === activeYear) || rows[rows.length - 1];
    const prevRow = rows.find((r) => r.year === activeYear - 1) || null;
    const chg = (key, kind = "count") => {
      if (!prevRow) return null;
      const diff = activeRow[key] - prevRow[key];
      const text = kind === "count"
        ? `${diff >= 0 ? "+" : "−"}${fmtInt(Math.abs(diff))} vs ${prevRow.year}`
        : `${diff >= 0 ? "+" : "−"}${fmtPct(Math.abs(pctDelta(activeRow[key], prevRow[key])))} vs ${prevRow.year}`;
      return { tone: diff >= 0 ? "up" : "down", text };
    };

    const toggle = (key) => {
      const group = key === "annual" || key === "december" ? ["annual", "december"] : ["median", "mean"];
      if (visible[key] && group.every((k) => k === key || !visible[k])) {
        announce("Keep at least one series visible in this panel.");
        return;
      }
      const next = { ...visible, [key]: !visible[key] };
      setVisible(next);
      announce(`${key} ${next[key] ? "shown" : "hidden"}.`);
    };

    const changeRange = (range) => {
      const focusYear = shared.focusYear >= range[0] && shared.focusYear <= range[1] ? shared.focusYear : range[1];
      setShared({ range, focusYear, hoverYear: null });
      announce(`Showing ${range[0]}–${range[1]}.`);
    };
    const reset = () => {
      setShared({ range: [2013, 2025], focusYear: 2025, hoverYear: null });
      setVisible({ annual: true, december: true, median: true, mean: false });
      announce("Figure 3.1 reset to all years and the default series.");
    };

    const xDomain = shared.range;
    const tableColumns = [
      { key: "year", label: "Year" },
      ...(visible.annual ? [{ key: "annual", label: "Annual active", align: "right", format: fmtInt }] : []),
      ...(visible.december ? [{ key: "december", label: "December active", align: "right", format: fmtInt }] : []),
      ...(visible.median ? [{ key: "median", label: "Median receipts", align: "right", format: fmtMoney }] : []),
      ...(visible.mean ? [{ key: "mean", label: "Mean receipts", align: "right", format: fmtMoney }] : []),
    ];

    return html`
      <div className="react-app">
        <div className="app-head">
          <div>
            <p className="app-kicker">Interactive figure 3.1</p>
            <h3>Two measures, opposite directions.</h3>
          </div>
          <${FocusYear} id="ch3-growth-year" value=${shared.focusYear} years=${D.ch3.years.filter((y) => y >= shared.range[0] && y <= shared.range[1])} onChange=${(year) => { setShared({ focusYear: year, hoverYear: null }); announce(`Inspecting ${year}.`); }} />
        </div>
        <${RangeControl} range=${shared.range} onChange=${changeRange} onReset=${reset} note="Shared across Figures 3.1–3.3" />
        <div className="chart-controls chart-controls--toggles">
          <div className="control-cluster">
            <span className="control-label">Venues</span>
            <${ToggleChip} label="Annual active" checked=${visible.annual} onChange=${() => toggle("annual")} color="var(--color-accent)" />
            <${ToggleChip} label="December active" checked=${visible.december} onChange=${() => toggle("december")} color="var(--color-compare)" />
          </div>
          <div className="control-cluster">
            <span className="control-label">Receipts</span>
            <${ToggleChip} label="Median" checked=${visible.median} onChange=${() => toggle("median")} color="var(--color-accent)" />
            <${ToggleChip} label="Mean" checked=${visible.mean} onChange=${() => toggle("mean")} color="var(--color-compare)" />
          </div>
        </div>
        <div className="chart-grid">
          <section className="chart-panel" aria-label="Venue counts">
            <div className="panel-head"><span>Venues</span><small>${activeYear} · ${visible.annual ? `${fmtInt(activeRow.annual)} annual` : `${fmtInt(activeRow.december)} December`}</small></div>
            <div className="chart-canvas" style=${{ height: "260px" }}>
              <${ResponsiveContainer} width="100%" height="100%">
                <${LineChart} data=${filtered} margin=${{ top: 8, right: 18, bottom: 0, left: 0 }} accessibilityLayer onMouseMove=${(state) => { if (state && state.activeLabel) setShared({ hoverYear: Number(state.activeLabel) }); }} onMouseLeave=${() => setShared({ hoverYear: null })}>
                  <${CartesianGrid} stroke="var(--color-rule-light)" vertical=${false} />
                  <${ReferenceArea} x1=${2019.5} x2=${2020.5} fill="var(--color-paper-deep)" fillOpacity=${0.65} label=${{ value: "2020", position: "insideTop", fill: "var(--color-ink-muted)", fontSize: 9, fontFamily: "var(--font-mono)" }} />
                  <${XAxis} dataKey="year" type="number" domain=${xDomain} allowDataOverflow tickCount=${5} tickFormatter=${(v) => String(v)} stroke="var(--color-rule)" tick=${{ fill: "var(--color-ink-muted)", fontSize: 10, fontFamily: "var(--font-mono)" }} />
                  <${YAxis} domain=${[480, 880]} ticks=${[500, 600, 700, 800]} width=${40} stroke="var(--color-rule)" tick=${{ fill: "var(--color-ink-muted)", fontSize: 10, fontFamily: "var(--font-mono)" }} />
                  ${shared.hoverYear ? html`<${ReferenceArea} x1=${activeYear - 0.42} x2=${activeYear + 0.42} fill="var(--color-accent)" fillOpacity=${0.06} ifOverflow="hidden" />` : null}
                  <${ReferenceLine} x=${activeYear} stroke=${shared.hoverYear ? "var(--color-accent)" : "var(--color-accent-text)"} strokeDasharray=${shared.hoverYear ? undefined : "3 3"} />
                  ${visible.annual ? html`<${ReferenceDot} x=${activeYear} y=${activeRow.annual} r=${3.6} fill="var(--color-paper)" stroke="var(--color-accent)" strokeWidth=${2.2} isFront />` : null}
                  ${visible.december ? html`<${ReferenceDot} x=${activeYear} y=${activeRow.december} r=${3.6} fill="var(--color-paper)" stroke="var(--color-compare)" strokeWidth=${2.2} isFront />` : null}
                  <${Tooltip} cursor=${false} content=${html`<${Ch3Tooltip} meta=${SERIES_META} />`} />
                  
                  ${visible.annual ? html`<${Area} type="monotone" dataKey="annual" fill="var(--color-accent)" fillOpacity=${0.08} stroke="none" isAnimationActive=${false} />` : null}
                  ${visible.annual ? html`<${Line} type="monotone" dataKey="annual" name="Annual active" stroke="var(--color-accent)" strokeWidth=${2.4} dot=${false} activeDot=${false} isAnimationActive=${false} />` : null}
                  ${visible.december ? html`<${Line} type="monotone" dataKey="december" name="December active" stroke="var(--color-compare)" strokeWidth=${2} strokeDasharray="5 3" dot=${false} activeDot=${false} isAnimationActive=${false} />` : null}
                <//>
              <//>
            </div>
          </section>
          <section className="chart-panel" aria-label="Real receipts per venue">
            <div className="panel-head"><span>Real receipts per venue</span><small>${activeYear} · ${visible.median ? fmtMoney(activeRow.median) : fmtMoney(activeRow.mean)}</small></div>
            <div className="chart-canvas" style=${{ height: "260px" }}>
              <${ResponsiveContainer} width="100%" height="100%">
                <${LineChart} data=${filtered} margin=${{ top: 8, right: 18, bottom: 0, left: 0 }} accessibilityLayer onMouseMove=${(state) => { if (state && state.activeLabel) setShared({ hoverYear: Number(state.activeLabel) }); }} onMouseLeave=${() => setShared({ hoverYear: null })}>
                  <${CartesianGrid} stroke="var(--color-rule-light)" vertical=${false} />
                  <${ReferenceArea} x1=${2019.5} x2=${2020.5} fill="var(--color-paper-deep)" fillOpacity=${0.65} label=${{ value: "2020", position: "insideTop", fill: "var(--color-ink-muted)", fontSize: 9, fontFamily: "var(--font-mono)" }} />
                  <${XAxis} dataKey="year" type="number" domain=${xDomain} allowDataOverflow tickCount=${5} tickFormatter=${(v) => String(v)} stroke="var(--color-rule)" tick=${{ fill: "var(--color-ink-muted)", fontSize: 10, fontFamily: "var(--font-mono)" }} />
                  <${YAxis} domain=${[0, 900000]} ticks=${[0, 300000, 600000, 900000]} width=${54} tickFormatter=${(v) => `$${Math.round(v / 1000)}k`} stroke="var(--color-rule)" tick=${{ fill: "var(--color-ink-muted)", fontSize: 10, fontFamily: "var(--font-mono)" }} />
                  ${shared.hoverYear ? html`<${ReferenceArea} x1=${activeYear - 0.42} x2=${activeYear + 0.42} fill="var(--color-accent)" fillOpacity=${0.06} ifOverflow="hidden" />` : null}
                  <${ReferenceLine} x=${activeYear} stroke=${shared.hoverYear ? "var(--color-accent)" : "var(--color-accent-text)"} strokeDasharray=${shared.hoverYear ? undefined : "3 3"} />
                  ${visible.median ? html`<${ReferenceDot} x=${activeYear} y=${activeRow.median} r=${3.6} fill="var(--color-paper)" stroke="var(--color-accent)" strokeWidth=${2.2} isFront />` : null}
                  ${visible.mean ? html`<${ReferenceDot} x=${activeYear} y=${activeRow.mean} r=${3.6} fill="var(--color-paper)" stroke="var(--color-compare)" strokeWidth=${2.2} isFront />` : null}
                  <${Tooltip} cursor=${false} content=${html`<${Ch3Tooltip} meta=${SERIES_META} />`} />
                  
                  ${visible.median ? html`<${Area} type="monotone" dataKey="median" fill="var(--color-accent)" fillOpacity=${0.08} stroke="none" isAnimationActive=${false} />` : null}
                  ${visible.median ? html`<${Line} type="monotone" dataKey="median" name="Median receipts" stroke="var(--color-accent)" strokeWidth=${2.4} dot=${false} activeDot=${false} isAnimationActive=${false} />` : null}
                  ${visible.mean ? html`<${Line} type="monotone" dataKey="mean" name="Mean receipts" stroke="var(--color-compare)" strokeWidth=${2} strokeDasharray="5 3" dot=${false} activeDot=${false} isAnimationActive=${false} />` : null}
                <//>
              <//>
            </div>
          </section>
        </div>
        <${Readout} items=${[
          ...(visible.annual ? [{ label: `${activeYear} annual active`, value: fmtInt(activeRow.annual), delta: chg("annual") }] : []),
          ...(visible.december ? [{ label: `${activeYear} December active`, value: fmtInt(activeRow.december), delta: chg("december") }] : []),
          ...(visible.median ? [{ label: "Median receipts", value: fmtMoney(activeRow.median), delta: chg("median", "pct") }] : []),
          ...(visible.mean ? [{ label: "Mean receipts", value: fmtMoney(activeRow.mean), delta: chg("mean", "pct") }] : []),
        ]} />
        <${Status}>${status || `Showing ${shared.range[0]}–${shared.range[1]}. Inspecting ${shared.focusYear}. Use the toggles to show or hide series; the table carries the exact values.`}<//>
        <${DataTable}
          caption=${`Figure 3.1 values, ${shared.range[0]}–${shared.range[1]}`}
          columns=${tableColumns}
          rows=${filtered}
          focusYear=${shared.focusYear}
          note="Strict-city primary band. Annual ever-active = at least one positive month; December-active = positive in December. Real amounts in June 2026 dollars; median and mean are derived, noncanonical evidence. n = annual active venues."
        />
      </div>
    `;
  }

  function Ch3Receipts() {
    const [shared, setShared] = useCh3();
    const [measure, setMeasure] = useState("real");
    const [status, announce] = useStatus();
    const rows = useMemo(() => D.ch3.years.map((year, i) => ({
      year,
      real: D.ch3.series.real.values[i],
      nominal: D.ch3.series.nominal.values[i],
      n: D.ch3.series.venues.values[i],
    })), []);
    const filtered = rows.filter((r) => r.year >= shared.range[0] && r.year <= shared.range[1]);
    const activeYear = shared.hoverYear || shared.focusYear;
    const activeRow = rows.find((r) => r.year === activeYear) || rows[rows.length - 1];
    const prevRow = rows.find((r) => r.year === activeYear - 1) || null;
    const chg = (key) => {
      if (!prevRow) return null;
      const diff = pctDelta(activeRow[key], prevRow[key]);
      return { tone: diff >= 0 ? "up" : "down", text: `${diff >= 0 ? "+" : "−"}${fmtPct(Math.abs(diff))} vs ${prevRow.year}` };
    };
    const meta = measure === "real"
      ? { label: "Real receipts", format: fmtMoney, denominator: "June 2026 dollars; derived noncanonical series.", foot: "June 2026 dollars · derived series", color: "var(--color-accent)" }
      : { label: "Nominal receipts", format: fmtMoney, denominator: "Reported nominal dollars; not deflated.", foot: "Nominal reported dollars", color: "var(--color-compare)" };
    const domain = measure === "real" ? [0, 700000000] : [0, 600000000];
    const ticks = measure === "real" ? [0, 200000000, 400000000, 600000000] : [0, 200000000, 400000000, 600000000];
    const dotLow = measure === "real" ? D.ch3.series.real.values[7] : D.ch3.series.nominal.values[7];
    const dotPeak = measure === "real" ? D.ch3.series.real.values[9] : D.ch3.series.nominal.values[9];

    const changeRange = (range) => {
      const focusYear = shared.focusYear >= range[0] && shared.focusYear <= range[1] ? shared.focusYear : range[1];
      setShared({ range, focusYear, hoverYear: null });
      announce(`Showing ${range[0]}–${range[1]}.`);
    };
    const reset = () => {
      setShared({ range: [2013, 2025], focusYear: 2025, hoverYear: null });
      setMeasure("real");
      announce("Figure 3.2 reset to all years and real receipts.");
    };

    return html`
      <div className="react-app">
        <div className="app-head">
          <div>
            <p className="app-kicker">Interactive figure 3.2</p>
            <h3>The 2020 break, and the plateau after it.</h3>
          </div>
          <${FocusYear} id="ch3-receipts-year" value=${shared.focusYear} years=${D.ch3.years.filter((y) => y >= shared.range[0] && y <= shared.range[1])} onChange=${(year) => { setShared({ focusYear: year, hoverYear: null }); announce(`Inspecting ${year}.`); }} />
        </div>
        <${RangeControl} range=${shared.range} onChange=${changeRange} onReset=${reset} note="Shared across Figures 3.1–3.3" />
        <div className="chart-controls chart-controls--toggles">
          <div className="control-cluster">
            <span className="control-label">Measure</span>
            <${Segmented} label="Receipt measure" value=${measure} options=${[
              { value: "real", label: "Real (June 2026 $)" },
              { value: "nominal", label: "Nominal" },
            ]} onChange=${(value) => { setMeasure(value); announce(`${value} receipts shown.`); }} />
          </div>
          <span className="control-note">The y-axis is fixed for each measure, so switching units does not rescale the same series.</span>
        </div>
        <div className="chart-panel">
          <div className="panel-head"><span>${meta.label}</span><small>${activeYear} · ${fmtMoney(measure === "real" ? activeRow.real : activeRow.nominal)}</small></div>
          <div className="chart-canvas" style=${{ height: "300px" }}>
            <${ResponsiveContainer} width="100%" height="100%">
              <${LineChart} key=${measure} data=${filtered} margin=${{ top: 10, right: 24, bottom: 0, left: 0 }} accessibilityLayer onMouseMove=${(state) => { if (state && state.activeLabel) setShared({ hoverYear: Number(state.activeLabel) }); }} onMouseLeave=${() => setShared({ hoverYear: null })}>
                <${CartesianGrid} stroke="var(--color-rule-light)" vertical=${false} />
                <${ReferenceArea} x1=${2019.5} x2=${2020.5} fill="var(--color-paper-deep)" fillOpacity=${0.65} label=${{ value: "2020", position: "insideTop", fill: "var(--color-ink-muted)", fontSize: 9, fontFamily: "var(--font-mono)" }} />
                <${XAxis} dataKey="year" type="number" domain=${shared.range} allowDataOverflow tickCount=${6} tickFormatter=${(v) => String(v)} stroke="var(--color-rule)" tick=${{ fill: "var(--color-ink-muted)", fontSize: 10, fontFamily: "var(--font-mono)" }} />
                <${YAxis} domain=${domain} ticks=${ticks} width=${58} tickFormatter=${(v) => `$${Math.round(v / 1e6)}M`} stroke="var(--color-rule)" tick=${{ fill: "var(--color-ink-muted)", fontSize: 10, fontFamily: "var(--font-mono)" }} />
                ${shared.hoverYear ? html`<${ReferenceArea} x1=${activeYear - 0.42} x2=${activeYear + 0.42} fill="var(--color-accent)" fillOpacity=${0.06} ifOverflow="hidden" />` : null}
                <${ReferenceLine} x=${activeYear} stroke=${shared.hoverYear ? "var(--color-accent)" : "var(--color-accent-text)"} strokeDasharray=${shared.hoverYear ? undefined : "3 3"} />
                <${Tooltip} cursor=${false} content=${html`<${Ch3Tooltip} meta=${{ [measure]: meta }} />`} />
                <${ReferenceDot} x=${activeYear} y=${measure === "real" ? activeRow.real : activeRow.nominal} r=${3.8} fill="var(--color-paper)" stroke=${meta.color} strokeWidth=${2.2} isFront />
                <${ReferenceDot} x=${2020} y=${dotLow} r=${3} fill="var(--color-paper)" stroke=${meta.color} strokeWidth=${1.6} />
                <${ReferenceDot} x=${2022} y=${dotPeak} r=${3} fill=${meta.color} stroke="var(--color-paper)" strokeWidth=${1.2} label=${{ value: "2022 peak", position: "top", fill: "var(--color-ink-muted)", fontSize: 9, fontFamily: "var(--font-mono)" }} />
                <${Area} type="monotone" dataKey=${measure} fill=${meta.color} fillOpacity=${0.08} stroke="none" isAnimationActive=${false} />
                <${Line} type="monotone" dataKey=${measure} name=${meta.label} stroke=${meta.color} strokeWidth=${2.4} dot=${false} activeDot=${false} isAnimationActive=${false} />
              <//>
            <//>
          </div>
        </div>
        <${Readout} items=${[
          { label: `${activeYear} real receipts`, value: fmtMoney(activeRow.real), delta: chg("real") },
          { label: `${activeYear} nominal receipts`, value: fmtMoney(activeRow.nominal), delta: chg("nominal") },
        ]} />
        <${Status}>${status || `Showing ${shared.range[0]}–${shared.range[1]}. ${meta.label}, ${shared.focusYear}.`}<//>
        <${DataTable}
          caption=${`Figure 3.2 values, ${shared.range[0]}–${shared.range[1]}`}
          columns=${[
            { key: "year", label: "Year" },
            { key: "real", label: "Real receipts", align: "right", format: fmtMoney },
            { key: "nominal", label: "Nominal receipts", align: "right", format: fmtMoney },
          ]}
          rows=${filtered}
          focusYear=${shared.focusYear}
          note="Strict-city primary band. Real amounts in June 2026 dollars; nominal amounts are reported totals. The real series is derived and noncanonical."
        />
      </div>
    `;
  }

  function Ch3Concentration() {
    const [shared, setShared] = useCh3();
    const [band, setBand] = useState("primary");
    const [measure, setMeasure] = useState("gini");
    const [status, announce] = useStatus();
    const bandData = D.ch3.concentration[band];
    const rows = D.ch3.years.map((year, i) => ({
      year,
      value: bandData[measure][i],
      n: bandData.n[i],
    }));
    const filtered = rows.filter((r) => r.year >= shared.range[0] && r.year <= shared.range[1]);
    const activeYear = shared.hoverYear || shared.focusYear;
    const activeRow = rows.find((r) => r.year === activeYear) || rows[rows.length - 1];
    const activeIndex = D.ch3.years.indexOf(activeYear);
    const prevValue = activeIndex > 0 ? bandData[measure][activeIndex - 1] : null;
    const pctPoint = (v) => `${v >= 0 ? "+" : "−"}${Math.abs(v * 100).toFixed(1)} pp vs ${activeYear - 1}`;
    const valueDelta = prevValue == null ? null : {
      tone: activeRow.value >= prevValue ? "up" : "down",
      text: measure === "gini"
        ? `${activeRow.value >= prevValue ? "+" : "−"}${Math.abs(activeRow.value - prevValue).toFixed(3)} vs ${activeYear - 1}`
        : pctPoint(activeRow.value - prevValue),
    };
    const meta = measure === "gini"
      ? { label: "Gini coefficient", format: (v) => fmtNum(v, 3), denominator: "Venues with positive receipts in the year.", domain: [0.45, 0.67], ticks: [0.45, 0.5, 0.55, 0.6, 0.65] }
      : { label: "Top-decile share", format: (v) => fmtPct(v, 1), denominator: "Share of receipts held by the top 10% of positive-receipt venues.", domain: [0.3, 0.5], ticks: [0.3, 0.35, 0.4, 0.45, 0.5] };

    const changeRange = (range) => {
      const focusYear = shared.focusYear >= range[0] && shared.focusYear <= range[1] ? shared.focusYear : range[1];
      setShared({ range, focusYear, hoverYear: null });
      announce(`Showing ${range[0]}–${range[1]}.`);
    };
    const reset = () => {
      setShared({ range: [2013, 2025], focusYear: 2025, hoverYear: null });
      setBand("primary");
      setMeasure("gini");
      announce("Figure 3.3 reset to the primary band and Gini.");
    };

    return html`
      <div className="react-app">
        <div className="app-head">
          <div>
            <p className="app-kicker">Interactive figure 3.3</p>
            <h3>The direction is consistent; the size depends on the band.</h3>
          </div>
          <${FocusYear} id="ch3-gini-year" value=${shared.focusYear} years=${D.ch3.years.filter((y) => y >= shared.range[0] && y <= shared.range[1])} onChange=${(year) => { setShared({ focusYear: year, hoverYear: null }); announce(`Inspecting ${year}.`); }} />
        </div>
        <${RangeControl} range=${shared.range} onChange=${changeRange} onReset=${reset} note="Shared across Figures 3.1–3.3" />
        <div className="chart-controls chart-controls--toggles">
          <div className="control-cluster">
            <span className="control-label">Classification band</span>
            <${Segmented} label="Classification band" value=${band} options=${[
              { value: "lower", label: "Lower" },
              { value: "primary", label: "Primary" },
              { value: "upper", label: "Upper" },
            ]} onChange=${(value) => { setBand(value); announce(`${D.ch3.concentration[value].label} selected.`); }} />
          </div>
          <div className="control-cluster">
            <span className="control-label">Measure</span>
            <${Segmented} label="Concentration measure" value=${measure} options=${[
              { value: "gini", label: "Gini" },
              { value: "topDecile", label: "Top-decile share" },
            ]} onChange=${(value) => { setMeasure(value); announce(`${value === "gini" ? "Gini" : "Top-decile share"} selected.`); }} />
          </div>
        </div>
        <p className="band-definition"><b>${bandData.label}:</b> ${bandData.definition} ${meta.denominator}</p>
        <div className="chart-panel">
          <div className="panel-head"><span>${meta.label} · ${bandData.label}</span><small>${activeYear} · ${meta.format(activeRow.value)}</small></div>
          <div className="chart-canvas" style=${{ height: "300px" }}>
            <${ResponsiveContainer} width="100%" height="100%">
              <${LineChart} key=${`${band}-${measure}`} data=${filtered} margin=${{ top: 10, right: 24, bottom: 0, left: 0 }} accessibilityLayer onMouseMove=${(state) => { if (state && state.activeLabel) setShared({ hoverYear: Number(state.activeLabel) }); }} onMouseLeave=${() => setShared({ hoverYear: null })}>
                <${CartesianGrid} stroke="var(--color-rule-light)" vertical=${false} />
                <${ReferenceArea} x1=${2019.5} x2=${2020.5} fill="var(--color-paper-deep)" fillOpacity=${0.65} label=${{ value: "2020", position: "insideTop", fill: "var(--color-ink-muted)", fontSize: 9, fontFamily: "var(--font-mono)" }} />
                <${XAxis} dataKey="year" type="number" domain=${shared.range} allowDataOverflow tickCount=${6} tickFormatter=${(v) => String(v)} stroke="var(--color-rule)" tick=${{ fill: "var(--color-ink-muted)", fontSize: 10, fontFamily: "var(--font-mono)" }} />
                <${YAxis} domain=${meta.domain} ticks=${meta.ticks} width=${54} tickFormatter=${meta.format} stroke="var(--color-rule)" tick=${{ fill: "var(--color-ink-muted)", fontSize: 10, fontFamily: "var(--font-mono)" }} />
                ${shared.hoverYear ? html`<${ReferenceArea} x1=${activeYear - 0.42} x2=${activeYear + 0.42} fill="var(--color-accent)" fillOpacity=${0.06} ifOverflow="hidden" />` : null}
                <${ReferenceLine} x=${activeYear} stroke=${shared.hoverYear ? "var(--color-accent)" : "var(--color-accent-text)"} strokeDasharray=${shared.hoverYear ? undefined : "3 3"} />
                <${ReferenceDot} x=${activeYear} y=${activeRow.value} r=${3.8} fill="var(--color-paper)" stroke=${BAND_COLORS[band]} strokeWidth=${2.2} isFront />
                <${Tooltip} cursor=${false} content=${({ active, payload, label }) => {
                  if (!active || !payload || !payload.length) return null;
                  const row = payload[0].payload;
                  const i = D.ch3.years.indexOf(Number(label));
                  const prior = i > 0 ? bandData[measure][i - 1] : null;
                  return html`<div className="chart-tip" aria-hidden="true"><strong>${label}</strong><div className="tip-row"><span>${meta.label}</span><b>${meta.format(row.value)}</b><${Delta} value=${ppDelta(row.value, prior)} kind=${measure === "gini" ? "raw" : "pp"} /></div><div className="tip-foot">n = ${fmtInt(row.n)} positive-receipt venues</div></div>`;
                }} />
                
                <${Area} type="monotone" dataKey="value" fill=${BAND_COLORS[band]} fillOpacity=${0.08} stroke="none" isAnimationActive=${false} />
                <${Line} type="monotone" dataKey="value" name=${meta.label} stroke=${BAND_COLORS[band]} strokeWidth=${2.6} dot=${false} activeDot=${false} isAnimationActive=${false} />
              <//>
            <//>
          </div>
        </div>
        <${Readout} items=${[
          { label: `${activeYear} ${meta.label.toLowerCase()}`, value: meta.format(activeRow.value), delta: valueDelta },
          { label: "Positive-receipt venues", value: fmtInt(activeRow.n) },
        ]} />
        <${Status}>${status || `Showing ${bandData.label}, ${meta.label}, ${shared.range[0]}–${shared.range[1]}. The denominator is positive-receipt venues in each year, not the 1,667 panel.`}<//>
        <${DataTable}
          caption=${`Figure 3.3 values, ${bandData.label}, ${shared.range[0]}–${shared.range[1]}`}
          columns=${[
            { key: "year", label: "Year" },
            { key: "value", label: meta.label, align: "right", format: meta.format },
            { key: "n", label: "Positive-receipt venues", align: "right", format: fmtInt },
          ]}
          rows=${filtered}
          focusYear=${shared.focusYear}
          note="Gini and top-decile share are computed on venues with positive receipts in each year: 576 in 2013 and 805 in 2025 for the primary band. A panel-wide Gini including zero-receipt venues would not reproduce the accepted statistic."
        />
      </div>
    `;
  }

  // ------------------------------------------------------------ Chapter 4

  const venueLabel = (n) => `${fmtInt(n)} active ${n === 1 ? "venue" : "venues"}`;

  function Ch4Explorer() {
    const [year, setYear] = useState(2025);
    const [selected, setSelected] = useState(null);
    const [hovered, setHovered] = useState(null);
    const [rankMetric, setRankMetric] = useState("receipts");
    const [tip, setTip] = useState(null);
    const [trendHover, setTrendHover] = useState(null);
    const [focusKey, setFocusKey] = useState(D.ch4.districts[0] ? D.ch4.districts[0].key : null);
    const [status, announce] = useStatus();
    const wrapRef = useRef(null);
    const yearKey = String(year);

    const shareBin = (share) => D.ch4.bins.find((b) => share >= b.min && share < b.max) || D.ch4.bins[D.ch4.bins.length - 1];
    const colorFor = (district) => {
      const row = district.years[yearKey];
      if (!row) return "url(#ch4-no-data)";
      if (row.suppressed) return "url(#ch4-suppressed)";
      return shareBin(row.share).color;
    };
    const selectedDistrict = selected ? D.ch4.districts.find((d) => d.key === selected) : null;
    const selectedRow = selectedDistrict ? selectedDistrict.years[yearKey] : null;
    const ranked = D.ch4.districts
      .filter((d) => d.years[yearKey] && !d.years[yearKey].suppressed
        && typeof d.years[yearKey][rankMetric] === "number")
      .sort((a, b) => b.years[yearKey][rankMetric] - a.years[yearKey][rankMetric]);
    const top = ranked.slice(0, 10);
    const maxRank = top.length ? Math.max(...top.map((d) => d.years[yearKey][rankMetric])) : 1;
    const trend = selectedDistrict
      ? D.ch4.years.map((y) => {
        const row = selectedDistrict.years[String(y)];
        const hidden = !row || row.suppressed;
        return {
          year: y,
          share: hidden ? null : row.share,
          receipts: hidden ? null : row.receipts,
          venues: row ? row.venues : null,
          suppressed: Boolean(row && row.suppressed),
        };
      })
      : [];
    const trendHasData = trend.some((r) => r.share !== null);
    const yearPoint = trend.find((r) => r.year === year) || null;
    const trendActive = trendHover || year;
    const trendPoint = trend.find((r) => r.year === trendActive) || yearPoint;
    const coverage = D.ch4.coverage[yearKey];
    const denominator = D.ch4.cityReal[yearKey];

    const select = (key) => {
      setTrendHover(null);
      setSelected(key);
      const d = D.ch4.districts.find((x) => x.key === key);
      const row = d && d.years[yearKey];
      announce(
        row
          ? (row.suppressed
            ? `${d.name}, ${year}: receipts suppressed for disclosure control.`
            : `${d.name}, ${year}: ${fmtM(row.receipts)}, ${fmtPct(row.share)} of city receipts.`)
          : `${d.name}: no assigned district row in ${year}.`
      );
    };

    const moveTip = (event, district) => {
      const rect = wrapRef.current ? wrapRef.current.getBoundingClientRect() : { left: 0, top: 0, width: 720 };
      const x = clamp(event.clientX - rect.left + 14, 8, rect.width - 220);
      const y = clamp(event.clientY - rect.top + 14, 8, 560);
      setTip({ x, y, district });
      setHovered(district.key);
    };

    const reset = () => {
      setSelected(null);
      setYear(2025);
      setRankMetric("receipts");
      setHovered(null);
      setTip(null);
      setTrendHover(null);
      announce("Geography explorer reset.");
    };

    const moveMapFocus = (event) => {
      const keys = D.ch4.districts.map((d) => d.key);
      const current = keys.indexOf(focusKey);
      let next = null;
      if (event.key === "ArrowRight" || event.key === "ArrowDown") next = (current + 1) % keys.length;
      if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = (current - 1 + keys.length) % keys.length;
      if (event.key === "Home") next = 0;
      if (event.key === "End") next = keys.length - 1;
      if (next !== null) {
        event.preventDefault();
        const key = keys[next];
        setFocusKey(key);
        const node = document.querySelector(`[data-map-key="${key}"]`);
        if (node) node.focus();
      }
    };

    const changeYear = (next) => {
      setYear(next);
      announce(`Year ${next}.`);
    };

    return html`
      <div className="react-app ch4-app">
        <div className="app-head">
          <div>
            <p className="app-kicker">Interactive figure 4.1</p>
            <h3>The map of receipts, not the map of venues.</h3>
          </div>
          <div className="year-control">
            <button type="button" className="year-step" onClick=${() => changeYear(Math.max(2013, year - 1))} aria-label="Previous year">←</button>
            <label>
              <span>Year</span>
              <input type="range" min="2013" max="2025" step="1" value=${year} onChange=${(e) => changeYear(Number(e.target.value))} />
              <output>${year}</output>
            </label>
            <button type="button" className="year-step" onClick=${() => changeYear(Math.min(2025, year + 1))} aria-label="Next year">→</button>
          </div>
        </div>

        <div className="year-ticks" role="group" aria-label="Year">
          ${D.ch4.years.map((y) => html`
            <button type="button" key=${y} className=${`year-tick ${y === year ? "is-on" : ""}`} aria-pressed=${y === year} onClick=${() => changeYear(y)} title=${String(y)}>
              <span aria-hidden="true">${String(y).slice(2)}</span>
            </button>
          `)}
        </div>
        <div className="chart-controls map-controls">
          <div className="control-cluster">
            <span className="control-label">Order list by</span>
            <${Segmented} label="Order district list by" value=${rankMetric} options=${[
              { value: "receipts", label: "Real receipts" },
              { value: "share", label: "City share" },
            ]} onChange=${(value) => { setRankMetric(value); announce(`Ranking by ${value === "receipts" ? "real receipts" : "city share"}.`); }} />
          </div>
          <div className="control-cluster control-cluster--right">
            <span className="control-note">${year} · city total ${fmtM(denominator)}</span>
            <button type="button" className="reset-btn" onClick=${reset}>Reset explorer</button>
          </div>
        </div>

        <div className="map-layout">
          <section className="map-panel" aria-label=${`District map, ${year}`}>
            <div className="map-wrap" ref=${wrapRef}>
              <svg className=${`map-svg ${hovered || selected ? "has-focus" : ""}`} viewBox="0 0 720 620" role="group" aria-labelledby="ch4-map-title ch4-map-desc">
                <title id="ch4-map-title">${`Share of city real receipts by named district, ${year}`}</title>
                <desc id="ch4-map-desc">A central-Houston crop of 73 named districts. Districts with no assigned venue row are hatched grey; suppressed cells are hatched copper. Use the ranked list or focus a district to inspect it.</desc>
                <defs>
                  <pattern id="ch4-no-data" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                    <rect width="7" height="7" fill="#F1ECE2" />
                    <line x1="0" y1="0" x2="0" y2="7" stroke="#BDB5A6" strokeWidth="1.3" />
                  </pattern>
                  <pattern id="ch4-suppressed" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                    <rect width="6" height="6" fill="#F3E3D5" />
                    <line x1="0" y1="0" x2="0" y2="6" stroke="#B4653A" strokeWidth="1.3" />
                  </pattern>
                  <clipPath id="ch4-map-clip"><rect x="0" y="0" width="720" height="620" /></clipPath>
                </defs>
                <g clipPath="url(#ch4-map-clip)">
                  ${D.ch4.districts.map((d) => {
                    const row = d.years[yearKey];
                    const label = row
                      ? (row.suppressed
                        ? `${d.name}, ${year}: receipts suppressed for disclosure control, ${venueLabel(row.venues)}.`
                        : `${d.name}, ${year}: ${fmtMoney(row.receipts)} real receipts, ${fmtPct(row.share)} of city receipts, ${venueLabel(row.venues)}.`)
                      : `${d.name}: no assigned district row in ${year}.`;
                    return html`
                      <path
                        key=${d.key}
                        d=${d.path}
                        className=${`map-region ${selected === d.key ? "is-selected" : ""} ${hovered === d.key ? "is-hovered" : ""}`}
                        fill=${colorFor(d)}
                        role="button"
                        tabIndex=${d.key === focusKey ? 0 : -1}
                        data-map-key=${d.key}
                        aria-pressed=${selected === d.key}
                        aria-label=${label}
                        onMouseEnter=${(e) => moveTip(e, d)}
                        onMouseMove=${(e) => moveTip(e, d)}
                        onMouseLeave=${() => { setTip(null); setHovered(null); }}
                        onFocus=${() => { setFocusKey(d.key); setHovered(d.key); announce(label); }}
                        onClick=${() => select(d.key)}
                        onKeyDown=${(e) => {
                          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); select(d.key); return; }
                          if (e.key === "Escape") { setSelected(null); announce("Selection cleared."); return; }
                          moveMapFocus(e);
                        }}
                      />
                    `;
                  })}
                  ${D.ch4.noData.map((d) => html`<path key=${`nd-${d.name}`} d=${d.path} className="map-region no-data-region" fill="url(#ch4-no-data)" aria-hidden="true" />`)}
                </g>
                ${D.ch4.labels.map((l) => html`<text key=${l.key} x=${l.x} y=${l.y} className="map-label" textAnchor="middle">${l.name}</text>`)}
                ${selectedDistrict && selectedRow ? html`<text x=${selectedDistrict.labelX} y=${selectedDistrict.labelY} className="map-label map-label--selected" textAnchor="middle">${selectedDistrict.name}</text>` : null}
              </svg>
              ${tip ? html`<div className="map-tip" style=${{ left: `${tip.x}px`, top: `${tip.y}px` }} aria-hidden="true">
                <strong><i className="map-tip-swatch" style=${{ background: colorFor(tip.district) }}></i>${tip.district.name} · ${year}</strong>
                ${tip.district.years[yearKey] && tip.district.years[yearKey].suppressed ? html`
                  <div><span>Real receipts</span><b>Suppressed</b></div>
                  <div><span>Share of city</span><b>Suppressed</b></div>
                  <div><span>Active venues</span><b>${fmtInt(tip.district.years[yearKey].venues)}</b></div>
                  <small>Suppressed to avoid identifying a single venue. ${year} · ${fmtPct(coverage.assigned)} assigned; ${fmtPct(1 - coverage.assigned)} outside named districts.</small>
                ` : tip.district.years[yearKey] ? html`
                  <div><span>Real receipts</span><b>${fmtMoney(tip.district.years[yearKey].receipts)}</b></div>
                  <div><span>Share of city</span><b>${fmtPct(tip.district.years[yearKey].share)}</b></div>
                  <div><span>Active venues</span><b>${fmtInt(tip.district.years[yearKey].venues)}</b></div>
                  <small>${year} · ${fmtPct(coverage.assigned)} assigned; ${fmtPct(1 - coverage.assigned)} outside named districts.</small>
                ` : html`<p>No assigned district row in ${year}.</p>`}
              </div>` : null}
            </div>
            <div className="map-legend" role="group" aria-label="Map legend">
              <span className="legend-title">Share of city real receipts</span>
              ${D.ch4.bins.map((b) => html`<span key=${b.label}><i className="swatch" style=${{ background: b.color }}></i>${b.label}</span>`)}
              <span><i className="swatch no-data"></i>No assigned venues</span>
              <span><i className="swatch suppressed"></i>Suppressed</span>
            </div>
            <div className="coverage-strip" role="img" aria-label=${`${year} venue coverage: ${fmtPct(coverage.assigned)} assigned, ${fmtPct(coverage.unassigned)} unassigned, ${fmtPct(coverage.noGeocode)} no geocode.`}>
              <span style=${{ flex: coverage.assigned, background: "var(--color-accent-text)" }}>${fmtPct(coverage.assigned)}</span>
              <span style=${{ flex: coverage.unassigned, background: "var(--color-context)", color: "var(--color-ink)" }}>${fmtPct(coverage.unassigned)}</span>
              <span style=${{ flex: coverage.noGeocode, background: "var(--color-unknown)", color: "var(--color-ink)" }}>${fmtPct(coverage.noGeocode)}</span>
            </div>
            <div className="coverage-note">
              <span><b>${fmtPct(coverage.assigned)}</b> assigned</span>
              <span><b>${fmtPct(coverage.unassigned)}</b> unassigned</span>
              <span><b>${fmtPct(coverage.noGeocode)}</b> no geocode</span>
              <span>Named districts only; the map does not show the unassigned share.</span>
              ${D.meta && D.meta.disclosure ? html`<span>Mapped districts hold roughly 71–80% of city receipts depending on year; suppressed districts are hatched, not zero. The city total is not the sum of the visible values.</span>` : null}
            </div>
            <p className="map-hint">Keyboard: Tab to the map, use arrow keys to move between districts, Enter or Space selects, Escape clears.</p>
          </section>

          <div className="map-side">
            <div className="map-detail" aria-live="polite">
              ${selectedDistrict ? html`
                <p className="app-kicker">Selected district</p>
                <h4>${selectedDistrict.name}</h4>
                ${selectedRow && selectedRow.suppressed ? html`
                  <p className="detail-value">Suppressed <span>for disclosure control</span></p>
                  <p className="detail-sub">${venueLabel(selectedRow.venues)} in ${year}. A cell is suppressed when it has fewer than three venues, or when one venue dominates its receipts.</p>
                ` : selectedRow ? html`
                  <p className="detail-value">${fmtMoney(selectedRow.receipts)} <span>${fmtPct(selectedRow.share)} of city receipts</span></p>
                  <p className="detail-sub">${venueLabel(selectedRow.venues)} in ${year}. ${fmtM(denominator)} city total.</p>
                ` : html`<p className="detail-sub">No assigned district row in ${year}. See the coverage note.</p>`}
              ` : html`
                <p className="app-kicker">Explore a district</p>
                <p className="detail-sub">Hover, focus or tap a district on the map, or choose one from the ranking. The trend will follow your selection.</p>
              `}
            </div>

            <div className="rank-head">
              <h4>District ranking</h4>
              <span>${year} · ${rankMetric === "receipts" ? "real receipts" : "city share"}</span>
            </div>
            <ol className="rank-list">
              ${top.map((d, i) => {
                const value = d.years[yearKey][rankMetric];
                return html`
                  <li key=${d.key}>
                    <button type="button" className=${`rank-row ${selected === d.key ? "is-selected" : ""}`} onClick=${() => select(d.key)} onMouseEnter=${() => setHovered(d.key)} onMouseLeave=${() => setHovered(null)} onFocus=${() => setHovered(d.key)} onBlur=${() => setHovered(null)} aria-pressed=${selected === d.key}>
                      <span className="rank-num">${String(i + 1).padStart(2, "0")}</span>
                      <span className="rank-name">${d.name}</span>
                      <span className="rank-bar" aria-hidden="true"><i style=${{ width: `${Math.max(2, value / maxRank * 100)}%` }}></i></span>
                      <span className="rank-value">${rankMetric === "receipts" ? fmtM(value) : fmtPct(value)}</span>
                    </button>
                  </li>
                `;
              })}
            </ol>

            <div className="trend-panel">
              <div className="panel-head"><span>District trend</span><small>${selectedDistrict ? (trendPoint ? (trendPoint.share !== null ? `${trendActive} · ${fmtPct(trendPoint.share)}` : `${trendActive} · suppressed`) : "No data") : "Select a district"}</small></div>
              ${selectedDistrict && trendHasData ? html`
                <div className="chart-canvas" style=${{ height: "190px" }}>
                  <${ResponsiveContainer} width="100%" height="100%">
                    <${LineChart} data=${trend} margin=${{ top: 8, right: 10, bottom: 0, left: 0 }} accessibilityLayer onMouseMove=${(state) => { if (state && state.activeLabel) setTrendHover(Number(state.activeLabel)); }} onMouseLeave=${() => setTrendHover(null)}>
                      <${CartesianGrid} stroke="var(--color-rule-light)" vertical=${false} />
                      <${ReferenceArea} x1=${trendActive - 0.42} x2=${trendActive + 0.42} fill="var(--color-accent)" fillOpacity=${0.06} ifOverflow="hidden" />
                      <${XAxis} dataKey="year" type="number" domain=${[2013, 2025]} tickCount=${5} tickFormatter=${(v) => String(v)} stroke="var(--color-rule)" tick=${{ fill: "var(--color-ink-muted)", fontSize: 9, fontFamily: "var(--font-mono)" }} />
                      <${YAxis} domain=${[0, 0.12]} ticks=${[0, 0.04, 0.08, 0.12]} width=${42} tickFormatter=${(v) => `${Math.round(v * 100)}%`} stroke="var(--color-rule)" tick=${{ fill: "var(--color-ink-muted)", fontSize: 9, fontFamily: "var(--font-mono)" }} />
                      <${ReferenceLine} x=${trendActive} stroke=${trendHover ? "var(--color-accent)" : "var(--color-accent-text)"} strokeDasharray=${trendHover ? undefined : "3 3"} />
                      ${trendPoint && trendPoint.share !== null ? html`<${ReferenceDot} x=${trendActive} y=${trendPoint.share} r=${3.6} fill="var(--color-paper)" stroke="var(--color-accent)" strokeWidth=${2.2} isFront />` : null}
                      <${Tooltip} cursor=${false} content=${({ active, payload, label }) => {
                        if (!active || !payload || !payload.length) return null;
                        const row = payload[0].payload;
                        if (row.suppressed) return html`<div className="chart-tip" aria-hidden="true"><strong>${label}</strong><div className="tip-row"><span>City share</span><b>Suppressed</b></div><div className="tip-row"><span>Real receipts</span><b>Suppressed</b></div><div className="tip-foot">${venueLabel(row.venues)}</div></div>`;
                        const i = D.ch4.years.indexOf(Number(label));
                        const priorRow = i > 0 ? (selectedDistrict.years[String(D.ch4.years[i - 1])] || null) : null;
                        const prior = priorRow && !priorRow.suppressed ? priorRow : null;
                        return html`<div className="chart-tip" aria-hidden="true"><strong>${label}</strong><div className="tip-row"><span>City share</span><b>${fmtPct(row.share)}</b><${Delta} value=${prior ? ppDelta(row.share, prior.share) : null} kind="pp" /></div><div className="tip-row"><span>Real receipts</span><b>${fmtM(row.receipts)}</b></div><div className="tip-foot">${venueLabel(row.venues)}</div></div>`;
                      }} />
                      <${Area} type="monotone" dataKey="share" fill="var(--color-accent)" fillOpacity=${0.08} stroke="none" isAnimationActive=${false} />
                      <${Line} type="monotone" dataKey="share" stroke="var(--color-accent)" strokeWidth=${2.4} dot=${false} activeDot=${false} isAnimationActive=${false} />
                    <//>
                  <//>
                </div>
              ` : html`<p className="empty-note">Select a district to see its 2013–2025 trend.</p>`}
            </div>
          </div>
        </div>
        <${Status}>${status || `Map shows ${year}; ${fmtPct(coverage.assigned)} of strict-city venues assign to a named district.`}<//>
        <p className="app-source">Aggregate district values only. No venue coordinates. Current-vintage district boundaries; the map uses a central-Houston crop.</p>
      </div>
    `;
  }


  function Ch4Change() {
    const [active, setActive] = useState(null);
    const [status, announce] = useStatus();
    const rows = useMemo(() => D.ch4.districts.map((d) => {
      const a = d.years["2013"];
      const b = d.years["2025"];
      if (!a || !b) return null;
      if (D.ch4.years.some((y) => d.years[String(y)] && d.years[String(y)].suppressed)) return null;
      return {
        key: d.key,
        name: d.name,
        r13: a.receipts,
        r25: b.receipts,
        delta: b.receipts - a.receipts,
        pct: a.receipts ? (b.receipts - a.receipts) / a.receipts : 0,
        v13: a.venues,
        v25: b.venues,
      };
    }).filter(Boolean).sort((a, b) => b.delta - a.delta), []);
    const focusRows = useMemo(() => [...rows.slice(0, 6), ...rows.slice(-6).reverse()], [rows]);
    const current = rows.find((r) => r.key === active) || focusRows[0];
    const max = Math.max(...focusRows.map((r) => Math.abs(r.delta)), 1);

    const choose = (row) => {
      setActive(row.key);
      announce(`${row.name}: ${fmtM(row.delta)} change, ${fmtPct(row.pct)}.`);
    };

    return html`
      <div className="react-app">
        <div className="app-head">
          <div>
            <p className="app-kicker">Interactive figure 4.3</p>
            <h3>Where receipts moved.</h3>
          </div>
          <div className="state-total"><span>Level change</span><b>${fmtM(current.delta)}</b><small>${current.name}, 2013–2025</small></div>
        </div>
        <div className="change-list" role="group" aria-label="District receipt change">
          ${focusRows.map((row, i) => html`
            ${i === 6 ? html`<div className="change-split" key="split"><span>Largest declines</span></div>` : null}
            <button
              type="button"
              key=${row.key}
              className=${`change-row ${current.key === row.key ? "is-active" : ""}`}
              onClick=${() => choose(row)}
              onMouseEnter=${() => setActive(row.key)}
              onFocus=${() => setActive(row.key)}
            >
              <span className="change-name">${row.name}</span>
              <span className="change-track" aria-hidden="true">
                <i className=${row.delta >= 0 ? "positive" : "negative"} style=${{ width: `${Math.max(1, Math.abs(row.delta) / max * 50)}%` }}></i>
              </span>
              <span className="change-value"><b className=${row.delta >= 0 ? "positive" : "negative"}>${fmtM(row.delta)}</b><small>${fmtPct(row.pct)}</small></span>
            </button>
          `)}
        </div>
        <div className="change-detail" aria-live="polite">
          <b>${current.name}</b>
          <span>${fmtMoney(current.r13)} in 2013 → ${fmtMoney(current.r25)} in 2025</span>
          <span>${fmtInt(current.v13)} → ${fmtInt(current.v25)} active venues</span>
        </div>
        <${Status}>${status || "Select or focus a district to read its exact change."}<//>
        <${DataTable}
          caption="Figure 4.3 values, 2013–2025"
          columns=${[
            { key: "name", label: "District" },
            { key: "r13", label: "2013", align: "right", format: fmtMoney },
            { key: "r25", label: "2025", align: "right", format: fmtMoney },
            { key: "delta", label: "Change", align: "right", format: fmtMoney },
            { key: "pct", label: "Change %", align: "right", format: (v) => fmtPct(v) },
          ]}
          rows=${focusRows}
          focusYear=${2025}
          note=${D.meta && D.meta.disclosure ? "Assigned named districts only. Districts with any suppressed year are omitted, so this ranks 21 of 73 districts, not all of them. Published districts cover roughly 71–80% of city receipts, and the city total is not their sum. Real receipts in June 2026 dollars. Level change is not the same as citywide-share change." : "Assigned named districts only. Districts with any suppressed year are omitted. Real receipts in June 2026 dollars. Level change is not the same as citywide-share change."}
        />
      </div>
    `;
  }

  function Ch4Clusters() {
    const [focusYear, setFocusYear] = useState(2025);
    const [hoverYear, setHoverYear] = useState(null);
    const [status, announce] = useStatus();
    const rows = D.ch4.clusters.years.map((year, i) => ({
      year,
      real: D.ch4.clusters.realShare[i],
      venues: D.ch4.clusters.venueShare[i],
    }));
    const activeYear = hoverYear || focusYear;
    const activeRow = rows.find((r) => r.year === activeYear) || rows[rows.length - 1];
    const prevRow = rows.find((r) => r.year === activeYear - 1) || null;
    const pointDelta = (key) => {
      if (!prevRow) return null;
      const diff = ppDelta(activeRow[key], prevRow[key]);
      return { tone: diff >= 0 ? "up" : "down", text: `${diff >= 0 ? "+" : "−"}${Math.abs(diff * 100).toFixed(1)} pp vs ${prevRow.year}` };
    };
    return html`
      <div className="react-app">
        <div className="app-head">
          <div>
            <p className="app-kicker">Interactive figure 4.4</p>
            <h3>Clusters held a rising share, then gave some back.</h3>
          </div>
          <${FocusYear} id="ch4-clusters-year" value=${focusYear} years=${D.ch4.years} onChange=${(year) => { setFocusYear(year); setHoverYear(null); announce(`Inspecting ${year}.`); }} />
        </div>
        <div className="chart-panel">
          <div className="panel-head"><span>Share inside frozen clusters</span><small>${activeYear} · ${fmtPct(activeRow.real)} receipts</small></div>
          <div className="chart-legend">
            <span><i style=${{ background: "var(--color-accent)" }}></i>Receipt share</span>
            <span><i style=${{ background: "var(--color-compare)" }}></i>Venue share</span>
          </div>
          <div className="chart-canvas" style=${{ height: "300px" }}>
            <${ResponsiveContainer} width="100%" height="100%">
              <${LineChart} data=${rows} margin=${{ top: 14, right: 28, bottom: 0, left: 0 }} accessibilityLayer onMouseMove=${(state) => { if (state && state.activeLabel) { setHoverYear(Number(state.activeLabel)); setFocusYear(Number(state.activeLabel)); } }} onMouseLeave=${() => setHoverYear(null)}>
                <${CartesianGrid} stroke="var(--color-rule-light)" vertical=${false} />
                <${XAxis} dataKey="year" type="number" domain=${[2013, 2025]} tickCount=${6} tickFormatter=${(v) => String(v)} stroke="var(--color-rule)" tick=${{ fill: "var(--color-ink-muted)", fontSize: 10, fontFamily: "var(--font-mono)" }} />
                <${YAxis} domain=${[0, 0.55]} ticks=${[0, 0.2, 0.4]} width=${42} tickFormatter=${(v) => v.toFixed(1)} stroke="var(--color-rule)" tick=${{ fill: "var(--color-ink-muted)", fontSize: 10, fontFamily: "var(--font-mono)" }} />
                ${hoverYear ? html`<${ReferenceArea} x1=${activeYear - 0.42} x2=${activeYear + 0.42} fill="var(--color-accent)" fillOpacity=${0.06} ifOverflow="hidden" />` : null}
                <${ReferenceLine} x=${activeYear} stroke=${hoverYear ? "var(--color-accent)" : "var(--color-accent-text)"} strokeDasharray=${hoverYear ? undefined : "3 3"} />
                <${ReferenceDot} x=${activeYear} y=${activeRow.real} r=${3.6} fill="var(--color-paper)" stroke="var(--color-accent)" strokeWidth=${2.2} isFront />
                <${ReferenceDot} x=${activeYear} y=${activeRow.venues} r=${3.6} fill="var(--color-paper)" stroke="var(--color-compare)" strokeWidth=${2.2} isFront />
                <${ReferenceDot} x=${2023} y=${rows[10].real} r=${3.5} fill="var(--color-accent)" stroke="var(--color-paper)" strokeWidth=${1.2} label=${{ value: "2023 peak", position: "top", fill: "var(--color-ink-muted)", fontSize: 9, fontFamily: "var(--font-mono)" }} />
                <${Tooltip} cursor=${false} content=${({ active, payload, label }) => {
                  if (!active || !payload || !payload.length) return null;
                  const row = payload[0].payload;
                  const i = rows.findIndex((r) => r.year === Number(label));
                  const prior = i > 0 ? rows[i - 1] : null;
                  return html`<div className="chart-tip" aria-hidden="true"><strong>${label}</strong><div className="tip-row"><span>Receipt share</span><b>${fmtPct(row.real)}</b><${Delta} value=${prior ? ppDelta(row.real, prior.real) : null} kind="pp" /></div><div className="tip-row"><span>Venue share</span><b>${fmtPct(row.venues)}</b><${Delta} value=${prior ? ppDelta(row.venues, prior.venues) : null} kind="pp" /></div><div className="tip-foot">Frozen DBSCAN cluster layer</div></div>`;
                }} />
                <${Area} type="monotone" dataKey="real" fill="var(--color-accent)" fillOpacity=${0.08} stroke="none" isAnimationActive=${false} />
                <${Line} type="monotone" dataKey="real" name="Receipt share" stroke="var(--color-accent)" strokeWidth=${2.4} dot=${false} activeDot=${false} isAnimationActive=${false} />
                <${Line} type="monotone" dataKey="venues" name="Venue share" stroke="var(--color-compare)" strokeWidth=${2} dot=${false} activeDot=${false} isAnimationActive=${false} />
              <//>
            <//>
          </div>
        </div>
        <${Readout} items=${[
          { label: `${activeYear} receipt share`, value: fmtPct(activeRow.real), delta: pointDelta("real") },
          { label: `${activeYear} venue share`, value: fmtPct(activeRow.venues), delta: pointDelta("venues") },
        ]} />
        <${Status}>${status || "Hover or inspect a year to see both cluster shares."}<//>
        <${DataTable}
          caption="Figure 4.4 values, 2013–2025"
          columns=${[
            { key: "year", label: "Year" },
            { key: "real", label: "Receipt share", align: "right", format: (v) => fmtPct(v) },
            { key: "venues", label: "Venue share", align: "right", format: (v) => fmtPct(v) },
          ]}
          rows=${rows}
          focusYear=${focusYear}
          note="Shares are relative to the fixed frozen cluster specification (0.35 km radius, minimum 5 venues)."
        />
      </div>
    `;
  }

  function Ch4Coverage() {
    const [year, setYear] = useState(2025);
    const [status, announce] = useStatus();
    const rows = [2013, 2019, 2025].map((y) => ({ year: y, ...D.ch4.coverage[String(y)] }));
    const current = rows.find((r) => r.year === year) || rows[rows.length - 1];
    return html`
      <div className="react-app">
        <div className="app-head">
          <div>
            <p className="app-kicker">Interactive figure 4.5</p>
            <h3>One venue in five has no named district.</h3>
          </div>
          <div className="state-total"><span>Outside</span><b>${fmtPct(1 - current.assigned)}</b><small>${year} coverage</small></div>
        </div>
        <div className="chart-controls">
          <div className="control-cluster">
            <span className="control-label">Year</span>
            <${Segmented} label="Coverage year" value=${String(year)} options=${rows.map((r) => ({ value: String(r.year), label: String(r.year) }))} onChange=${(value) => { setYear(Number(value)); announce(`Coverage for ${value}.`); }} />
          </div>
          <span className="control-note">Shares of strict-city venues with positive receipts.</span>
        </div>
        <div className="coverage-strip coverage-strip--large" role="img" aria-label=${`${year}: ${fmtPct(current.assigned)} assigned, ${fmtPct(current.unassigned)} unassigned, ${fmtPct(current.noGeocode)} no geocode.`}>
          <span style=${{ flex: current.assigned, background: "var(--color-accent-text)" }}>${fmtPct(current.assigned)}</span>
          <span style=${{ flex: current.unassigned, background: "var(--color-context)", color: "var(--color-ink)" }}>${fmtPct(current.unassigned)}</span>
          <span style=${{ flex: current.noGeocode, background: "var(--color-unknown)", color: "var(--color-ink)" }}>${fmtPct(current.noGeocode)}</span>
        </div>
        <div className="bar-legend">
          <span><i className="swatch" style=${{ background: "var(--color-accent-text)" }}></i>Assigned to a named district</span>
          <span><i className="swatch sand"></i>Unassigned, strict city</span>
          <span><i className="swatch muted"></i>No usable geocode</span>
        </div>
        <${Status}>${status || `${year}: ${fmtPct(1 - current.assigned)} outside a named district.`}<//>
        <${DataTable}
          caption="Figure 4.5 values"
          columns=${[
            { key: "year", label: "Year" },
            { key: "assigned", label: "Assigned", align: "right", format: (v) => fmtPct(v) },
            { key: "unassigned", label: "Unassigned", align: "right", format: (v) => fmtPct(v) },
            { key: "noGeocode", label: "No geocode", align: "right", format: (v) => fmtPct(v) },
          ]}
          rows=${rows}
          focusYear=${year}
          note="The map shows named districts only; unassigned and ungeocoded venues are not on the map."
        />
      </div>
    `;
  }

  function Ch6Events() {
    const [active, setActive] = useState("validated");
    const [status, announce] = useStatus();
    const events = D.ch6.events;
    const groups = [
      { key: "validated", name: "Validated exit", count: events.validated, tone: "accent-text", definition: "A validated exit event in the competing-risk dataset." },
      { key: "censored", name: "Censored", count: events.censored, tone: "context", definition: "Censored at the panel end; not treated as survivors." },
      { key: "ordinary", name: "Ordinary closure", count: events.ordinary, tone: "accent-text", definition: "A validated exit without a documented successor." },
      { key: "succession", name: "Concept succession", count: events.succession, tone: "accent-soft", definition: "A documented concept replacement at the same premise." },
      { key: "relocation", name: "Relocation", count: events.relocation, tone: "compare", definition: "A documented relocation edge." },
    ];
    const current = groups.find((g) => g.key === active) || groups[0];
    const total = events.validated + events.censored;
    const isExitGroup = ["ordinary", "succession", "relocation"].includes(current.key);
    const shareDenominator = isExitGroup ? events.validated : total;
    const shareLabel = isExitGroup ? "of 2,668 events" : "of 8,445";
    return html`
      <div className="react-app">
        <div className="app-head">
          <div>
            <p className="app-kicker">Interactive figure 6.3</p>
            <h3>Most of the panel is censored, not exited.</h3>
          </div>
          <div className="state-total"><span>Panel</span><b>${fmtInt(total)}</b><small>8,445 all-panel denominator</small></div>
        </div>
        <div className="event-bar" role="group" aria-label=${`Validated exit ${fmtInt(events.validated)}, censored ${fmtInt(events.censored)}.`}>
          <button type="button" className=${`event-seg ${active === "validated" ? "is-active" : ""}`} style=${{ flex: events.validated, background: "var(--color-accent-text)" }} onClick=${() => { setActive("validated"); announce("Validated exits selected."); }} aria-pressed=${active === "validated"}>Validated ${fmtInt(events.validated)}</button>
          <button type="button" className=${`event-seg ${active === "censored" ? "is-active" : ""}`} style=${{ flex: events.censored, background: "var(--color-paper-deep)", color: "var(--color-ink)" }} onClick=${() => { setActive("censored"); announce("Censored venues selected."); }} aria-pressed=${active === "censored"}>Censored ${fmtInt(events.censored)}</button>
        </div>
        <p className="bar-scale-note">Below: the 2,668 validated events, drawn on their own scale.</p>
        <div className="event-bar event-bar--small" role="group" aria-label=${`Ordinary ${fmtInt(events.ordinary)}, succession ${fmtInt(events.succession)}, relocation ${fmtInt(events.relocation)}.`}>
          <button type="button" className=${`event-seg ${active === "ordinary" ? "is-active" : ""}`} style=${{ flex: events.ordinary, background: "var(--color-accent-text)" }} onClick=${() => { setActive("ordinary"); announce("Ordinary closures selected."); }} aria-pressed=${active === "ordinary"}>Ordinary ${fmtInt(events.ordinary)}</button>
          <button type="button" className=${`event-seg ${active === "succession" ? "is-active" : ""}`} style=${{ flex: events.succession, background: "var(--color-accent-soft)", color: "var(--color-ink)" }} onClick=${() => { setActive("succession"); announce("Concept successions selected."); }} aria-pressed=${active === "succession"}>Succession ${fmtInt(events.succession)}</button>
          <button type="button" className=${`event-seg event-seg--tiny ${active === "relocation" ? "is-active" : ""}`} style=${{ flex: events.relocation, background: "var(--color-compare)" }} onClick=${() => { setActive("relocation"); announce("Relocations selected."); }} aria-pressed=${active === "relocation"}><span className="seg-prefix">Reloc. </span>${fmtInt(events.relocation)}</button>
        </div>
        <div className="state-detail" aria-live="polite">
          <div className="detail-head"><h4>${current.name}</h4><b>${fmtInt(current.count)}</b><span>${fmtPct(current.count / shareDenominator)} ${shareLabel}</span></div>
          <p>${current.definition}</p>
        </div>
        <${Status}>${status || "Select a segment to inspect its count and definition."}<//>
        <${DataTable}
          caption="Figure 6.3 values"
          columns=${[
            { key: "name", label: "Group" },
            { key: "count", label: "Venues", align: "right", format: fmtInt },
            { key: "share", label: "Share of 8,445", align: "right", format: (v) => fmtPct(v) },
          ]}
          rows=${groups.map((g) => ({ ...g, share: g.count / total }))}
          focusYear=${2025}
          note="Censored includes operating, unknown, dormant, likely-closed, and 11 closed venues with no observed competing-risk event."
        />
      </div>
    `;
  }

  // ------------------------------------------------------------ Chapter 6

  const toneVar = (tone) => `var(--color-${tone})`;

  function Ch6Composition() {
    const [mode, setMode] = useState("final");
    const [selected, setSelected] = useState("operating");
    const [hoverKey, setHoverKey] = useState(null);
    const [status, announce] = useStatus();
    const modeData = D.ch6.modes[mode];
    const items = modeData.items;
    const active = items.find((it) => it.key === selected) || items[0];

    useEffect(() => {
      if (!items.some((it) => it.key === selected)) setSelected(items[0].key);
    }, [mode]);

    const select = (item) => {
      setSelected(item.key);
      announce(`${item.name}: ${fmtInt(item.count)} of ${fmtInt(modeData.denominator)} (${fmtPct(item.count / modeData.denominator)}). ${item.definition}`);
    };

    return html`
      <div className="react-app">
        <div className="app-head">
          <div>
            <p className="app-kicker">Interactive figure 6.1</p>
            <h3>${mode === "final" ? "One panel, six final states." : mode === "classified" ? "Classified exit types." : "Competing-risk events."}</h3>
          </div>
          <div className="state-total"><span>Denominator</span><b>${fmtInt(modeData.denominator)}</b><small>${modeData.label}</small></div>
        </div>
        <div className="chart-controls">
          <div className="control-cluster">
            <span className="control-label">View</span>
            <${Segmented} label="Closure view" value=${mode} options=${[
              { value: "final", label: "Final states" },
              { value: "classified", label: "Classified exits" },
              { value: "competing", label: "Competing-risk events" },
            ]} onChange=${(value) => { setMode(value); announce(`${D.ch6.modes[value].label} selected.`); }} />
          </div>
          <span className="control-note">${modeData.note}</span>
        </div>
        <div className="state-bar" role="img" aria-label=${items.map((it) => `${it.name}: ${fmtInt(it.count)} (${fmtPct(it.count / modeData.denominator)})`).join("; ")}>
          ${items.map((it) => html`<span key=${it.key} className=${`state-seg ${active.key === it.key ? "is-active" : ""} ${hoverKey === it.key ? "is-hovered" : ""}`} style=${{ flex: it.count, background: toneVar(it.tone) }} title=${`${it.name}: ${fmtInt(it.count)}`} onMouseEnter=${() => setHoverKey(it.key)} onMouseLeave=${() => setHoverKey(null)}></span>`)}
        </div>
        <div className="state-list" role="group" aria-label="Select a category">
          ${items.map((it) => html`
            <button type="button" key=${it.key} className=${`state-item ${active.key === it.key ? "is-selected" : ""}`} aria-pressed=${active.key === it.key} onClick=${() => select(it)} onMouseEnter=${() => setHoverKey(it.key)} onMouseLeave=${() => setHoverKey(null)}>
              <i className="state-swatch" style=${{ background: toneVar(it.tone) }} aria-hidden="true"></i>
              <span className="state-name">${it.name}</span>
              <span className="state-count">${fmtInt(it.count)}</span>
              <span className="state-share">${fmtPct(it.count / modeData.denominator)}</span>
            </button>
          `)}
        </div>
        <div className="state-detail" aria-live="polite">
          <div className="detail-head"><h4>${active.name}</h4><b>${fmtInt(active.count)}</b><span>${fmtPct(active.count / modeData.denominator)} of ${fmtInt(modeData.denominator)}</span></div>
          <p>${active.definition}</p>
          <p className="detail-note">${active.censoring}</p>
        </div>
        <div className="censor-note"><b>Censoring:</b> ${fmtInt(D.ch6.events.censored)} venues are censored at the panel end. Final-state labels are classifications, not observed transitions.</div>
        <${Status}>${status || `${modeData.label}: ${fmtInt(modeData.denominator)} venues. Select a state to read its count and definition.`}<//>
      </div>
    `;
  }

  function Ch6Reconciliation() {
    const [grainKey, setGrainKey] = useState("classified");
    const [status, announce] = useStatus();
    const grain = D.ch6.grains.find((g) => g.key === grainKey) || D.ch6.grains[0];
    const common = 2684;
    const items = [
      { key: "ordinary", name: "Ordinary closure", count: grain.ordinary, tone: "accent-text" },
      { key: "succession", name: "Concept succession", count: grain.succession, tone: "accent-soft" },
      { key: "relocation", name: "Relocation", count: grain.relocation, tone: "compare" },
    ].filter((it) => it.count > 0);

    const select = (g) => {
      setGrainKey(g.key);
      announce(`${g.name}: ${fmtInt(g.total)}. ${g.definition}`);
    };

    return html`
      <div className="react-app">
        <div className="app-head">
          <div>
            <p className="app-kicker">Interactive figure 6.2</p>
            <h3>The same exits, count grains.</h3>
          </div>
          <div className="state-total"><span>Selected grain</span><b>${fmtInt(grain.total)}</b><small>${grain.name}</small></div>
        </div>
        <div className="chart-controls">
          <div className="control-cluster">
            <span className="control-label">Count grain</span>
            <${Segmented} label="Count grain" value=${grainKey} options=${D.ch6.grains.map((g) => ({ value: g.key, label: g.name }))} onChange=${(key) => select(D.ch6.grains.find((g) => g.key === key))} />
          </div>
          <span className="control-note">Comparison bars below use a common 2,684 scale.</span>
        </div>
        <div className="grain-bar" role="img" aria-label=${items.map((it) => `${it.name}: ${fmtInt(it.count)}`).join("; ")}>
          ${items.map((it) => html`<span key=${it.key} className="grain-seg" style=${{ flex: it.count, background: toneVar(it.tone) }} title=${`${it.name}: ${fmtInt(it.count)}`}></span>`)}
        </div>
        <div className="grain-legend">
          ${items.map((it) => html`<span key=${it.key}><i className="swatch" style=${{ background: toneVar(it.tone) }}></i>${it.name} <b>${fmtInt(it.count)}</b></span>`)}
        </div>
        <div className="grain-scale">
          ${D.ch6.grains.map((g) => html`
            <button type="button" key=${g.key} className=${`grain-row ${g.key === grainKey ? "is-selected" : ""}`} onClick=${() => select(g)} aria-pressed=${g.key === grainKey}>
              <span className="grain-name">${g.name}</span>
              <span className="grain-track" aria-hidden="true"><i style=${{ width: `${g.total / common * 100}%` }}></i></span>
              <span className="grain-total">${fmtInt(g.total)}</span>
            </button>
          `)}
        </div>
        <div className="state-detail" aria-live="polite">
          <div className="detail-head"><h4>${grain.name}</h4><b>${fmtInt(grain.total)}</b><span>${grain.definition}</span></div>
          <p className="detail-note">${grain.note}</p>
        </div>
        <div className="censor-note"><b>8,445 all-panel denominator.</b> The 5 likely-closed venues are censored in the primary competing-risk view; 10 ordinary and 1 succession closed venues carry no observed event. Censored at panel end: ${fmtInt(D.ch6.events.censored)}.</div>
        <${Status}>${status || `${grain.name}: ${fmtInt(grain.total)}. Select a grain to inspect the arithmetic.`}<//>
      </div>
    `;
  }

  // ------------------------------------------------------------ mount

  function App({ app }) {
    if (!D) return html`<p className="app-error">Chart data did not load. <a href="../report/index.html">Open the full report</a>.</p>`;
    switch (app) {
      case "ch3-growth": return html`<${Ch3Growth} />`;
      case "ch3-receipts": return html`<${Ch3Receipts} />`;
      case "ch3-gini": return html`<${Ch3Concentration} />`;
      case "ch4-map": return html`<${Ch4Explorer} />`;
      case "ch4-change": return html`<${Ch4Change} />`;
      case "ch4-clusters": return html`<${Ch4Clusters} />`;
      case "ch4-coverage": return html`<${Ch4Coverage} />`;
      case "ch6-states": return html`<${Ch6Composition} />`;
      case "ch6-grains": return html`<${Ch6Reconciliation} />`;
      case "ch6-events": return html`<${Ch6Events} />`;
      default: return html`<p className="app-error">Unknown chart mount: ${app}</p>`;
    }
  }

  const started = performance.now();
  document.querySelectorAll("[data-react-app]").forEach((el) => {
    try {
      createRoot(el).render(html`<${App} app=${el.getAttribute("data-react-app")} />`);
    } catch (err) {
      console.error(err);
      el.innerHTML = `<p class="app-error">Interactive chart failed to load. <a href="../report/index.html">Open the full report</a>.</p>`;
    }
  });
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const mountMs = Math.round(performance.now() - started);
    document.documentElement.dataset.hnlMountMs = String(mountMs);
    window.HNL_PERF = { mountMs, charts: document.querySelectorAll("[data-react-app]").length };
  }));
})();
