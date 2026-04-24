import re
from typing import Dict, Tuple


class NLPProcessor:
    """
    Lightweight NLP for web-scraping queries.

    Returns (intent, target, topic):
      intent  — contact | services | history | description | inquiry | general
      target  — URL or company name to scrape
      topic   — the specific thing being asked about (empty for simple queries)

    Examples:
      "contact info for apple.com"   → ('contact',  'https://apple.com', '')
      "latest iPhone from apple.com" → ('inquiry',  'https://apple.com', 'latest iphone')
      "apple.com"                    → ('general',  'https://apple.com', '')
    """

    INTENT_PATTERNS: Dict[str, list] = {
        'contact': [
            (r'\bcontact\b', 3), (r'\bemail\b', 3), (r'\bphone\b', 3),
            (r'\baddress\b', 2), (r'\breach\b', 2), (r'\bcall\b', 2),
            (r'\bsocial media\b', 2), (r'\bget in touch\b', 3),
            (r'\blocation\b', 1), (r'\boffice\b', 1), (r'\bfax\b', 2),
            (r'\bheadquarter', 2),
        ],
        'services': [
            (r'\bservice', 3), (r'\boffer', 2), (r'\bprovide', 2),
            (r'\bsolution', 2), (r'\bfeature', 2), (r'\bplan', 1),
            (r'\bpackage', 2), (r'\bwhat do they (do|make|sell|offer)', 3),
            (r'\bcapabilit', 2), (r'\bportfolio\b', 2),
        ],
        'history': [
            (r'\bhistory\b', 3), (r'\bfounded\b', 3), (r'\bfounding\b', 3),
            (r'\bstory\b', 2), (r'\bbackground\b', 2),
            (r'\bwhen did\b', 3), (r'\borigin', 3),
            (r'\bstarted\b', 2), (r'\bestablished\b', 2),
            (r'\bbeginning', 2), (r'\bcreated\b', 2),
            (r'\bfounded by\b', 3), (r'\bwho founded\b', 3),
        ],
        'description': [
            (r'\bdescri', 3), (r'\bwhat is\b', 3), (r'\boverview\b', 3),
            (r'\bsummary\b', 2), (r'\bgeneral info', 2),
            (r'\btell me about\b', 3), (r'\bwho (is|are)\b', 2),
            (r'\bexplain\b', 2),
        ],
    }

    # Query phrases that indicate a specific inquiry → route through crawler
    INQUIRY_MARKERS = [
        r'\blatest\b', r'\bnewest\b', r'\brecent\b', r'\bnew\b',
        r'\bbest\b', r'\btop\b', r'\bmost popular\b',
        r'\bcompare\b', r'\bvs\b', r'\bversus\b',
        r'\bwhich\b', r'\bwhen (is|will|does)\b',
        r'\bfind\b', r'\blook(ing)? for\b',
        r'\bprice of\b', r'\bhow much\b', r'\bcost\b',
        r'\bproduct', r'\biphone\b', r'\bipad\b', r'\bmac\b',
    ]

    STOP_WORDS = {
        'get', 'find', 'what', 'show', 'me', 'the', 'for', 'of', 'a', 'an',
        'about', 'is', 'are', 'contact', 'information', 'history',
        'description', 'tell', 'give', 'details', 'from', 'on', 'at', 'by',
        'with', 'their', 'its', 'and', 'or', 'in', 'to', 'how', 'does', 'do',
        'did', 'was', 'were', 'has', 'have', 'had', 'website', 'site', 'page',
        'web', 'please', 'can', 'could', 'would', 'should', 'look', 'up',
        'search', 'scrape', 'fetch', 'retrieve', 'pull', 'info', 'data',
        'i', 'want', 'need', 'like', 'know', 'check',
    }

    URL_REGEX = re.compile(
        r'(?:https?://)?(?:www\.)?([a-zA-Z0-9](?:[a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?'
        r'(?:\.[a-zA-Z]{2,})+)(?:/[^\s]*)?'
    )

    def process_query(self, query: str) -> Tuple[str, str, str]:
        q_lower = query.lower().strip()
        target, q_without_target = self._extract_target(query, q_lower)
        intent = self._classify_intent(q_lower)
        topic  = self._extract_topic(q_without_target)

        has_inquiry_marker = any(re.search(p, q_lower) for p in self.INQUIRY_MARKERS)

        # Promote to inquiry intent if the query has specific topic + marker
        if intent == 'general' and (topic or has_inquiry_marker):
            intent = 'inquiry'
        elif intent == 'description' and has_inquiry_marker and topic:
            intent = 'inquiry'
        elif intent == 'services' and topic and has_inquiry_marker:
            # "latest iPhone" shouldn't just be "services" — it's a specific inquiry
            intent = 'inquiry'

        return intent, target, topic

    def explain(self, query: str) -> Dict:
        q_lower = query.lower()
        scores = {}
        for intent, patterns in self.INTENT_PATTERNS.items():
            score = 0
            matches = []
            for pattern, weight in patterns:
                if re.search(pattern, q_lower):
                    score += weight
                    matches.append(pattern)
            scores[intent] = {'score': score, 'matches': matches}
        intent, target, topic = self.process_query(query)
        return {
            'intent': intent, 'target': target, 'topic': topic,
            'scores': scores,
            'inquiry_markers': [p for p in self.INQUIRY_MARKERS if re.search(p, q_lower)],
        }

    # ────── private ─────────────────────────────────────────────────────

    def _classify_intent(self, query: str) -> str:
        scores = {k: 0.0 for k in self.INTENT_PATTERNS}
        for intent, patterns in self.INTENT_PATTERNS.items():
            for pattern, weight in patterns:
                if re.search(pattern, query):
                    scores[intent] += weight
        best = max(scores, key=scores.get)
        return best if scores[best] > 0 else 'general'

    def _extract_target(self, query: str, query_lower: str) -> Tuple[str, str]:
        match = self.URL_REGEX.search(query)
        if match:
            full = match.group(0)
            target = full if full.startswith('http') else 'https://' + full
            q_without = query[:match.start()] + query[match.end():]
            return target, q_without

        # Fall back to capitalized proper-noun phrases
        caps = re.findall(r'\b([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?)\b', query)
        if caps:
            target = caps[-1]
            q_without = query.replace(target, ' ', 1)
            return target, q_without

        tokens = [t for t in re.findall(r'\b[\w.-]+\b', query)
                  if t.lower() not in self.STOP_WORDS and len(t) > 2]
        if tokens:
            target = max(tokens, key=len)
            q_without = query.replace(target, ' ', 1)
            return target, q_without

        return query.strip(), ''

    def _extract_topic(self, q_without_target: str) -> str:
        cleaned = q_without_target.lower()
        kill_patterns = [
            r'contact (?:information|info|details)?',
            r'(?:get|find|show|give|tell) (?:me )?(?:the )?',
            r'(?:services?|offerings?)\s*(?:that\s+)?(?:they\s+)?(?:offer|provide|sell|have)?',
            r'history\s*(?:of|about)?',
            r'(?:describe|description|overview|summary)\s*(?:of)?',
            r'(?:what is|what are|who is|who are|tell me about)',
            r'(?:search for|look up|look for|check)',
            r'(?:can you|could you|please)',
            r'\b(?:from|on|at|in)\s+',
        ]
        for pat in kill_patterns:
            cleaned = re.sub(pat, ' ', cleaned)

        tokens = re.findall(r'\b[\w-]+\b', cleaned)
        meaningful = [t for t in tokens if t not in self.STOP_WORDS and len(t) > 1]
        return ' '.join(meaningful).strip()
