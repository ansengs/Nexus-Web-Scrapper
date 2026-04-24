"""
SiteCrawler — BFS web crawler with priority queue and concurrent fetching.

Starts at a URL, follows internal links up to max_depth, collects page content,
prioritizes links that look relevant to an optional query, respects robots.txt.
"""

import re
import time
import urllib.robotparser
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Set, Tuple
from urllib.parse import urljoin, urlparse, urldefrag

import requests
from bs4 import BeautifulSoup


@dataclass
class CrawledPage:
    url:         str
    title:       str
    description: str         # meta description
    headings:    List[str]   # h1 + h2 + h3 text
    content:     str         # visible text, trimmed
    prices:      List[str]   # detected $X,XXX patterns
    year_refs:   List[str]   # detected year mentions (2023-2026)
    link_count:  int
    depth:       int
    fetched_at:  float


@dataclass
class CrawlResult:
    start_url:   str
    base_domain: str
    pages:       List[CrawledPage]   = field(default_factory=list)
    failed_urls: List[str]           = field(default_factory=list)
    elapsed:     float               = 0.0

    def as_dict(self) -> Dict:
        return {
            'start_url':   self.start_url,
            'base_domain': self.base_domain,
            'page_count':  len(self.pages),
            'failed':      len(self.failed_urls),
            'elapsed_sec': round(self.elapsed, 2),
        }


class SiteCrawler:
    DEFAULT_HEADERS = {
        'User-Agent': (
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) '
            'AppleWebKit/537.36 (KHTML, like Gecko) '
            'Chrome/120.0.0.0 Safari/537.36'
        ),
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',
        'Upgrade-Insecure-Requests': '1',
    }

    # File extensions to skip
    SKIP_EXT = re.compile(
        r'\.(pdf|zip|tar|gz|rar|7z|exe|dmg|pkg|mp4|mp3|avi|mov|wmv|flv|'
        r'webm|wav|ogg|jpg|jpeg|png|gif|svg|webp|ico|css|js|xml|rss|json)$',
        re.IGNORECASE,
    )

    # URL patterns to deprioritize (low-value pages)
    LOW_VALUE_PATTERNS = [
        r'/privacy', r'/terms', r'/cookie', r'/legal', r'/careers?',
        r'/sitemap', r'/login', r'/signin', r'/signup', r'/register',
        r'/account', r'/cart', r'/checkout', r'/search\?', r'#',
    ]

    def __init__(
        self,
        max_pages:  int  = 25,
        max_depth:  int  = 2,
        workers:    int  = 5,
        timeout:    int  = 8,
        respect_robots: bool = False,
    ):
        self.max_pages      = max_pages
        self.max_depth      = max_depth
        self.workers        = workers
        self.timeout        = timeout
        self.respect_robots = respect_robots

        self.session = requests.Session()
        self.session.headers.update(self.DEFAULT_HEADERS)

    # ────────────────────────── Main crawl ────────────────────────────────

    def crawl(self, start_url: str, query: Optional[str] = None) -> CrawlResult:
        """BFS crawl from start_url, collecting up to max_pages."""
        t0 = time.time()
        parsed     = urlparse(start_url)
        base_domain = parsed.netloc
        result     = CrawlResult(start_url=start_url, base_domain=base_domain)

        # Load robots.txt
        robots = self._load_robots(parsed) if self.respect_robots else None

        # Query keywords for link prioritization
        query_terms = self._tokenize(query) if query else set()

        # Priority frontier: list of (priority, url, depth)
        # Higher priority crawled first
        frontier: List[Tuple[float, str, int]] = [(100.0, start_url, 0)]
        visited: Set[str] = set()

        while frontier and len(result.pages) < self.max_pages:
            # Take top N highest-priority URLs to fetch in parallel
            frontier.sort(key=lambda x: -x[0])
            batch = []
            while frontier and len(batch) < self.workers and \
                  len(result.pages) + len(batch) < self.max_pages:
                _, url, depth = frontier.pop(0)
                if url in visited:
                    continue
                if robots and not robots.can_fetch(
                    self.DEFAULT_HEADERS['User-Agent'], url
                ):
                    continue
                visited.add(url)
                batch.append((url, depth))

            if not batch:
                break

            # Fetch batch in parallel
            with ThreadPoolExecutor(max_workers=self.workers) as pool:
                futures = {pool.submit(self._fetch_page, u, d): (u, d) for u, d in batch}
                for future in as_completed(futures):
                    url, depth = futures[future]
                    try:
                        page, links = future.result()
                    except Exception:
                        result.failed_urls.append(url)
                        continue
                    if not page:
                        result.failed_urls.append(url)
                        continue

                    result.pages.append(page)

                    # Queue new links
                    if depth < self.max_depth:
                        for link_url, link_text in links:
                            if link_url in visited:
                                continue
                            priority = self._link_priority(
                                link_url, link_text, query_terms, depth
                            )
                            frontier.append((priority, link_url, depth + 1))

        result.elapsed = time.time() - t0
        return result

    # ────────────────────────── Fetch + parse ─────────────────────────────

    def _fetch_page(
        self, url: str, depth: int
    ) -> Tuple[Optional[CrawledPage], List[Tuple[str, str]]]:
        """Fetch one page, return (CrawledPage, outbound_links) or (None, [])."""
        try:
            r = self.session.get(url, timeout=self.timeout, allow_redirects=True)
            if r.status_code >= 400:
                return None, []
            content_type = r.headers.get('Content-Type', '')
            if 'text/html' not in content_type and 'xhtml' not in content_type:
                return None, []
        except Exception:
            return None, []

        soup = BeautifulSoup(r.text, 'html.parser')

        # Extract links FIRST, before stripping navigation tags
        # (nav/header/footer contain most internal links on modern sites)
        base_domain = urlparse(r.url).netloc
        links = self._extract_links(soup, r.url, base_domain)

        # Now strip noise elements for text-content extraction
        for tag in soup(['script', 'style', 'noscript']):
            tag.decompose()

        # Title
        title = (soup.title.string.strip() if soup.title and soup.title.string else '')[:200]

        # Meta description
        desc_tag = soup.find('meta', attrs={'name': 'description'}) \
                   or soup.find('meta', attrs={'property': 'og:description'})
        description = (desc_tag.get('content', '') if desc_tag else '')[:500]

        # Headings
        headings = []
        for level in ['h1', 'h2', 'h3']:
            for h in soup.find_all(level):
                t = h.get_text(' ', strip=True)
                if t and len(t) < 200:
                    headings.append(t)
        headings = headings[:20]

        # Content (main body text)
        body = soup.body or soup
        content = body.get_text(' ', strip=True)
        content = re.sub(r'\s+', ' ', content)[:8000]

        # Extract prices
        prices = list(dict.fromkeys(
            re.findall(r'\$\s?\d{1,3}(?:,\d{3})*(?:\.\d{2})?', content)
        ))[:10]

        # Extract year references
        years = list(dict.fromkeys(
            re.findall(r'\b(?:2023|2024|2025|2026)\b', content)
        ))

        page = CrawledPage(
            url=r.url,
            title=title,
            description=description,
            headings=headings,
            content=content,
            prices=prices,
            year_refs=years,
            link_count=len(links),
            depth=depth,
            fetched_at=time.time(),
        )
        return page, links

    def _extract_links(
        self, soup: BeautifulSoup, base_url: str, base_domain: str
    ) -> List[Tuple[str, str]]:
        out = []
        seen = set()
        for a in soup.find_all('a', href=True):
            raw = a['href'].strip()
            if not raw or raw.startswith(('#', 'mailto:', 'tel:', 'javascript:')):
                continue

            absolute = urljoin(base_url, raw)
            absolute, _ = urldefrag(absolute)  # strip fragment

            parsed = urlparse(absolute)
            if parsed.scheme not in ('http', 'https'):
                continue
            if parsed.netloc != base_domain:
                continue
            if self.SKIP_EXT.search(parsed.path):
                continue
            if absolute in seen:
                continue
            seen.add(absolute)

            text = a.get_text(' ', strip=True)[:120]
            out.append((absolute, text))
        return out

    # ────────────────────────── Link prioritization ───────────────────────

    def _link_priority(
        self,
        url:         str,
        link_text:   str,
        query_terms: Set[str],
        depth:       int,
    ) -> float:
        """Higher = crawled sooner. Max ~100."""
        score = 50.0

        # Depth penalty (prefer shallow)
        score -= depth * 10

        # Deprioritize low-value URLs
        lower_url = url.lower()
        for pat in self.LOW_VALUE_PATTERNS:
            if re.search(pat, lower_url):
                score -= 30
                break

        if query_terms:
            tl = link_text.lower()
            ul = lower_url
            matched = 0
            for term in query_terms:
                if term in tl:
                    score += 15
                    matched += 1
                if term in ul:
                    score += 10
                    matched += 1
            if matched == 0:
                score -= 5

        # Prefer shorter URLs (often hub pages)
        score -= min(len(url) / 40, 10)

        return score

    # ────────────────────────── robots.txt ────────────────────────────────

    def _load_robots(self, parsed_url) -> Optional[urllib.robotparser.RobotFileParser]:
        robots_url = f'{parsed_url.scheme}://{parsed_url.netloc}/robots.txt'
        try:
            rp = urllib.robotparser.RobotFileParser()
            rp.set_url(robots_url)
            rp.read()
            return rp
        except Exception:
            return None

    # ────────────────────────── Helpers ───────────────────────────────────

    @staticmethod
    def _tokenize(text: str) -> Set[str]:
        stop = {'the', 'a', 'an', 'of', 'for', 'from', 'in', 'on', 'at',
                'to', 'and', 'or', 'with', 'what', 'is', 'are', 'how'}
        tokens = re.findall(r'\b[a-z0-9]+\b', text.lower())
        return {t for t in tokens if t not in stop and len(t) > 1}
