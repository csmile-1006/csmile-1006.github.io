# Changyeon Kim's homepage

A static academic website inspired by the simple layout of [younggyo.me](https://younggyo.me/) ([source](https://github.com/younggyoseo/younggyoseo.github.io)) and the Selected / All publication navigation on [sihyun.me](https://sihyun.me/). The homepage, publications, and news use only HTML and CSS: no Jekyll, al-folio, JavaScript, package installation, or build step.

## Local preview

```sh
python3 scripts/serve.py
```

Visit <http://localhost:8000>. Stop the server with Ctrl+C. This read-only server uses Python's standard library and supports HTTP byte ranges, so video seeking and ACCRUE's chapter buttons work locally. Python is only used for local preview and checks; it is not required to host the site. Run `python3 scripts/check_preview.py` to check the server.

## Edit

| Content | File |
| --- | --- |
| Introduction and selected papers | `index.html` |
| Education, experience, awards, talks, service, mentoring | `background/index.html` |
| Complete publication list | `publications/index.html` |
| Complete news archive | `news/index.html` |
| Shared layout, spacing, mobile layout | `assets/css/site.css` |
| Site-wide CMU red palette, including project pages | `assets/css/theme.css` |
| Profile photo / CV | `assets/img/changyeon.jpg` / `assets/pdf/changyeon_cv.pdf` |
| Downloadable bibliography | `assets/bibliography/papers.bib`, `assets/bibliography/others.bib` |
| Research project pages | `deas/`, `reds/`, `accrue/`, `race/` |

When replacing `assets/pdf/changyeon_cv.pdf`, also update the `v` query value in the CV links in `index.html` and `background/index.html` to the first 12 characters of the new file's SHA-256 hash. This makes browsers fetch the replacement instead of reusing a cached PDF.

Copy an existing `<li class="publication">` to add a paper. Keep its `id` equal to its BibTeX key, and update the downloadable bibliography as well. These HTML files are the pages themselves; nothing renders them from BibTeX. The homepage shows the seven entries marked `selected={true}` in `papers.bib`. To change the selection, update that flag and the matching publication block in `index.html`; adjust relative resource links when copying between pages. The checker verifies that selected papers match the full list. The Selected / All controls are ordinary page links, so they also work without JavaScript.

Workshop venue formatting intentionally differs: the website uses `<conference acronym> <year> <topic> Workshop` (for example, `NeurIPS 2026 Robot Learning Workshop`), while the CV uses `NeurIPS 2026 Workshop on Robot Learning (NeurIPSW)`. Keep publication notes consistent with the website format; in BibTeX `booktitle`, leave the year in its separate `year` field.

Add news to `news/index.html` in reverse chronological order. News and background details are linked from the homepage footer. Relative links from those pages need `../` (for example, `../deas/` instead of `deas/`).

Run the dependency-free check after editing:

```sh
python3 scripts/check_site.py
```

## Add a project page

ACCRUE is published at <https://changyeon.site/accrue/> and can be previewed at <http://localhost:8000/accrue/>. Its static files were imported from [csmile-1006/accrue_webpage](https://github.com/csmile-1006/accrue_webpage) at `09ce10b929b82e368365c5798c7697a5546589ad`, including the paper, videos, data, and font license. It retains its original project design. Edit its HTML/CSS/JS and `content-overrides.json` directly; the source repository's editing server is not included. The homepage and full publication list link to both the project and its PDF.

Create a folder such as `new-project/` containing `index.html` and its media. It is immediately available at `http://localhost:8000/new-project/`; no router, registration, build, or new dependency is needed. Keep each project's images/videos inside its own folder and use relative URLs.

For the personal site's layout, link `../assets/css/site.css`. For a custom project layout like DEAS/REDS, link `../assets/css/theme.css` after the project's stylesheet to share CMU red (`#C41230`), hover/focus colors, and highlights. Use `var(--accent)` instead of hard-coded theme colors. The existing research plots keep their original scientific color coding.

Add the project's URL to the relevant paper in `publications/index.html`, its bibliography entry, and the homepage if selected. Add its public URL to `sitemap.xml`. Run `python3 scripts/check_site.py`: top-level project folders with `index.html` are discovered automatically and their local resources are checked. Finally, preview the page on desktop and mobile, especially videos.

## Deployment

GitHub Pages serves **https://changyeon.site/**. Pushes to `master` run `.github/workflows/pages.yml`: validate the site, package public files, validate the package, and deploy it. Pull requests run validation without publishing. The workflow can also be run manually from the Actions tab on `master`.

Pages uses **GitHub Actions** as its source, with custom domain `changyeon.site` and HTTPS enabled. `CNAME` preserves the domain and `.nojekyll` bypasses Jekyll. No Ruby, Node, Docker, or site generator is needed.

The artifact contains root HTML, shared assets, domain/SEO files, and every top-level public folder containing `index.html`, including all project PDFs and videos. Git history, scripts, and workflow files are excluded. New project folders are packaged automatically. The previous `gh-pages` branch is retained as a snapshot of the old site.

## Migration notes

All 13 original publications and 10 news items were retained. The September 25, 2026 CV adds ACCRUE, RACE, and Trust Region Q Adjoint Matching, bringing the total to 16. Seven representative papers appear on the homepage; All opens the complete publication page. RACE is accepted to the NeurIPS 2026 Robot Learning Workshop; its ICRA 2027 submission status remains listed as a secondary note. ACCRUE remains under review at ICRA 2027. Both papers link to their project pages, and RACE also links to its PDF.

The homepage contains only the introduction and selected papers. The research introduction is condensed to two sentences. Other profile details live in `background/index.html`; news remains in its own archive. Oral, spotlight, and fellowship distinctions use the shared red `.highlight` style. Education, NVIDIA/UT Austin dates, reviewer years, mentoring, and the downloadable CV are updated from that CV. Older IBS experience, awards, and the invited talk remain even where the new CV omits them. Existing `/publications/`, `/news/`, publication anchors, `/deas/`, and `/reds/` URLs remain available.

The DEAS and REDS microsites retain their scientific content, PDFs, images, and videos. Their links and interface accents share the CMU red theme, with responsive layout and link fixes where needed. They retain their existing project-specific styles; the personal pages do not depend on those styles. Theme demo posts/projects, sample images, al-folio templates, Ruby/Docker setup, and analytics scripts were removed. Original source content remains in Git history.

The Dynamics-Augmented Decision Transformer OpenReview link was corrected using the CV. B-MoCA's “Minyong An” spelling and REDS's author order retain the published arXiv metadata where it differs from the CV.
