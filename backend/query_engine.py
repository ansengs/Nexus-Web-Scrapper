"""
QueryEngine — rank crawled pages against a natural-language query
and extract focused snippets.

Uses a BM25-lite scoring function: term frequency + inverse document frequency,
with position weights (title > headings > description > content).
"""

import math
import re
from dataclasses import dataclass
from typing import Dict, List, Optional, Set, Tuple

from crawler import CrawledPage


@dataclass
class RankedPage:
    page:     CrawledPage
    score:    float
    snippet:  str
    matched_terms: List[str]

    def as_dict(self) -> Dict:
        p = self.page
        return {
            'url':         p.url,
            'title':       p.title,
            'description': p.description,
            'headings':    p.headings[:5],
            'prices':      p.prices[:5],
            'year_refs':   p.year_refs,
            'depth':       p.depth,
            'score':       round(self.score, 2),
            'snippet':     self.snippet,
            'matched':     self.matched_terms,
        }


class QueryEngine:

    STOPWORDS = {
        'the', 'a', 'an', 'of', 'for', 'from', 'in', 'on', 'at', 'to',
        'and', 'or', 'with', 'what', 'is', 'are', 'how', 'does', 'do',
        'did', 'will', 'can', 'be', 'been', 'being', 'has', 'have', 'had',
        'i', 'me', 'my', 'you', 'your', 'it', 'its', 'this', 'that',
        'these', 'those', 'about', 'tell', 'show', 'find', 'get', 'give',
    }

    # Field weights — matches in these fields score higher
    WEIGHTS = {
        'title':       8.0,
        'headings':    4.0,
        'description': 3.0,
        'url':         2.0,
        'content':     1.0,
    }

    # Query-intent boosts
    RECENCY_TERMS = {'latest', 'newest', 'new', 'recent', 'current', '2025', '2026'}
    PRODUCT_TERMS = {'buy', 'price', 'cost', 'shop', 'order', 'product', 'model'}

    def tokenize(self, text: str) -> List[str]:
        tokens = re.findall(r"\b[a-z0-9][a-z0-9'-]*\b", text.lower())
        return [t for t in tokens if t not in self.STOPWORDS and len(t) > 1]

    # ────────────────────────── Ranking ───────────────────────────────────

    def rank(
        self,
        pages: List[CrawledPage],
        query: str,
        top_k: int = 8,
    ) -> List[RankedPage]:
        query_tokens = self.tokenize(query)
        if not query_tokens:
            # No query terms — return top pages by heuristics alone
            return [self._build_ranked(p, [], 1.0) for p in pages[:top_k]]

        query_set = set(query_tokens)

        # Build IDF across crawled corpus
        N = len(pages)
        df: Dict[str, int] = {}
        for p in pages:
            all_text = (p.title + ' ' + p.description + ' ' +
                        ' '.join(p.headings) + ' ' + p.content).lower()
            page_tokens = set(re.findall(r'\b[a-z0-9]+\b', all_text))
            for term in query_set:
                if term in page_tokens:
                    df[term] = df.get(term, 0) + 1

        idf = {
            term: max(math.log((N - df_t + 0.5) / (df_t + 0.5) + 1), 0.2)
            for term, df_t in df.items()
        }
        # Default idf for unseen terms
        for term in query_set:
            idf.setdefault(term, math.log(N + 1))

        # Score each page
        ranked: List[RankedPage] = []
        for page in pages:
            score, matched = self._score_page(page, query_set, query_tokens, idf)
            if not matched:
                # Skip pages with zero query-term overlap
                continue
            snippet = self._extract_snippet(page, query_set)
            ranked.append(self._build_ranked(page, matched, score, snippet))

        ranked.sort(key=lambda r: -r.score)
        return ranked[:top_k]

    def _score_page(
        self,
        page:        CrawledPage,
        query_set:   Set[str],
        query_list:  List[str],
        idf:         Dict[str, float],
    ) -> Tuple[float, List[str]]:
        matched = set()
        score = 0.0

        title_lc = page.title.lower()
        desc_lc  = page.description.lower()
        head_lc  = ' '.join(page.headings).lower()
        url_lc   = page.url.lower()
        body_lc  = page.content.lower()

        # Count term frequencies per field
        for term in query_set:
            t_idf = idf.get(term, 1.0)

            if term in title_lc:
                score += self.WEIGHTS['title'] * t_idf
                matched.add(term)
            if term in head_lc:
                score += self.WEIGHTS['headings'] * t_idf * head_lc.count(term)
                matched.add(term)
            if term in desc_lc:
                score += self.WEIGHTS['description'] * t_idf
                matched.add(term)
            if term in url_lc:
                score += self.WEIGHTS['url'] * t_idf
                matched.add(term)
            # Content: cap contribution to avoid keyword stuffing wins
            body_hits = body_lc.count(term)
            if body_hits > 0:
                score += self.WEIGHTS['content'] * t_idf * min(body_hits, 10)
                matched.add(term)

        # Heuristic boosts
        # Recency — if query has "latest" etc AND page mentions recent year
        if any(t in query_set for t in self.RECENCY_TERMS):
            if any(y in page.year_refs for y in ('2025', '2026')):
                score *= 1.5
            elif '2024' in page.year_refs:
                score *= 1.2

        # Product query AND page has prices
        wants_product = any(t in query_set for t in self.PRODUCT_TERMS) or \
                        any(t in query_list for t in ('buy', 'price', 'cost'))
        if wants_product and page.prices:
            score *= 1.4

        # Shallow pages tend to be hub/landing pages (more authoritative)
        score *= max(0.5, 1.0 - page.depth * 0.15)

        # Penalize very short content
        if len(page.content) < 200:
            score *= 0.3

        return score, sorted(matched)

    # ────────────────────────── Snippet extraction ────────────────────────

    def _extract_snippet(
        self,
        page:       CrawledPage,
        query_set:  Set[str],
        max_length: int = 280,
    ) -> str:
        """Find the passage with the densest query-term matches."""
        if page.description and any(t in page.description.lower() for t in query_set):
            return page.description[:max_length]

        # Split into windows of ~30 words, find the best
        words = page.content.split()
        if len(words) < 20:
            return page.content[:max_length]

        window_size = 40
        best_score = 0
        best_start = 0
        for i in range(0, len(words) - window_size, 10):
            window = ' '.join(words[i:i + window_size]).lower()
            count = sum(1 for t in query_set if t in window)
            if count > best_score:
                best_score = count
                best_start = i

        if best_score == 0:
            # No match — fall back to description or start of content
            return (page.description or page.content)[:max_length]

        snippet = ' '.join(words[best_start:best_start + window_size])
        # Trim to max_length, ending on word boundary
        if len(snippet) > max_length:
            snippet = snippet[:max_length].rsplit(' ', 1)[0] + '…'
        else:
            snippet += '…'
        return snippet

    # ────────────────────────── Helpers ───────────────────────────────────

    def _build_ranked(
        self,
        page:     CrawledPage,
        matched:  List[str],
        score:    float,
        snippet:  Optional[str] = None,
    ) -> RankedPage:
        if snippet is None:
            snippet = (page.description or page.content[:280])[:280]
        return RankedPage(page=page, score=score, snippet=snippet, matched_terms=matched)
