/* Published measurements only: no fitted or simulated result curves. */
(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const methods = {
    race: "RACE", loss: "Validation Loss", mse: "Validation MSE", omn: "Off-Manifold Norm",
  };
  const scoreLabel = (method) => (method === "race" ? "" : "−") + methods[method];
  const metricLabels = { spearman: "Spearman ρ ↑", mmrv: "MMRV ↓", nregret: "nRegret ↓" };
  const families = { vla: "π₀.₅-DROID VLA", dp: "DROID Diffusion Policy" };
  const media = {
    fruit: "three-fruit", stack_cup: "nest-cups", two_cubes: "two-cubes",
    apple: "apple", pan: "pan", pet: "pet",
  };
  const state = { family: "vla", task: "all", method: "race", source: 0 };
  let data;

  function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  }

  function svgElement(tag, attributes = {}, text) {
    const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
    Object.entries(attributes).forEach(([key, value]) => node.setAttribute(key, value));
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function svgText(svg, x, y, text, attributes = {}) {
    svg.append(svgElement("text", {
      x, y, fill: "#66706b", "font-family": "inherit", "font-size": 14,
      ...attributes,
    }, text));
  }

  function mark(shape, x, y, color, radius = 6) {
    const style = { fill: color, stroke: "#fff", "stroke-width": 1.5, class: "chart-point" };
    if (shape === "square") return svgElement("rect", {
      ...style, x: x - radius, y: y - radius, width: radius * 2, height: radius * 2, rx: 1,
    });
    const points = shape === "triangle"
      ? `${x},${y - radius * 1.3} ${x - radius * 1.15},${y + radius} ${x + radius * 1.15},${y + radius}`
      : `${x},${y - radius * 1.3} ${x - radius * 1.3},${y} ${x},${y + radius * 1.3} ${x + radius * 1.3},${y}`;
    return svgElement("polygon", { ...style, points });
  }

  function table(container, caption, headers, rows) {
    const node = element("table", undefined, "results-table");
    node.append(element("caption", caption));
    const head = element("thead");
    const labels = element("tr");
    headers.forEach((label) => {
      const cell = element("th", label);
      cell.scope = "col";
      labels.append(cell);
    });
    head.append(labels);
    node.append(head);
    const body = element("tbody");
    rows.forEach(({ values, className }) => {
      const row = element("tr", undefined, className);
      values.forEach((value, index) => {
        const cell = element(index === 0 ? "th" : "td", value);
        if (index === 0) cell.scope = "row";
        row.append(cell);
      });
      body.append(row);
    });
    node.append(body);
    container.replaceChildren(node);
  }

  const fixed = (value) => value.toFixed(3);
  const rawNumber = (value) => Number(value.toPrecision(7)).toString();
  const success = (value) => `${(value * 100).toFixed(1)}%`;
  const profile = () => data.real[state.family];
  const visibleTasks = () => Object.keys(profile().tasks).filter((task) => state.task === "all" || task === state.task);

  function renderScatter() {
    const current = profile();
    const methodKey = current.method_keys[state.method];
    const svg = $("ranking-chart");
    const compact = svg.clientWidth < 560;
    const width = compact ? Math.max(320, Math.round(svg.clientWidth)) : 720;
    const taskNames = visibleTasks().map((task) => current.tasks[task].name).join(", ");
    svg.replaceChildren();
    svg.setAttribute("viewBox", `0 0 ${width} ${compact ? 450 : 430}`);
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-labelledby", "ranking-chart-title ranking-chart-description");
    svg.append(svgElement("title", { id: "ranking-chart-title" }, `${families[state.family]}: ${scoreLabel(state.method)} and measured success`));
    svg.append(svgElement("desc", { id: "ranking-chart-description" }, `Checkpoint scatter for ${taskNames}. Both axes use within-task z-scores. Exact checkpoint measurements are in the table below. The metric cards follow the selected task filter.`));
    const box = compact
      ? { left: 54, right: width - 15, top: 90, bottom: 390 }
      : { left: 76, right: 684, top: 56, bottom: 363 };
    const [xmin, xmax] = current.axes.xlim;
    const [ymin, ymax] = current.axes.ylim;
    const sx = (x) => box.left + (x - xmin) / (xmax - xmin) * (box.right - box.left);
    const sy = (y) => box.bottom - (y - ymin) / (ymax - ymin) * (box.bottom - box.top);
    svg.append(svgElement("rect", { x: box.left, y: box.top, width: box.right - box.left, height: box.bottom - box.top, fill: "#fbfcfb", stroke: "#dfe5e1", rx: 3 }));
    [-3, -2, -1, 0, 1, 2, 3].forEach((tick) => {
      svg.append(svgElement("line", { x1: sx(tick), y1: box.top, x2: sx(tick), y2: box.bottom, stroke: tick === 0 ? "#c3cdc6" : "#e8ece9", "stroke-dasharray": tick === 0 ? "4 4" : "none", class: "chart-grid" }));
      svgText(svg, sx(tick), box.bottom + 23, tick, { "text-anchor": "middle", class: "chart-tick" });
    });
    [-3, -2, -1, 0, 1, 2, 3, 4, 5].forEach((tick) => {
      svg.append(svgElement("line", { x1: box.left, y1: sy(tick), x2: box.right, y2: sy(tick), stroke: tick === 0 ? "#c3cdc6" : "#e8ece9", "stroke-dasharray": tick === 0 ? "4 4" : "none", class: "chart-grid" }));
      svgText(svg, box.left - 14, sy(tick) + 4, tick, { "text-anchor": "end", class: "chart-tick" });
    });
    svgText(svg, (box.left + box.right) / 2, compact ? 435 : 412, `${scoreLabel(state.method)} (z-score)`, { "text-anchor": "middle", fill: "#283d31", "font-size": 15, class: "chart-axis-label" });
    const ylabelX = compact ? 16 : 21;
    svgText(svg, ylabelX, (box.top + box.bottom) / 2, "Success rate (z-score)", { transform: `rotate(-90 ${ylabelX} ${(box.top + box.bottom) / 2})`, "text-anchor": "middle", fill: "#283d31", "font-size": 15, class: "chart-axis-label" });
    const rawRows = new Map(current.raw.map((row) => [`${row.task}:${row[current.checkpoint]}`, row]));
    current.zscore.filter((row) => state.task === "all" || row.task === state.task).forEach((row) => {
      const task = current.tasks[row.task];
      const raw = rawRows.get(`${row.task}:${row[current.checkpoint]}`);
      const point = mark(task.marker, sx(row[methodKey]), sy(row.success_rate), task.color);
      point.append(svgElement("title", {}, `${task.name} · ${current.checkpoint} ${row[current.checkpoint]}\nMeasured success: ${success(raw.success_rate)}\n${scoreLabel(state.method)}: ${rawNumber(raw[methodKey])}\nScore z: ${fixed(row[methodKey])}; success z: ${fixed(row.success_rate)}`));
      svg.append(point);
    });
    visibleTasks().forEach((task, index) => {
      const item = current.tasks[task];
      const x = compact ? 60 : 88 + index * 198;
      const y = compact ? 17 + index * 23 : 25;
      svg.append(mark(item.marker, x, y, item.color, 5));
      svgText(svg, x + 13, y + 4, item.name, { fill: "#38443d", "font-size": compact ? 15 : 14, class: "chart-legend" });
    });
    const count = current.raw.filter((row) => state.task === "all" || row.task === state.task).length;
    $("chart-caption").textContent = `${count} checkpoints · ${taskNames}. Within-task z-scores; higher criterion scores are better.`;
  }

  function renderRealTables() {
    const current = profile();
    const methodKey = current.method_keys[state.method];
    const selectedMetrics = state.task === "all" ? current.metrics : current.task_metrics[state.task];
    const scope = state.task === "all" ? "Mean across all 3 tasks" : current.tasks[state.task].name;
    const metrics = selectedMetrics[methodKey];
    $("metrics-scope").textContent = scope;
    $("real-metrics").replaceChildren(...Object.entries(metricLabels).map(([key, label]) => {
      const card = element("div", undefined, "metric-card");
      card.append(element("span", label, "metric-label"), element("strong", fixed(metrics[key]), "metric-value"));
      return card;
    }));
    table($("real-comparison"), `${families[state.family]} · ${scope} (point estimates; no confidence intervals).`,
      ["Criterion", ...Object.values(metricLabels)],
      Object.entries(methods).map(([key, label]) => ({
        values: [label, ...Object.keys(metricLabels).map((metric) => fixed(selectedMetrics[current.method_keys[key]][metric]))],
        className: [key === "race" ? "is-race" : "", key === state.method ? "is-selected" : ""].join(" "),
      })));
    const normalized = new Map(current.zscore.map((row) => [`${row.task}:${row[current.checkpoint]}`, row]));
    table($("checkpoint-table"), `${families[state.family]} checkpoint measurements · ${scoreLabel(state.method)} (raw baseline scores are already negated).`,
      ["Task", current.checkpoint === "step" ? "Training step" : "Epoch", "Measured success", "Raw criterion score", "Score z-score", "Success z-score"],
      current.raw.filter((row) => state.task === "all" || row.task === state.task).map((row) => {
        const z = normalized.get(`${row.task}:${row[current.checkpoint]}`);
        const measured = success(row.success_rate) + (row.trials ? ` (${row.successes}/${row.trials})` : "");
        return { values: [current.tasks[row.task].name, row[current.checkpoint], measured, rawNumber(row[methodKey]), fixed(z[methodKey]), fixed(z.success_rate)] };
      }));
  }

  function renderTaskMedia() {
    const container = $("task-media");
    container.querySelectorAll("video").forEach((video) => video.pause());
    container.replaceChildren(...visibleTasks().map((task) => {
      const name = profile().tasks[task].name;
      const figure = element("figure", undefined, "task-media-card");
      let visual;
      if (state.family === "vla") {
        visual = element("video");
        visual.src = `assets/${media[task]}.mp4`;
        visual.poster = `assets/${media[task]}.webp`;
        visual.controls = true;
        visual.muted = true;
        visual.loop = true;
        visual.playsInline = true;
        visual.preload = "none";
        visual.setAttribute("aria-label", `${name}: representative successful rollout`);
        visual.append(element("p", "Your browser does not support embedded video."));
      } else {
        visual = element("img");
        visual.src = `assets/tasks/${media[task]}.jpg`;
        visual.alt = `${name}: real-robot task setup`;
        visual.loading = "lazy";
        visual.width = 640;
        visual.height = 480;
      }
      const caption = element("figcaption", undefined, "task-media-caption");
      caption.append(element("strong", name), element("span", state.family === "vla" ? "Representative successful rollout" : "Real-robot task setup"));
      figure.append(visual, caption);
      return figure;
    }));
  }

  function renderReal() {
    document.querySelectorAll("#real-family [data-family]").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.family === state.family)));
    const checkpoints = state.family === "vla"
      ? "9 plotted checkpoints per task; paper protocol: 10 candidates"
      : "10 checkpoints per task";
    $("real-family-note").textContent = `${families[state.family]} · 3 tasks · ${checkpoints}.`;
    $("real-task-picker").replaceChildren(...["all", ...Object.keys(profile().tasks)].map((task) => {
      const button = element("button", task === "all" ? "All tasks" : profile().tasks[task].name, "task-chip");
      button.type = "button";
      button.dataset.task = task;
      button.setAttribute("aria-pressed", String(task === state.task));
      return button;
    }));
    renderScatter();
    renderRealTables();
    renderTaskMedia();
  }

  function renderSimulationChart() {
    const source = data.simulation[state.source];
    const svg = $("simulation-chart");
    const compact = svg.clientWidth < 560;
    const width = compact ? Math.max(320, Math.round(svg.clientWidth)) : 720;
    svg.replaceChildren();
    svg.setAttribute("viewBox", `0 0 ${width} ${compact ? 320 : 280}`);
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-labelledby", "simulation-chart-title simulation-chart-description");
    svg.append(svgElement("title", { id: "simulation-chart-title" }, `${source.name}: mean maximum rank violation`));
    svg.append(svgElement("desc", { id: "simulation-chart-description" }, "Lower MMRV is better. Bars show task-averaged means; whiskers show 95% hierarchical bootstrap intervals over tasks and training seeds. All six metrics are provided in the table below."));
    const left = compact ? 16 : 157, right = compact ? width - 56 : 655;
    const top = compact ? 36 : 26, bottom = compact ? 252 : 215;
    const sx = (value) => left + value / 0.22 * (right - left);
    [0, .05, .10, .15, .20].forEach((tick) => {
      svg.append(svgElement("line", { x1: sx(tick), y1: top, x2: sx(tick), y2: bottom, stroke: "#e1e7e3", class: "chart-grid" }));
      svgText(svg, sx(tick), bottom + 22, tick.toFixed(2), { "text-anchor": "middle", class: "chart-tick" });
    });
    Object.entries(methods).forEach(([method, name], index) => {
      const value = source.methods[method].mmrv;
      const y = 43 + index * (compact ? 62 : 48);
      const color = method === "race" ? "#267b4c" : "#99aca1";
      svgText(svg, compact ? left : left - 14, compact ? y - 21 : y + 5, name, { "text-anchor": compact ? "start" : "end", fill: method === "race" ? "#267b4c" : "#48574e", "font-size": compact ? 15 : 14, "font-weight": method === "race" ? 700 : 400 });
      const bar = svgElement("rect", { x: left, y: y - (compact ? 10 : 13), width: sx(value.mean) - left, height: compact ? 20 : 26, fill: color, rx: 3 });
      bar.append(svgElement("title", {}, `${name}: ${fixed(value.mean)} [${fixed(value.lower)}, ${fixed(value.upper)}] (95% CI)`));
      svg.append(bar);
      svg.append(svgElement("line", { x1: sx(value.lower), y1: y, x2: sx(value.upper), y2: y, stroke: "#223d2d", "stroke-width": 2 }));
      [value.lower, value.upper].forEach((end) => svg.append(svgElement("line", { x1: sx(end), y1: y - 6, x2: sx(end), y2: y + 6, stroke: "#223d2d", "stroke-width": 2 })));
      svgText(svg, sx(value.upper) + 10, y + 5, fixed(value.mean), { fill: "#283d31", "font-weight": method === "race" ? 700 : 400 });
    });
    svgText(svg, compact ? width / 2 : (left + right) / 2, compact ? 304 : 269,
      compact ? "MMRV ↓ · mean and 95% interval" : "MMRV ↓ · mean and 95% bootstrap interval",
      { "text-anchor": "middle", fill: "#283d31", "font-size": 14, class: "chart-axis-label" });
  }

  function renderSimulation() {
    const source = data.simulation[state.source];
    document.querySelectorAll("#sim-source [data-source]").forEach((button) => button.setAttribute("aria-pressed", String(Number(button.dataset.source) === state.source)));
    renderSimulationChart();
    const metricKeys = ["hit1", "hit3", "hit5", "spearman", "mmrv", "nregret"];
    table($("simulation-table"), `${source.name} · means [95% hierarchical bootstrap intervals]. Eight tasks × ten seeds × twelve checkpoints; task-specific RACE settings.`,
      ["Criterion", "Hit@1 ↑", "Hit@3 ↑", "Hit@5 ↑", "Spearman ρ ↑", "MMRV ↓", "nRegret ↓"],
      Object.entries(methods).map(([key, label]) => ({
        values: [label, ...metricKeys.map((metric) => {
          const value = source.methods[key][metric];
          const digits = metric === "mmrv" || metric === "nregret" ? 3 : 2;
          return `${value.mean.toFixed(digits)} [${value.lower.toFixed(digits)}, ${value.upper.toFixed(digits)}]`;
        })],
        className: key === "race" ? "is-race" : "",
      })));
  }

  async function start() {
    try {
      const response = await fetch("data.json");
      if (!response.ok) throw new Error(`Results request returned HTTP ${response.status}`);
      data = await response.json();
      renderReal();
      renderSimulation();
      $("real-family").addEventListener("click", (event) => {
        const button = event.target.closest("[data-family]");
        if (!button || !families[button.dataset.family] || button.dataset.family === state.family) return;
        state.family = button.dataset.family;
        state.task = "all";
        renderReal();
      });
      $("real-task-picker").addEventListener("click", (event) => {
        const button = event.target.closest("[data-task]");
        if (!button || button.dataset.task === state.task) return;
        state.task = button.dataset.task;
        // Keep the focused task button in place for keyboard users.
        $("real-task-picker").querySelectorAll("button").forEach((item) => item.setAttribute("aria-pressed", String(item.dataset.task === state.task)));
        renderScatter();
        renderRealTables();
        renderTaskMedia();
      });
      $("real-method").addEventListener("change", (event) => {
        if (!methods[event.target.value]) return;
        state.method = event.target.value;
        renderScatter();
        renderRealTables();
      });
      $("sim-source").addEventListener("click", (event) => {
        const button = event.target.closest("[data-source]");
        if (!button || !data.simulation[Number(button.dataset.source)]) return;
        state.source = Number(button.dataset.source);
        renderSimulation();
      });
      let resizeFrame;
      window.addEventListener("resize", () => {
        cancelAnimationFrame(resizeFrame);
        resizeFrame = requestAnimationFrame(() => {
          renderScatter();
          renderSimulationChart();
        });
      });
      $("results-status").textContent = "";
      window.resultsReady = true;
    } catch (error) {
      window.resultsError = error.message;
      const link = element("a", "Download the result data");
      link.href = "data.json";
      link.download = "race-results.json";
      $("results-status").replaceChildren(document.createTextNode("Interactive results could not load. "), link, document.createTextNode(" or reload this page."));
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();
