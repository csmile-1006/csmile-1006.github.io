'use strict';

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
let motionPaused = reducedMotion.matches;

function loadVideo(video) {
  if (video.dataset.src && video.getAttribute('src') !== video.dataset.src) {
    video.src = video.dataset.src;
    video.load();
  }
}

const mediaObserver = new IntersectionObserver((entries) => {
  for (const entry of entries) {
    const video = entry.target;
    if (!video.isConnected) continue;
    video.dataset.visible = String(entry.isIntersecting);
    if (entry.isIntersecting) {
      loadVideo(video);
      if (video.classList.contains('ambient') && !motionPaused && !document.hidden) video.play().catch(() => {});
    } else if (video.classList.contains('ambient')) {
      video.pause();
    }
  }
}, { threshold: 0.1 });
function observeVideo(video) {
  mediaObserver.observe(video);
  video.addEventListener('error', () => {
    if (!video.isConnected) return;
    $('#page-status').textContent = 'A video could not load. The poster and paper remain available; please reload to retry.';
  });
  if (video.controls) video.addEventListener('play', () => {
    $$('video[controls]').forEach((other) => { if (other !== video) other.pause(); });
  });
}
$$('video').forEach(observeVideo);

function updateMotion() {
  const button = $('#motion-toggle');
  button.setAttribute('aria-pressed', String(motionPaused));
  button.setAttribute('aria-label', motionPaused ? 'Play background videos' : 'Pause background videos');
  button.textContent = motionPaused ? 'Play motion ▶' : 'Pause motion Ⅱ';
  $$('.ambient').forEach((video) => {
    if (motionPaused || document.hidden || video.dataset.visible !== 'true') video.pause();
    else { loadVideo(video); video.play().catch(() => {}); }
  });
}
$('#motion-toggle').addEventListener('click', () => { motionPaused = !motionPaused; updateMotion(); });
reducedMotion.addEventListener('change', (event) => { motionPaused = event.matches; updateMotion(); });
document.addEventListener('visibilitychange', updateMotion);
updateMotion();

$('#copy-bibtex').addEventListener('click', async () => {
  const citation = $('#bibtex-code');
  const button = $('#copy-bibtex');
  try {
    await navigator.clipboard.writeText(citation.value);
    button.textContent = 'Copied';
    $('#copy-status').textContent = 'Copied to clipboard.';
  } catch {
    // Plain HTTP previews may not expose the Clipboard API; keep manual copy usable.
    citation.focus();
    citation.select();
    button.textContent = 'Copy BibTeX';
    $('#copy-status').textContent = 'Text selected. Press Ctrl+C or ⌘C to copy.';
  }
});

const overview = $('#overview-video');
$$('[data-seek]').forEach((button) => button.addEventListener('click', async () => {
  const seek = () => { overview.currentTime = Number(button.dataset.seek); overview.play().catch(() => {}); };
  if (overview.readyState >= 1) seek();
  else { overview.addEventListener('loadedmetadata', seek, { once: true }); overview.load(); }
  overview.scrollIntoView({ behavior: reducedMotion.matches ? 'instant' : 'smooth', block: 'center' });
}));
overview.addEventListener('timeupdate', () => {
  const buttons = $$('[data-seek]');
  buttons.forEach((button, index) => button.classList.toggle('active', overview.currentTime >= Number(button.dataset.seek) && (index === buttons.length - 1 || overview.currentTime < Number(buttons[index + 1].dataset.seek))));
});

const methodSteps = [
  { kicker: 'Actor–critic inheritance', image: 'method-inheritance.svg', alt: 'Accumulated demonstrations update the foundation model. The actor and critic remain faintly visible at their previous positions, with arrows indicating parameter inheritance by the next task.', text: 'Update the RFM with accumulated demonstrations and inherit the actor–critic.' },
  { kicker: 'Current-task RL', image: 'method-architecture.svg', alt: 'The left architecture panel from the original paper: foundation-model reference actions, observations, actor, critic, and their connections.', text: 'Use frozen RFM reference actions; update the actor–critic on current-task interactions.' },
  { kicker: 'Prior-task distillation', image: 'distillation.png', alt: 'Prior-task actor targets are cached before online RL; during training, the current actor distills them while the critic guides only current-task actor updates.', text: 'Distill cached prior-actor targets from retained replay, alongside current-task RL.' },
];
function selectMethod(index, focus = false) {
  const step = methodSteps[index];
  $$('[data-method]').forEach((button, i) => {
    button.classList.toggle('active', i === index);
    button.setAttribute('aria-selected', String(i === index));
    button.tabIndex = i === index ? 0 : -1;
    if (i === index && focus) button.focus();
  });
  $('#method-panel').setAttribute('aria-labelledby', `method-tab-${index}`);
  $('#method-kicker').dataset.editKey = `method.${index}.kicker`;
  $('#method-detail').dataset.editKey = `method.${index}.detail`;
  $('#method-kicker').textContent = step.kicker;
  $('#method-image').src = `assets/${step.image}`;
  $('#method-image').alt = step.alt;
  $('#method-detail').textContent = step.text;
  document.dispatchEvent(new Event('accrue:content-updated'));
}
$$('[data-method]').forEach((button) => {
  button.addEventListener('click', () => selectMethod(Number(button.dataset.method)));
  button.addEventListener('keydown', (event) => {
    if (event.target.closest('[contenteditable]')) return;
    const current = Number(button.dataset.method);
    const next = { ArrowDown: (current + 1) % 3, ArrowUp: (current + 2) % 3, Home: 0, End: 2 }[event.key];
    if (next !== undefined) { event.preventDefault(); selectMethod(next, true); }
  });
});
$('#expand-diagram').addEventListener('click', () => {
  $('#expanded-image').src = $('#method-image').src;
  $('#expanded-image').alt = $('#method-image').alt;
  $('#diagram-dialog').showModal();
});
$('#close-diagram').addEventListener('click', () => $('#diagram-dialog').close());
$('#diagram-dialog').addEventListener('click', (event) => { if (event.target === $('#diagram-dialog')) $('#diagram-dialog').close(); });

const sectionObserver = new IntersectionObserver((entries) => {
  for (const entry of entries) if (entry.isIntersecting) {
    $$('#contents a').forEach((link) => {
      const active = link.hash === `#${entry.target.id}`;
      link.classList.toggle('active', active);
      if (active) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    });
  }
}, { rootMargin: '-15% 0px -55% 0px' });
$$('main section[id]').forEach((section) => sectionObserver.observe(section));

let data;
let group = 'AutoMate';
let selectedTask = 2;
let progress = 1;
let animationFrame = 0;
let retentionGroup = 'AutoMate';
let retentionStage = 5;
const colors = { single: '#0075c9', ours: '#76b900' };
const taskName = (task) => ({ Rectangle: 'Rectangle', Cylinder: 'Cylinder', Gear: 'Gear' }[task] || task);
const imageFor = (task) => `assets/tasks/${task.toLowerCase()}.webp`;
const minutes = (value) => `${value.toFixed(1)} min`;
const stage = () => data.groups[group].stages[selectedTask];

function stopReplay() {
  cancelAnimationFrame(animationFrame);
  animationFrame = 0;
  $('#replay-curve').textContent = progress >= 1 ? '▶ Replay learning' : '▶ Play learning';
}

function selectGroup(next) {
  group = next;
  selectedTask = group === 'AutoMate' ? 2 : 1;
  $$('[data-group]').forEach((button) => {
    button.classList.toggle('active', button.dataset.group === group);
    button.setAttribute('aria-pressed', String(button.dataset.group === group));
  });
  renderTaskPicker();
  selectTask(selectedTask);
  const video = $('#benchmark-video');
  video.pause();
  video.dataset.src = `assets/results-${group.toLowerCase()}.mp4`;
  video.poster = `assets/results-${group.toLowerCase()}.webp`;
  video.setAttribute('aria-label', `${group} learning and retention experiments`);
  if (video.hasAttribute('src')) loadVideo(video);
  $('#watch-benchmark').textContent = `Watch ${group} experiments`;
  document.dispatchEvent(new Event('accrue:content-updated'));
}

function renderTaskPicker() {
  const tasks = data.groups[group].stages;
  $('#task-picker').style.setProperty('--tasks', tasks.length);
  $('#task-picker').innerHTML = tasks.map((row, index) => `<button type="button" class="task-button" data-task="${index}" aria-pressed="false"><img src="${imageFor(row.task)}" alt="" width="44" height="52"><span><small>Stage ${row.stage}</small>${taskName(row.task)}</span></button>`).join('');
  $$('[data-task]').forEach((button) => button.addEventListener('click', () => selectTask(Number(button.dataset.task))));
}

function selectTask(index) {
  selectedTask = index;
  stopReplay();
  progress = 1;
  $('#learning-progress').value = 1000;
  $('#replay-curve').textContent = '▶ Replay learning';
  const current = stage();
  $$('[data-task]').forEach((button) => {
    const selected = Number(button.dataset.task) === selectedTask;
    button.classList.toggle('active', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
  $('#chart-title').textContent = `${group} · ${taskName(current.task)}`;
  $('#single-time').textContent = minutes(current.single.total);
  $('#ours-time').textContent = current.ours ? minutes(current.ours.total) : 'Shared start';
  $('#saved-value').innerHTML = current.ours ? `${current.saved_pct.toFixed(1)}<span>%</span>` : 'Shared';
  $('#savings-description').textContent = current.ours ? 'less robot interaction' : 'first-task learning';
  $('#summary-note').textContent = current.ours ? `${minutes(current.single.total - current.ours.total)} saved · same 95% stopping rule.` : 'Shared first task; transfer starts at stage 2.';
  $('.chart-legend .ours').parentElement.hidden = !current.ours;
  $('#chart-tooltip').hidden = true;
  drawChart();
}

function chartGeometry() {
  const compact = window.innerWidth <= 640;
  const width = compact ? 500 : 750;
  const height = compact ? 390 : 420;
  const left = compact ? 62 : 65;
  const right = compact ? 35 : 45;
  const top = 34;
  const bottom = height - 66;
  const duration = Math.max(stage().single.total, stage().ours?.total || 0);
  const max = Math.ceil(duration / 5) * 5;
  return { width, height, left, right, top, bottom, max, duration, x: (minute) => left + minute / max * (width - left - right), y: (rate) => bottom - rate / 100 * (bottom - top) };
}

function drawChart() {
  const row = stage();
  const g = chartGeometry();
  const time = g.duration * progress;
  const plotWidth = g.width - g.left - g.right;
  const svg = $('#learning-chart');
  svg.setAttribute('viewBox', `0 0 ${g.width} ${g.height}`);
  const path = (times, rates) => times.map((t, i) => `${i ? 'L' : 'M'}${g.x(t).toFixed(3)} ${g.y(rates[i]).toFixed(3)}`).join(' ');
  let content = `<title id="curve-title">${group} ${row.task}: success versus recorded robot time</title><desc id="curve-desc">Single-task RL ${minutes(row.single.total)}.${row.ours ? ` ACCRUE ${minutes(row.ours.total)}, ${row.saved_pct}% less robot interaction.` : ' Shared first-task run.'} Dashed segments precede the complete 20-episode window.</desc><defs><clipPath id="time-clip"><rect x="${g.left - 2}" y="${g.top - 5}" width="${g.x(time) - g.left + 4}" height="${g.bottom - g.top + 10}"/></clipPath></defs>`;
  for (const value of [0, 25, 50, 75, 100]) {
    content += `<line x1="${g.left}" y1="${g.y(value)}" x2="${g.width - g.right}" y2="${g.y(value)}" stroke="#e4e9df"/><text x="${g.left - 12}" y="${g.y(value) + 5}" text-anchor="end">${value}</text>`;
  }
  for (let tick = 0; tick <= 4; tick++) {
    const value = g.max * tick / 4;
    content += `<text x="${g.x(value)}" y="${g.bottom + 25}" text-anchor="middle">${Number(value.toFixed(1))}</text>`;
  }
  content += `<text class="axis-title" x="${g.left + plotWidth / 2}" y="${g.height - 6}" text-anchor="middle">Minutes of Data</text><text class="axis-title" transform="translate(17 ${g.top + (g.bottom - g.top) / 2}) rotate(-90)" text-anchor="middle">Success Rate (%)</text>`;
  content += `<g clip-path="url(#time-clip)">`;
  if (row.ours) content += `<rect x="${g.x(row.ours.total)}" y="${g.top}" width="${g.x(row.single.total) - g.x(row.ours.total)}" height="${g.bottom - g.top}" fill="#76b900" opacity="0.09"/>`;
  for (const key of ['single', 'ours']) {
    const curve = row[key];
    if (!curve) continue;
    content += `<path data-curve="${key}-early" d="${path(curve.early_times, curve.early_rates)}" fill="none" stroke="${colors[key]}" stroke-width="2" stroke-dasharray="5 5" vector-effect="non-scaling-stroke"/><path data-curve="${key}" d="${path(curve.times, curve.rates)}" fill="none" stroke="${colors[key]}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>`;
  }
  content += '</g>';
  for (const key of ['single', 'ours']) {
    const curve = row[key];
    if (!curve || time + 1e-9 < curve.total) continue;
    const endY = g.y(curve.rates.at(-1));
    content += `<circle cx="${g.x(curve.total)}" cy="${endY}" r="4" fill="${colors[key]}"/><text class="endpoint" style="fill:${key === 'ours' ? '#436d00' : colors[key]}" x="${g.x(curve.total) - (key === 'single' ? 7 : 0)}" y="${endY + (key === 'single' ? -13 : 28)}" text-anchor="${key === 'single' ? 'end' : 'middle'}">${minutes(curve.total)}</text>`;
  }
  if (progress < 1) content += `<line x1="${g.x(time)}" x2="${g.x(time)}" y1="${g.top}" y2="${g.bottom}" stroke="#7d8a72" stroke-dasharray="3 5"/>`;
  svg.innerHTML = content;
  $('#learning-clock').textContent = minutes(time);
  $('#learning-progress').setAttribute('aria-valuetext', `${time.toFixed(1)} minutes of recorded robot interaction`);
}

$('#replay-curve').addEventListener('click', () => {
  if (!data) return;
  if (animationFrame) { stopReplay(); return; }
  if (progress >= 1) progress = 0;
  const start = performance.now() - progress * 9000;
  $('#replay-curve').textContent = 'Ⅱ Pause';
  const frame = (now) => {
    progress = Math.min(1, (now - start) / 9000);
    $('#learning-progress').value = Math.round(progress * 1000);
    drawChart();
    if (progress < 1) animationFrame = requestAnimationFrame(frame);
    else stopReplay();
  };
  animationFrame = requestAnimationFrame(frame);
});
$('#learning-progress').addEventListener('input', (event) => {
  if (!data) return;
  progress = Number(event.target.value) / 1000;
  stopReplay();
  drawChart();
});
window.addEventListener('resize', () => { if (data) drawChart(); });
$('#learning-chart').addEventListener('pointermove', (event) => {
  if (!data) return;
  const svg = event.currentTarget;
  const rect = svg.getBoundingClientRect();
  const g = chartGeometry();
  const x = (event.clientX - rect.left) / rect.width * g.width;
  const at = (x - g.left) / (g.width - g.left - g.right) * g.max;
  const tooltip = $('#chart-tooltip');
  if (at < 0 || at > g.duration * progress || x > g.width - g.right) { tooltip.hidden = true; return; }
  const row = stage();
  let text = '';
  for (const key of ['single', 'ours']) {
    const curve = row[key];
    if (!curve || at < curve.early_times[0] || at > curve.total + g.max * .02) continue;
    const times = curve.early_times.slice(0, -1).concat(curve.times);
    const rates = curve.early_rates.slice(0, -1).concat(curve.rates);
    let index = times.findIndex((time) => time > at);
    index = index === -1 ? times.length - 1 : Math.max(0, index - 1);
    text += `<div>${key === 'single' ? 'Single-task' : 'ACCRUE'}: ${rates[index].toFixed(1)}%<br><small>at ${times[index].toFixed(2)} min</small></div>`;
  }
  tooltip.hidden = !text;
  tooltip.innerHTML = text;
  tooltip.style.left = `${Math.max(0, Math.min(rect.width - 170, event.clientX - rect.left + 12))}px`;
  tooltip.style.top = `${Math.max(0, event.clientY - rect.top - 95)}px`;
});
$('#learning-chart').addEventListener('pointerleave', () => { $('#chart-tooltip').hidden = true; });
$$('[data-group]').forEach((button) => button.addEventListener('click', () => { if (data) selectGroup(button.dataset.group); }));
$('#watch-benchmark').addEventListener('click', () => {
  const video = $('#benchmark-video');
  loadVideo(video);
  video.scrollIntoView({ behavior: reducedMotion.matches ? 'instant' : 'smooth', block: 'center' });
  video.play().catch(() => {});
});

function selectRetentionGroup(next) {
  retentionGroup = next;
  const table = data.groups[next].retention;
  retentionStage = table.after_stages.at(-1);
  $$('[data-retention-group]').forEach((button) => {
    button.classList.toggle('active', button.dataset.retentionGroup === next);
    button.setAttribute('aria-pressed', String(button.dataset.retentionGroup === next));
  });
  $('#retention-stage').innerHTML = table.after_stages.map((value) => `<option value="${value}">Stage ${value}</option>`).join('');
  $('#retention-stage').value = retentionStage;
  renderRetention();
}

function renderRetentionVideos(rows) {
  const gallery = $('#retention-videos');
  const previous = [...gallery.querySelectorAll('video')];
  previous.forEach((video) => { mediaObserver.unobserve(video); video.pause(); });
  gallery.replaceChildren();
  previous.forEach((video) => {
    delete video.dataset.src;
    video.removeAttribute('src');
    video.load();
  });
  gallery.dataset.group = retentionGroup;
  gallery.dataset.checkpoint = retentionStage;
  gallery.dataset.count = rows.length;
  gallery.innerHTML = rows.map((row, index) => {
    const clip = `hero-${retentionGroup.toLowerCase()}-${row.task.toLowerCase()}`;
    const camera = row.stage % 2 ? 'wrist view' : 'exterior view';
    const label = `${retentionGroup} ${taskName(row.task)} · ${camera}`;
    return `<figure data-retention-task="${row.task}"><video id="retention-video-${index + 1}" class="ambient" muted playsinline loop preload="none" poster="assets/${clip}.webp" data-src="assets/${clip}.mp4" aria-label="Final-policy example: ${label}" aria-describedby="retention-source-note"></video><figcaption><span id="retention-video-label-${index + 1}">${label}</span><span>2×</span></figcaption></figure>`;
  }).join('');
  gallery.querySelectorAll('video').forEach(observeVideo);
}

function renderRetention() {
  const current = data.groups[retentionGroup];
  const table = current.retention;
  const column = table.after_stages.indexOf(retentionStage);
  const target = current.stages[retentionStage - 1];
  renderRetentionVideos(table.rows.filter((row) => row.stage < retentionStage && row.successes[column] !== null));
  $('#retention-context-text').textContent = `After stage ${retentionStage} (${taskName(target.task)}): earlier-task evaluation.`;
  $('#retention-cards').innerHTML = table.rows.map((row) => {
    const count = row.successes[column];
    const evaluated = count !== null;
    return `<article class="retention-card${evaluated ? '' : ' pending'}"><img src="${imageFor(row.task)}" alt="" loading="lazy" width="66" height="64"><div class="micro">Stage ${row.stage}</div><h3>${taskName(row.task)}</h3><div class="retention-value">${evaluated ? `${count / table.trials * 100}<span>%</span>` : '—'}</div><p>${evaluated ? `${count} / ${table.trials} successful trials` : row.stage === retentionStage ? 'Current task, not a prior task' : 'Not yet learned'}</p></article>`;
  }).join('');
  $('#retention-cards').style.gridTemplateColumns = table.rows.length <= 2 ? 'repeat(2,minmax(0,1fr))' : '';
  $('#retention-table').innerHTML = `<table><caption class="sr-only">${retentionGroup} separate 20-trial retention evaluations</caption><thead><tr><th scope="col">Earlier task</th>${table.after_stages.map((value) => `<th scope="col"${value === retentionStage ? ' class="selected-column"' : ''}>After stage ${value}</th>`).join('')}</tr></thead><tbody>${table.rows.map((row) => `<tr><th scope="row">${row.stage} · ${taskName(row.task)}</th>${row.successes.map((count, index) => `<td${index === column ? ' class="selected-column"' : ''}>${count === null ? '—' : `${count} / ${table.trials}`}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}
$$('[data-retention-group]').forEach((button) => button.addEventListener('click', () => { if (data) selectRetentionGroup(button.dataset.retentionGroup); }));
$('#retention-stage').addEventListener('change', (event) => { retentionStage = Number(event.target.value); renderRetention(); });

async function initializeResults() {
  try {
    const response = await fetch('data.json');
    if (!response.ok) throw new Error(`Data request failed: ${response.status}`);
    data = await response.json();
    selectGroup('AutoMate');
    selectRetentionGroup('AutoMate');
    const values = data.forge.values;
    const labels = { 'RFM base': 'Demonstration-only RFM', 'Single-task RL': 'Single-task RL', ACCRUE: 'ACCRUE' };
    $('#fwt-bars').innerHTML = Object.entries(values).map(([name, value]) => `<div class="fwt-row"><div class="fwt-label">${labels[name]}<span>${value.toFixed(3)}</span></div><div class="fwt-track" aria-hidden="true"><div class="fwt-fill" style="width:${value * 100}%"></div></div></div>`).join('');
    window.websiteReady = true;
  } catch (error) {
    $('#task-picker').innerHTML = '<p>Interactive data could not load. Please open this page through the local web server; the paper and videos remain available.</p>';
    $('#page-status').textContent = 'Interactive results failed to load.';
    console.error(error);
  }
}
initializeResults();
