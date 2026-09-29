#!/usr/bin/env python3
"""Check the static site with Python's standard library: python3 scripts/check_site.py [root]."""

import re
import sys
from html import unescape
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit


ROOT = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else Path(__file__).resolve().parents[1]
PAGES = ("index.html", "publications/index.html", "news/index.html", "background/index.html", "404.html")
PERSONAL_PAGES = {ROOT / name for name in PAGES}


def normalized(text):
    return " ".join(unescape(text).replace("{", "").replace("}", "").split())


def destination(page, value):
    url = urlsplit(value)
    if url.scheme or url.netloc:
        return None
    path = (ROOT / unquote(url.path).lstrip("/") if url.path.startswith("/")
            else page.parent / unquote(url.path)) if url.path else page
    path = path.resolve()
    return (path / "index.html" if path.is_dir() else path), unquote(url.fragment)


def link_key(page, value):
    url = urlsplit(value)
    if url.hostname in {"changyeon.site", "csmile-1006.github.io"}:
        value = url.path or "/"
    local = destination(page, value)
    return str(local[0]) if local else value


class Page(HTMLParser):
    def __init__(self, path, allow_scripts=False):
        super().__init__(convert_charrefs=True)
        self.allow_scripts = allow_scripts
        self.path, self.ids, self.refs, self.problems = path, set(), [], []
        self.lang = self.viewport = self.in_news = self.in_title = False
        self.item = None
        self.publications, self.news = {}, []
        source = path.read_text(encoding="utf-8")
        assert not source.lstrip().startswith("---"), f"{path}: YAML frontmatter remains"
        assert "{{" not in source and "{%" not in source, f"{path}: Liquid remains"
        self.feed(source)

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        classes = attrs.get("class", "").split()
        if "id" in attrs:
            if attrs["id"] in self.ids:
                self.problems.append(f"duplicate id: {attrs['id']}")
            self.ids.add(attrs["id"])
        self.refs.extend(attrs[key] for key in ("href", "src") if key in attrs)
        if tag == "html":
            self.lang = bool(attrs.get("lang"))
        if tag == "meta" and attrs.get("name") == "viewport":
            self.viewport = "width=device-width" in attrs.get("content", "")
        if tag == "img" and "alt" not in attrs:
            self.problems.append("image missing alt")
        if not self.allow_scripts and (tag == "script" or any(key.startswith("on") for key in attrs)):
            self.problems.append("JavaScript remains")
        if tag == "ul" and "news-list" in classes:
            self.in_news = True
        if tag == "li" and (self.in_news or "publication" in classes):
            self.item = {"id": attrs.get("id"), "text": [], "title": [], "links": [], "date": None}
        if self.item is not None:
            if tag in {"br", "p"}:
                self.handle_data(" ")
            if tag == "time":
                self.item["date"] = attrs.get("datetime")
            if tag == "h3" and "publication-title" in classes:
                self.in_title = True
            if tag == "a" and "href" in attrs:
                self.item["links"].append(link_key(self.path, attrs["href"]))

    def handle_data(self, data):
        if self.item is not None:
            self.item["text"].append(data)
            if self.in_title:
                self.item["title"].append(data)

    def handle_endtag(self, tag):
        if tag == "h3":
            self.in_title = False
        if tag == "ul":
            self.in_news = False
        if tag == "li" and self.item is not None:
            item, self.item = self.item, None
            if item["id"]:
                self.publications[item["id"]] = item
            else:
                assert item["date"], f"{self.path}: news item missing datetime"
                self.news.append((item["date"], normalized("".join(item["text"])), item["links"]))


page_paths = PERSONAL_PAGES | {
    path for path in ROOT.glob("*/index.html") if not path.parent.name.startswith((".", "_"))
}
pages = {path: Page(path, allow_scripts=path not in PERSONAL_PAGES) for path in sorted(page_paths)}
for path, page in list(pages.items()):
    assert page.lang and page.viewport, f"{path}: missing lang or viewport"
    assert not page.problems, f"{path}: {', '.join(page.problems)}"
    for value in page.refs:
        if not page.allow_scripts:
            assert not value.lower().startswith("javascript:"), f"{path}: JavaScript link"
        local = destination(path, value)
        if local:
            target, fragment = local
            assert target.is_relative_to(ROOT) and target.is_file(), f"{path}: broken link {value}"
            if fragment and target.suffix == ".html":
                if target not in pages:
                    pages[target] = Page(target, allow_scripts=target not in PERSONAL_PAGES)
                assert fragment in pages[target].ids, f"{path}: missing fragment {value}"

publication_page = pages[ROOT / "publications/index.html"]
keys = set()
selected = set()
for name in ("papers", "others"):
    bib = (ROOT / f"assets/bibliography/{name}.bib").read_text(encoding="utf-8")
    assert not bib.lstrip().startswith("---"), f"{name}.bib: YAML frontmatter remains"
    for key, entry in re.findall(r"^@\w+\{([^,]+),(.*?)(?=^@\w+\{|\Z)", bib, re.M | re.S):
        assert key not in keys, f"duplicate bibliography key: {key}"
        keys.add(key)
        if re.search(r"\bselected\s*=\s*\{true\}", entry):
            selected.add(key)
        item = publication_page.publications.get(key)
        assert item, f"publication missing: {key}"
        title = re.search(r"\btitle\s*=\s*\{((?:[^{}]|\{[^{}]*\})*)\}", entry)
        assert title and normalized(title[1]) == normalized("".join(item["title"])), f"title mismatch: {key}"
        for field, value in re.findall(r"\b(arxiv|pdf|html|code|website|url)\s*=\s*\{([^{}]*)\}", entry):
            value = f"https://arxiv.org/abs/{value}" if field == "arxiv" else value
            assert link_key(publication_page.path, value) in item["links"], f"{key}: missing {field} link"
assert keys and keys == publication_page.publications.keys(), "publication/BibTeX entries differ"

home = pages[ROOT / "index.html"]
home_publications = home.publications
assert selected and selected == home_publications.keys(), "homepage selection differs from BibTeX"
for key, item in home_publications.items():
    full = publication_page.publications[key]
    assert normalized("".join(item["text"])) == normalized("".join(full["text"])), f"selected paper differs: {key}"
    assert item["links"] == full["links"], f"selected paper links differ: {key}"

news = pages[ROOT / "news/index.html"].news
assert news and [row[0] for row in news] == sorted((row[0] for row in news), reverse=True), "news must be newest first"
assert not home.news, "homepage news should be in the news archive"
background_sections = {"education", "experience", "honors", "talks", "service", "mentoring"}
assert not home.ids & (background_sections | {"news"}), "homepage contains archived sections"
assert background_sections <= pages[ROOT / "background/index.html"].ids, "background sections are missing"
for name in ("deas/index.html", "reds/index.html", "assets/pdf/changyeon_cv.pdf"):
    assert (ROOT / name).is_file(), f"missing preserved content: {name}"
print(f"OK: {len(page_paths)} pages, {len(keys)} publications ({len(selected)} selected), {len(news)} news entries; local links and content agree.")
