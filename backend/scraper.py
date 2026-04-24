import requests
import re
import json
import time
from urllib.parse import urljoin, urlparse
from bs4 import BeautifulSoup
from typing import Dict, List, Optional, Tuple


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

    # ─────────────────────────── URL Resolution ────────────────────────────

    def resolve_url(self, target: str) -> Optional[str]:
        """Convert company name or partial URL to a reachable full URL."""
        if not target:
            return None

        # Already a full URL
        if re.match(r'https?://', target):
            return self._verify_url(target)

        # Looks like a domain (contains dot)
        if '.' in target and ' ' not in target:
            for prefix in ['https://www.', 'https://']:
                url = prefix + target.lstrip('/')
                result = self._verify_url(url)
                if result:
                    return result

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
            result = self._verify_url(url)
            if result:
                return result

        # Fallback: DuckDuckGo HTML search
        return self._search_ddg(target)

    def _verify_url(self, url: str) -> Optional[str]:
        try:
            r = self.session.get(url, timeout=6, allow_redirects=True)
            if r.status_code < 400:
                return r.url
        except Exception:
            pass
        return None

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

    def scrape(self, url: str, intent: str) -> Dict:
        handlers = {
            'contact':     self.scrape_contact,
            'services':    self.scrape_services,
            'history':     self.scrape_history,
            'description': self.scrape_description,
            'general':     self.scrape_general,
        }
        fn = handlers.get(intent, self.scrape_general)
        return fn(url)

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

    def scrape_services(self, url: str) -> Dict:
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

        return {
            'type': 'services',
            'source_url': services_url,
            'items': items,
            'count': len(items),
            'summary': f"Found {len(items)} service/product listing(s)",
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

    def fetch_proxied(self, url: str) -> str:
        """Fetch page HTML with base-href injected for inline rendering."""
        try:
            r = self.session.get(url, timeout=self.timeout)
            html = r.text
            base_tag = f'<base href="{url}" target="_blank">'
            # Remove existing X-Frame-Options via CSP injection
            if '<head>' in html:
                html = html.replace('<head>', f'<head>{base_tag}', 1)
            elif '<HEAD>' in html:
                html = html.replace('<HEAD>', f'<HEAD>{base_tag}', 1)
            return html
        except Exception as exc:
            return f'<html><body><p>Error fetching page: {exc}</p></body></html>'
