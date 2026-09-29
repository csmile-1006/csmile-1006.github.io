'use strict';

// Native media controls work independently of the interactive results bundle.
document.addEventListener('play', event => {
  if (event.target.tagName !== 'VIDEO') return;
  document.querySelectorAll('video').forEach(video => {
    if (video !== event.target) video.pause();
  });
}, true);

function showComparison(task) {
  document.querySelectorAll('[data-comparison]').forEach(button => {
    button.setAttribute('aria-pressed', String(button.dataset.comparison === task));
  });
  document.querySelectorAll('[data-comparison-panel]').forEach(panel => {
    panel.hidden = panel.dataset.comparisonPanel !== task;
    if (panel.hidden) panel.querySelector('video').pause();
  });
}
document.querySelectorAll('[data-comparison]').forEach(button => {
  button.addEventListener('click', () => showComparison(button.dataset.comparison));
});
showComparison('two-cubes');

const overview = document.querySelector('#overview-video');
const chapters = [...document.querySelectorAll('[data-seek]')];
chapters.forEach(button => button.addEventListener('click', () => {
  const seek = () => {
    overview.currentTime = Number(button.dataset.seek);
    overview.play().catch(() => { overview.focus(); });
  };
  if (overview.readyState >= 1) seek();
  else {
    overview.addEventListener('loadedmetadata', seek, { once: true });
    overview.load();
  }
  overview.scrollIntoView({ block: 'center' });
}));
overview.addEventListener('timeupdate', () => {
  const current = chapters.findLast(button => Number(button.dataset.seek) <= overview.currentTime);
  chapters.forEach(button => {
    button.classList.toggle('active', button === current);
    if (button === current) button.setAttribute('aria-current', 'true');
    else button.removeAttribute('aria-current');
  });
});

const dialog = document.querySelector('#diagram-dialog');
document.querySelectorAll('[data-expand]').forEach(button => button.addEventListener('click', () => {
  const img = document.querySelector('#expanded-image');
  img.src = button.dataset.expand;
  img.alt = button.dataset.alt;
  dialog.showModal();
}));
document.querySelector('#close-diagram').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', event => {
  if (event.target !== dialog) return;
  const box = dialog.getBoundingClientRect();
  if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close();
});

document.querySelector('#copy-bibtex').addEventListener('click', async () => {
  const source = document.querySelector('#bibtex-code');
  const status = document.querySelector('#copy-status');
  try {
    await navigator.clipboard.writeText(source.value);
    status.textContent = 'BibTeX copied.';
  } catch {
    source.focus();
    source.select();
    status.textContent = 'Citation selected. Press Ctrl+C or ⌘C to copy.';
  }
});

const contents = [...document.querySelectorAll('.contents a')];
const navigationObserver = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if (!entry.isIntersecting) return;
    contents.forEach(link => {
      const active = link.hash === `#${entry.target.id}`;
      link.classList.toggle('active', active);
      if (active) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    });
  });
}, { rootMargin: '-18% 0px -65% 0px' });
contents.forEach(link => navigationObserver.observe(document.querySelector(link.hash)));
