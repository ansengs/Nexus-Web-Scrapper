import requests
import re
import json
import time
from urllib.parse import urljoin, urlparse
from bs4 import BeautifulSoup
from typing import Dict, List, Optional, Tuple

from crawler import SiteCrawler
from query_engine import QueryEngine


class WebScraper:
    DEFAULT_HEADERS = {
        'User-Agent': (
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
            'AppleWebKit/537.36 (KHTML, like Gecko) '
            'Chrome/120.0.0.0 Safari/537.36'
        ),
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    }

    def __init__(self, timeout: int = 12):
        self.timeout = timeout
        self.session = requests.Session()
        self.session.headers.update(self.DEFAULT_HEADERS)
        self.crawler = SiteCrawler(max_pages=25, max_depth=2, workers=5)
        self.ranker  = QueryEngine()

    # ─────────────────────────── URL Resolution ────────────────────────────

    def resolve_url(self, target: str) -> Optional[str]:
        """Convert company name or partial URL to a reachable full URL."""
        if not target:
            return None

        # Already a full URL — trust it, just normalize it
        if re.match(r'https?://', target):
            return self._normalize_url(target)

        # Looks like a bare domain (contains dot, no spaces)
        if '.' in target and ' ' not in target:
            for prefix in ['https://www.', 'https://']:
                url = prefix + target.lstrip('/')
                if self._domain_exists(url):
                    return url

        # Company name → try common TLD patterns
        slug = re.sub(r'[^a-z0-9]', '', target.lower().replace(' ', ''))
        candidates = [
            f'https://www.{slug}.com',
            f'https://{slug}.com',
            f'https://www.{slug}.org',
            f'https://www.{slug}.io',
            f'https://www.{slug}.net',
        ]
        for url in candidates:
            if self._domain_exists(url):
                return url

        # Fallback: DuckDuckGo HTML search
        return self._search_ddg(target)

    def _normalize_url(self, url: str) -> str:
        """Return the URL as-is if it looks valid; strip fragments."""
        from urllib.parse import urldefrag
        url, _ = urldefrag(url)
        return url

    def _domain_exists(self, url: str) -> bool:
        """
        Check if a domain is reachable. Accepts any HTTP response including
        403/503 (bot-blocking sites are still real). Only returns False if
        the connection itself fails (DNS error, timeout, etc.).
        """
        try:
            r = self.session.get(url, timeout=6, allow_redirects=True)
            # Any HTTP response means the domain exists
            return True
        except requests.exceptions.ConnectionError:
            return False
        except requests.exceptions.Timeout:
            # Might still be valid — treat as exists to avoid false negatives
            return True
        except Exception:
            return False

    def _search_ddg(self, query: str) -> Optional[str]:
        try:
            r = self.session.get(
                'https://html.duckduckgo.com/html/',
                params={'q': f'{query} official site'},
                timeout=8,
            )
            soup = BeautifulSoup(r.text, 'html.parser')
            for link in soup.select('a.result__url, a[href*="uddg="]'):
                href = link.get('href', '')
                # Extract from DDG redirect URL
                m = re.search(r'uddg=([^&]+)', href)
                if m:
                    from urllib.parse import unquote
                    url = unquote(m.group(1))
                    if url.startswith('http') and 'duckduckgo' not in url:
                        return url
        except Exception:
            pass
        return None

    # ──────────────────────────── Page Fetching ────────────────────────────

    def fetch(self, url: str) -> Tuple[BeautifulSoup, str]:
        """Returns (soup, final_url)"""
        r = self.session.get(url, timeout=self.timeout, allow_redirects=True)
        r.raise_for_status()
        soup = BeautifulSoup(r.text, 'html.parser')
        return soup, r.url

    def find_subpage(self, base_soup: BeautifulSoup, base_url: str, keywords: List[str]) -> Optional[str]:
        """Find first internal link matching any keyword."""
        for a in base_soup.find_all('a', href=True):
            href = a['href'].lower()
            text = a.get_text().lower()
            if any(kw in href or kw in text for kw in keywords):
                full = urljoin(base_url, a['href'])
                parsed = urlparse(full)
                base_parsed = urlparse(base_url)
                # Only follow same-domain links
                if parsed.netloc == base_parsed.netloc or not parsed.netloc:
                    return full
        return None

    # ──────────────────────────── Scrape Router ────────────────────────────

    def scrape(self, url: str, intent: str, topic: str = '') -> Dict:
        handlers = {
            'contact':     lambda u, t: self.scrape_contact(u),
            'services':    lambda u, t: self.scrape_services(u, t),
            'history':     lambda u, t: self.scrape_history(u),
            'description': lambda u, t: self.scrape_description(u),
            'inquiry':     lambda u, t: self.scrape_inquiry(u, t),
            'general':     lambda u, t: self.scrape_general(u),
        }
        fn = handlers.get(intent, handlers['general'])
        return fn(url, topic)

    # ──────────────────────────── Scrapers ─────────────────────────────────

    def scrape_contact(self, url: str) -> Dict:
        soup, final_url = self.fetch(url)

        # Try to navigate to a contact subpage
        contact_url = self.find_subpage(soup, final_url, ['contact', 'reach-us', 'reach_us', 'support'])
        if contact_url and contact_url != final_url:
            try:
                soup, _ = self.fetch(contact_url)
            except Exception:
                contact_url = final_url
        else:
            contact_url = final_url

        text = soup.get_text(' ', strip=True)

        emails = list(dict.fromkeys(re.findall(
            r'[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}', text
        )))
        emails = [e for e in emails if not re.search(
            r'(example|sentry|noreply|no-reply|test@|youremail)', e, re.I
        )][:6]

        phones = list(dict.fromkeys(re.findall(
            r'(?:\+?1[\s.-])?(?:\(?\d{3}\)?[\s.-])\d{3}[\s.-]\d{4}', text
        )))[:5]

        address_chunks = re.findall(
            r'\d{1,5}\s+[\w\s]{3,40}(?:Street|St|Ave|Avenue|Road|Rd|'
            r'Boulevard|Blvd|Drive|Dr|Lane|Ln|Way|Court|Ct|Plaza|Pkwy)'
            r'[\w\s,]*\d{5}(?:-\d{4})?', text, re.I
        )
        addresses = list(dict.fromkeys(address_chunks))[:3]

        social = {}
        platforms = {
            'facebook': r'facebook\.com/[\w.]+',
            'twitter': r'(?:twitter|x)\.com/[\w]+',
            'linkedin': r'linkedin\.com/(?:company|in)/[\w-]+',
            'instagram': r'instagram\.com/[\w.]+',
            'youtube': r'youtube\.com/(?:c/|channel/|@)[\w-]+',
            'github': r'github\.com/[\w-]+',
        }
        for a in soup.find_all('a', href=True):
            href = a['href']
            for platform, pattern in platforms.items():
                if platform not in social and re.search(pattern, href, re.I):
                    social[platform] = href

        return {
            'type': 'contact',
            'source_url': contact_url,
            'emails': emails,
            'phones': phones,
            'addresses': addresses,
            'social_media': social,
            'summary': (
                f"Found {len(emails)} email(s), {len(phones)} phone(s), "
                f"{len(addresses)} address(es), {len(social)} social link(s)"
            ),
        }

    def scrape_services(self, url: str, topic: str = '') -> Dict:
        soup, final_url = self.fetch(url)

        services_url = self.find_subpage(
            soup, final_url,
            ['services', 'products', 'solutions', 'offerings', 'what-we-do', 'capabilities']
        )
        if services_url and services_url != final_url:
            try:
                soup, _ = self.fetch(services_url)
            except Exception:
                services_url = final_url
        else:
            services_url = final_url

        items = []
        seen = set()

        # Heading + sibling paragraph
        for tag in soup.find_all(['h2', 'h3', 'h4']):
            name = tag.get_text(' ', strip=True)
            if not name or len(name) < 4 or len(name) > 120:
                continue
            if name.lower() in seen:
                continue
            seen.add(name.lower())

            desc_parts = []
            sib = tag.find_next_sibling()
            while sib and sib.name not in ['h2', 'h3', 'h4'] and len(desc_parts) < 2:
                if sib.name == 'p':
                    t = sib.get_text(' ', strip=True)
                    if t:
                        desc_parts.append(t)
                sib = sib.find_next_sibling()

            items.append({
                'name': name,
                'description': ' '.join(desc_parts)[:300],
            })

            if len(items) >= 12:
                break

        # Fallback: if single-page scrape found fewer than 3 items,
        # fall back to a multi-page crawl to catch JS-heavy product hubs
        # (e.g. apple.com, google.com). The crawler pulls hub pages like
        # /iphone, /mac, /watch which the single-page scraper misses.
        if len(items) < 3:
            try:
                crawl_query = topic or 'products services'
                result = self.crawler.crawl(final_url, query=crawl_query)
                ranked = self.ranker.rank(result.pages, 'products services offerings', top_k=10)
                crawl_items = []
                for r in ranked:
                    if r.page.url == final_url:
                        continue
                    crawl_items.append({
                        'name':        r.page.title or r.page.url,
                        'description': (r.page.description or r.snippet)[:300],
                        'url':         r.page.url,
                    })
                if crawl_items:
                    items = crawl_items
            except Exception as exc:
                # Crawl failed — keep whatever single-page items we had
                pass

        return {
            'type':       'services',
            'source_url': services_url,
            'items':      items,
            'count':      len(items),
            'summary':    f"Found {len(items)} service/product listing(s)",
        }

    def scrape_history(self, url: str) -> Dict:
        soup, final_url = self.fetch(url)

        about_url = self.find_subpage(
            soup, final_url,
            ['about', 'history', 'our-story', 'story', 'company', 'who-we-are', 'mission']
        )
        if about_url and about_url != final_url:
            try:
                soup, _ = self.fetch(about_url)
            except Exception:
                about_url = final_url
        else:
            about_url = final_url

        paragraphs = [
            p.get_text(' ', strip=True)
            for p in soup.find_all('p')
            if len(p.get_text(strip=True)) > 60
        ]

        full_text = ' '.join(paragraphs[:8])
        years = sorted(set(re.findall(r'\b(1[89]\d{2}|20[0-2]\d)\b', full_text)))

        # Try to find a founding statement
        founding = ''
        for para in paragraphs[:6]:
            if re.search(r'found(ed|ing)|establish|start(ed)?|creat(ed)?|born', para, re.I):
                founding = para[:400]
                break

        return {
            'type': 'history',
            'source_url': about_url,
            'founding_statement': founding,
            'key_years': years[:10],
            'overview': full_text[:1200],
            'paragraph_count': len(paragraphs),
            'summary': (
                f"Found historical content across {len(paragraphs)} paragraph(s). "
                f"Key years: {', '.join(years[:5]) if years else 'none detected'}"
            ),
        }

    def scrape_description(self, url: str) -> Dict:
        soup, final_url = self.fetch(url)

        def meta(name=None, prop=None):
            if name:
                tag = soup.find('meta', attrs={'name': name})
            else:
                tag = soup.find('meta', property=prop)
            return (tag.get('content', '') if tag else '').strip()

        title = soup.title.string.strip() if soup.title else ''
        meta_desc = meta(name='description') or meta(prop='og:description')
        keywords = meta(name='keywords')
        og_image = meta(prop='og:image')

        paragraphs = [
            p.get_text(' ', strip=True)
            for p in soup.find_all('p')
            if len(p.get_text(strip=True)) > 40
        ][:4]

        return {
            'type': 'description',
            'source_url': final_url,
            'title': title,
            'meta_description': meta_desc,
            'keywords': keywords,
            'og_image': og_image,
            'overview': ' '.join(paragraphs)[:800],
            'summary': meta_desc or (paragraphs[0][:200] if paragraphs else 'No description found'),
        }

    def scrape_general(self, url: str) -> Dict:
        desc = self.scrape_description(url)
        try:
            contact = self.scrape_contact(url)
            contact_preview = {
                'emails': contact['emails'][:2],
                'phones': contact['phones'][:2],
                'social': list(contact['social_media'].keys())[:3],
            }
        except Exception:
            contact_preview = {}

        return {
            'type': 'general',
            'source_url': url,
            'title': desc.get('title', ''),
            'description': desc.get('summary', ''),
            'contact_preview': contact_preview,
            'keywords': desc.get('keywords', ''),
            'og_image': desc.get('og_image', ''),
            'summary': desc.get('summary', '')[:250],
        }

    # ──────────────────────────── Inquiry (crawl + rank) ───────────────────

    def scrape_inquiry(self, url: str, topic: str = '') -> Dict:
        """
        Multi-page inquiry: crawl the site, rank pages against the topic,
        and return the top matches with extracted snippets, prices, and years.
        """
        result = self.crawler.crawl(url, query=topic)

        if not result.pages:
            return {
                'type':       'inquiry',
                'source_url': url,
                'topic':      topic,
                'matches':    [],
                'stats':      result.as_dict(),
                'summary':    'No pages could be crawled from this site.',
            }

        ranked = self.ranker.rank(result.pages, topic, top_k=8)

        matches = [r.as_dict() for r in ranked]

        # Aggregate signals across top results
        all_prices = []
        all_years  = []
        for r in ranked[:5]:
            all_prices.extend(r.page.prices[:3])
            all_years.extend(r.page.year_refs)
        all_prices = list(dict.fromkeys(all_prices))[:8]
        all_years  = sorted(set(all_years))[-5:]

        top = ranked[0] if ranked else None
        if top:
            summary = (
                f"Crawled {result.as_dict()['page_count']} page(s). "
                f"Top match: {top.page.title or top.page.url} "
                f"(score {top.score:.1f})"
            )
        else:
            summary = f"Crawled {result.as_dict()['page_count']} page(s) — no strong matches."

        return {
            'type':       'inquiry',
            'source_url': url,
            'topic':      topic,
            'matches':    matches,
            'prices':     all_prices,
            'years':      all_years,
            'stats':      result.as_dict(),
            'summary':    summary,
        }

    # ──────────────────────────── Interaction ──────────────────────────────

    def interact(self, url: str, action: str, data: Dict) -> Dict:
        """Programmatic website interaction (form submission, etc.)"""
        try:
            if action == 'post':
                r = self.session.post(url, data=data, timeout=self.timeout)
                return {
                    'success': True,
                    'status_code': r.status_code,
                    'final_url': r.url,
                    'preview': r.text[:600],
                }
            elif action == 'get':
                r = self.session.get(url, params=data, timeout=self.timeout)
                return {'success': True, 'status_code': r.status_code, 'final_url': r.url}
            else:
                return {'success': False, 'error': f'Unknown action: {action}'}
        except Exception as exc:
            return {'success': False, 'error': str(exc)}

    # ──────────────────────────── Proxy ────────────────────────────────────

    def fetch_proxied_full(self, url: str) -> tuple:
        """
        Fetch a page and prepare it for iframe embedding:
        1. Strip X-Frame-Options / CSP from response headers (done at FastAPI level)
        2. Inject <base href> so relative URLs resolve correctly
        3. Rewrite <a href> links to pass through /proxy?url=... so navigation
           stays within the preview panel (stays proxied)
        4. Rewrite absolute asset src/href attributes with /proxy/raw?url=...
           so images and CSS load through the proxy (avoids mixed-content blocks)

        Returns (html: str, content_type: str, error: str|None)
        """
        try:
            r = self.session.get(url, timeout=12, allow_redirects=True)
            content_type = r.headers.get('Content-Type', 'text/html')

            if 'text/html' not in content_type and 'xhtml' not in content_type:
                return '', content_type, f"Content-Type is {content_type!r}, not HTML"

            final_url = r.url
            soup = BeautifulSoup(r.text, 'html.parser')

            # ── 1. Inject / replace <base href> ──────────────────────────
            existing_base = soup.find('base')
            if existing_base:
                existing_base.decompose()

            head = soup.find('head')
            if not head:
                head = soup.new_tag('head')
                if soup.html:
                    soup.html.insert(0, head)
                else:
                    soup.insert(0, head)

            base_tag = soup.new_tag('base', href=final_url, target='_blank')
            head.insert(0, base_tag)

            # ── 2. Inject helper script for proxy-aware navigation ────────
            proxy_base = '/proxy?url='
            proxy_script = soup.new_tag('script')
            proxy_script.string = """
(function() {
  // Intercept all clicks on <a> tags and keep them within the proxy
  document.addEventListener('click', function(e) {
    var el = e.target.closest('a[href]');
    if (!el) return;
    var href = el.getAttribute('href');
    if (!href || href.startsWith('#') || href.startsWith('javascript:')) return;
    // Absolute URL — route through proxy
    if (href.startsWith('http')) {
      e.preventDefault();
      var proxyUrl = '/proxy?url=' + encodeURIComponent(href);
      // Post message to parent frame to navigate
      window.parent.postMessage({type:'NEXUS_NAV', url: href}, '*');
    }
  }, true);
})();
"""
            if soup.body:
                soup.body.append(proxy_script)

            # ── 3. Rewrite absolute src attributes through /proxy/raw ─────
            for tag in soup.find_all(True):
                for attr in ('src', 'data-src', 'data-lazy-src'):
                    val = tag.get(attr, '')
                    if val and val.startswith('http'):
                        tag[attr] = f'/proxy/raw?url={requests.utils.quote(val, safe="")}'

                # Rewrite <link href> for stylesheets
                if tag.name == 'link':
                    rel = tag.get('rel', [])
                    if 'stylesheet' in rel:
                        href = tag.get('href', '')
                        if href and href.startswith('http'):
                            tag['href'] = f'/proxy/raw?url={requests.utils.quote(href, safe="")}'

            return str(soup), content_type, None

        except requests.exceptions.ConnectionError as e:
            return '', 'text/html', f"Connection refused: {e}"
        except requests.exceptions.Timeout:
            return '', 'text/html', "Request timed out"
        except Exception as e:
            return '', 'text/html', str(e)

    # Keep old method name as alias for backwards compat
    def fetch_proxied(self, url: str) -> str:
        html, _, _ = self.fetch_proxied_full(url)
        return html
