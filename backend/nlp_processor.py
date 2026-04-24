import re
from typing import Tuple, Dict

class NLPProcessor:
    """
    Lightweight NLP intent classifier for web scraping queries.
    No external model dependencies - uses weighted keyword matching + regex.
    """

    INTENT_PATTERNS: Dict[str, list] = {
        'contact': [
            (r'\bcontact\b', 3),
            (r'\bemail\b', 3),
            (r'\bphone\b', 3),
            (r'\baddress\b', 2),
            (r'\breach\b', 2),
            (r'\bcall\b', 2),
            (r'\bsocial media\b', 2),
            (r'\bget in touch\b', 3),
            (r'\blocation\b', 1),
            (r'\boffice\b', 1),
            (r'\bfax\b', 2),
            (r'\bheadquarter', 2),
        ],
        'services': [
            (r'\bservice', 3),
            (r'\bproduct', 3),
            (r'\boffer', 2),
            (r'\bprovide', 2),
            (r'\bsolution', 2),
            (r'\bfeature', 2),
            (r'\bplan', 1),
            (r'\bpackage', 2),
            (r'\bpric', 2),
            (r'\bwhat do they (do|make|sell|offer)', 3),
            (r'\bcapabilit', 2),
            (r'\bportfolio\b', 2),
        ],
        'history': [
            (r'\bhistory\b', 3),
            (r'\bfounded\b', 3),
            (r'\bfounding\b', 3),
            (r'\bstory\b', 2),
            (r'\bbackground\b', 2),
            (r'\bwhen did\b', 3),
            (r'\borigin', 3),
            (r'\bstarted\b', 2),
            (r'\bestablished\b', 2),
            (r'\bbeginning', 2),
            (r'\bcreated\b', 2),
            (r'\bfounded by\b', 3),
            (r'\bwho founded\b', 3),
        ],
        'description': [
            (r'\bdescri', 3),
            (r'\bwhat is\b', 3),
            (r'\boverview\b', 3),
            (r'\bsummary\b', 2),
            (r'\bgeneral info', 2),
            (r'\btell me about\b', 3),
            (r'\bwho (is|are)\b', 2),
            (r'\babout\b', 1),
            (r'\bexplain\b', 2),
            (r'\bwhat (does|do)\b', 2),
        ],
    }

    # Words to strip when extracting company name
    STOP_WORDS = {
        'get', 'find', 'what', 'show', 'me', 'the', 'for', 'of', 'a', 'an',
        'about', 'is', 'are', 'contact', 'information', 'services', 'history',
        'description', 'tell', 'give', 'details', 'from', 'on', 'at', 'by',
        'with', 'their', 'its', 'and', 'or', 'in', 'to', 'how', 'does', 'do',
        'did', 'was', 'were', 'has', 'have', 'had', 'company', 'website',
        'site', 'page', 'web', 'please', 'can', 'could', 'would', 'should',
        'look', 'up', 'search', 'scrape', 'fetch', 'retrieve', 'pull',
        'info', 'data', 'i', 'want', 'need', 'like', 'know', 'check',
    }

    URL_REGEX = re.compile(
        r'(?:https?://)?(?:www\.)?([a-zA-Z0-9](?:[a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?'
        r'(?:\.[a-zA-Z]{2,})+)(?:/[^\s]*)?'
    )

    def process_query(self, query: str) -> Tuple[str, str]:
        """Returns (intent, target_url_or_company)"""
        q_lower = query.lower().strip()
        intent = self._classify_intent(q_lower)
        target = self._extract_target(query, q_lower)
        return intent, target

    def _classify_intent(self, query: str) -> str:
        scores = {k: 0.0 for k in self.INTENT_PATTERNS}
        for intent, patterns in self.INTENT_PATTERNS.items():
            for pattern, weight in patterns:
                if re.search(pattern, query):
                    scores[intent] += weight

        best = max(scores, key=scores.get)
        return best if scores[best] > 0 else 'general'

    def _extract_target(self, query: str, query_lower: str) -> str:
        # Direct URL match
        match = self.URL_REGEX.search(query)
        if match:
            full = match.group(0)
            return full if full.startswith('http') else 'https://' + full

        # Remove intent keywords, then extract company name
        cleaned = query_lower
        for intent_words in [
            r'contact (?:information|info|details)?',
            r'(?:get|find|show|give|tell) (?:me )?(?:the )?',
            r'(?:services?|products?|offerings?)',
            r'history (?:of|about)?',
            r'(?:describe|description|overview|summary) (?:of)?',
            r'(?:what is|what are|who is|who are|tell me about)',
            r'(?:search for|look up|find|get|check)',
        ]:
            cleaned = re.sub(intent_words, ' ', cleaned)

        tokens = re.findall(r'\b[a-zA-Z0-9][\w.-]*\b', cleaned)
        candidates = [t for t in tokens if t.lower() not in self.STOP_WORDS and len(t) > 1]

        if not candidates:
            return query.strip()

        # Prefer tokens that look like domains or company names
        for c in candidates:
            if '.' in c and len(c) > 3:
                return 'https://' + c if not c.startswith('http') else c

        # Join first 1-2 candidates as company name
        return ' '.join(candidates[:2])

    def explain(self, query: str) -> Dict:
        """Debug helper - returns classification details"""
        q_lower = query.lower()
        scores = {}
        for intent, patterns in self.INTENT_PATTERNS.items():
            score = 0
            matched = []
            for pattern, weight in patterns:
                if re.search(pattern, q_lower):
                    score += weight
                    matched.append(pattern)
            scores[intent] = {'score': score, 'matches': matched}
        intent, target = self.process_query(query)
        return {'intent': intent, 'target': target, 'scores': scores}
