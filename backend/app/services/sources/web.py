"""Polite HTTP helpers for public, machine-readable job data.

- A descriptive User-Agent identifies Applier.
- Short timeouts (≤ 8 s) so a slow site never stalls the agent.
- ``robots_allowed`` is checked before fetching any HTML page.
- No retries against rate limits, no CAPTCHA/anti-bot circumvention, no authentication bypass.
"""

from __future__ import annotations

import html
import json
import logging
import re
from functools import lru_cache
from html.parser import HTMLParser
from typing import Any
from urllib.parse import urlparse
from urllib.robotparser import RobotFileParser

import httpx

log = logging.getLogger("applier.sources")

USER_AGENT = "ApplierJobAgent/1.0 (+personal job-search assistant; respects robots.txt)"
TIMEOUT = httpx.Timeout(8.0, connect=5.0)
MAX_BYTES = 3_000_000


class FetchError(Exception):
    """A fetch failed (network error, non-2xx status, disallowed by robots.txt or too large)."""


def http_client() -> httpx.Client:
    return httpx.Client(timeout=TIMEOUT, follow_redirects=True, headers={"User-Agent": USER_AGENT})


@lru_cache(maxsize=256)
def _robots_for(origin: str) -> RobotFileParser | None:
    parser = RobotFileParser()
    try:
        with http_client() as client:
            resp = client.get(f"{origin}/robots.txt")
    except httpx.HTTPError:
        return None  # unreachable robots.txt -> be conservative (see robots_allowed)
    if resp.status_code in (401, 403):
        parser.disallow_all = True
    elif resp.status_code >= 400:
        parser.allow_all = True  # no robots.txt means no restrictions
    else:
        parser.parse(resp.text.splitlines())
    return parser


def robots_allowed(url: str) -> bool:
    """True only when the site's robots.txt allows our User-Agent to fetch ``url``."""
    parts = urlparse(url)
    if parts.scheme not in ("http", "https") or not parts.netloc:
        return False
    parser = _robots_for(f"{parts.scheme}://{parts.netloc}")
    return bool(parser and parser.can_fetch(USER_AGENT, url))


def _get(url: str, *, accept: str) -> httpx.Response:
    try:
        with http_client() as client:
            resp = client.get(url, headers={"Accept": accept})
    except httpx.HTTPError as exc:
        raise FetchError(f"network error: {exc.__class__.__name__}") from exc
    if resp.status_code == 429:
        raise FetchError("rate limited")  # respect rate limits: never retry aggressively
    if resp.status_code >= 400:
        raise FetchError(f"HTTP {resp.status_code}")
    if len(resp.content) > MAX_BYTES:
        raise FetchError("response too large")
    return resp


def get_json(url: str) -> Any:
    """GET a public JSON API endpoint."""
    resp = _get(url, accept="application/json")
    try:
        return resp.json()
    except json.JSONDecodeError as exc:
        raise FetchError("invalid JSON") from exc


def get_html(url: str) -> str:
    """GET an HTML page, only if robots.txt allows it."""
    if not robots_allowed(url):
        raise FetchError("disallowed by robots.txt")
    return _get(url, accept="text/html,application/xhtml+xml").text


class _TextExtractor(HTMLParser):
    _BLOCK = {"p", "div", "br", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "tr", "section", "article"}

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []
        self._skip = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag in ("script", "style"):
            self._skip += 1
        elif tag == "li":
            self.parts.append("\n- ")
        elif tag in self._BLOCK:
            self.parts.append("\n")

    def handle_endtag(self, tag: str) -> None:
        if tag in ("script", "style"):
            self._skip = max(0, self._skip - 1)
        elif tag in self._BLOCK or tag == "li":
            self.parts.append("\n")

    def handle_data(self, data: str) -> None:
        if not self._skip:
            self.parts.append(data)


def html_to_text(markup: str | None) -> str:
    """Readable plain text from HTML (bullets preserved as "- " lines)."""
    if not markup:
        return ""
    if "&lt;" in markup and "<" not in markup:
        markup = html.unescape(markup)  # Greenhouse returns HTML-escaped content
    parser = _TextExtractor()
    parser.feed(markup)
    text = "".join(parser.parts)
    lines = [re.sub(r"[ \t\xa0]+", " ", line).strip() for line in text.splitlines()]
    out: list[str] = []
    for line in lines:
        if line in ("", "-") and (not out or out[-1] == ""):
            continue
        out.append("" if line == "-" else line)
    return "\n".join(out).strip()


def _clean(text: str | None) -> str | None:
    return html.unescape(re.sub(r"\s+", " ", text)).strip() or None if text else None


def page_title_and_description(markup: str) -> tuple[str | None, str | None]:
    """<title> and meta description of an HTML page."""
    title = re.search(r"<title[^>]*>(.*?)</title>", markup, re.IGNORECASE | re.DOTALL)
    desc = re.search(r"<meta[^>]+name=[\"'](?:description|og:description)[\"'][^>]*content=[\"']([^\"']+)",
                     markup, re.IGNORECASE) or re.search(
        r"<meta[^>]+content=[\"']([^\"']+)[\"'][^>]*name=[\"']description[\"']", markup, re.IGNORECASE)
    return _clean(title.group(1) if title else None), _clean(desc.group(1) if desc else None)


def json_ld_blocks(markup: str) -> list[dict[str, Any]]:
    """All JSON-LD objects on a page (flattening lists and @graph)."""
    out: list[dict[str, Any]] = []
    for m in re.finditer(r"<script[^>]+type=[\"']application/ld\+json[\"'][^>]*>(.*?)</script>", markup,
                         re.IGNORECASE | re.DOTALL):
        try:
            data = json.loads(m.group(1).strip())
        except json.JSONDecodeError:
            continue
        stack = data if isinstance(data, list) else [data]
        while stack:
            item = stack.pop(0)
            if isinstance(item, dict):
                out.append(item)
                graph = item.get("@graph")
                if isinstance(graph, list):
                    stack.extend(graph)
            elif isinstance(item, list):
                stack.extend(item)
    return out
