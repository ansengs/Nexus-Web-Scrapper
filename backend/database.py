import sqlite3
import json
import uuid
import os
from datetime import datetime
from typing import List, Dict, Optional


class ScraperDatabase:
    """
    SQLite3 persistence layer for Nexus Scraper.
    Schema: sessions (conversations) → searches (individual queries)
    """

    SCHEMA = """
    CREATE TABLE IF NOT EXISTS sessions (
        id          TEXT PRIMARY KEY,
        title       TEXT NOT NULL,
        created_at  TEXT NOT NULL,
        updated_at  TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS searches (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id  TEXT NOT NULL,
        query       TEXT NOT NULL,
        intent      TEXT NOT NULL,
        target      TEXT NOT NULL,
        url         TEXT NOT NULL,
        results     TEXT NOT NULL,   -- JSON blob
        timestamp   TEXT NOT NULL,
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_searches_session ON searches(session_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_updated ON sessions(updated_at DESC);
    """

    def __init__(self, filepath: str):
        self.filepath = filepath
        os.makedirs(os.path.dirname(filepath), exist_ok=True)

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.filepath)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        conn.execute("PRAGMA journal_mode = WAL")
        return conn

    def initialize(self):
        """Create schema if not present."""
        with self._connect() as conn:
            for stmt in self.SCHEMA.split(';'):
                stmt = stmt.strip()
                if stmt:
                    conn.execute(stmt)

    # ──────────────────────────── Write ────────────────────────────────────

    def create_session(self, title: str) -> str:
        sid = str(uuid.uuid4())[:12]
        now = self._now()
        with self._connect() as conn:
            conn.execute(
                'INSERT INTO sessions (id, title, created_at, updated_at) VALUES (?,?,?,?)',
                (sid, title[:80], now, now)
            )
        return sid

    def ensure_session(self, session_id: Optional[str], fallback_title: str) -> str:
        """Return existing session or create a new one."""
        if session_id:
            with self._connect() as conn:
                row = conn.execute('SELECT id FROM sessions WHERE id=?', (session_id,)).fetchone()
            if row:
                return session_id
        return self.create_session(fallback_title)

    def save_search(
        self,
        query: str,
        intent: str,
        target: str,
        url: str,
        results: Dict,
        session_id: Optional[str] = None,
    ) -> str:
        """Persist a search result and return the session_id."""
        sid = self.ensure_session(session_id, query[:60])
        now = self._now()
        with self._connect() as conn:
            conn.execute(
                '''INSERT INTO searches
                   (session_id, query, intent, target, url, results, timestamp)
                   VALUES (?,?,?,?,?,?,?)''',
                (sid, query, intent, target, url, json.dumps(results), now)
            )
            conn.execute('UPDATE sessions SET updated_at=? WHERE id=?', (now, sid))
        return sid

    def delete_session(self, session_id: str):
        with self._connect() as conn:
            conn.execute('DELETE FROM sessions WHERE id=?', (session_id,))

    # ──────────────────────────── Read ─────────────────────────────────────

    def get_all_sessions(self) -> List[Dict]:
        with self._connect() as conn:
            rows = conn.execute(
                'SELECT id, title, created_at, updated_at FROM sessions ORDER BY updated_at DESC'
            ).fetchall()
        return [dict(r) for r in rows]

    def get_session(self, session_id: str) -> Optional[Dict]:
        with self._connect() as conn:
            sess = conn.execute('SELECT * FROM sessions WHERE id=?', (session_id,)).fetchone()
            if not sess:
                return None
            searches = conn.execute(
                'SELECT * FROM searches WHERE session_id=? ORDER BY timestamp ASC',
                (session_id,)
            ).fetchall()

        result = dict(sess)
        result['searches'] = []
        for s in searches:
            row = dict(s)
            try:
                row['results'] = json.loads(row['results'])
            except Exception:
                pass
            result['searches'].append(row)
        return result

    def search_history(self, query: str) -> List[Dict]:
        """Full-text search across past queries."""
        pattern = f'%{query}%'
        with self._connect() as conn:
            rows = conn.execute(
                '''SELECT s.*, ss.title as session_title
                   FROM searches s
                   JOIN sessions ss ON s.session_id = ss.id
                   WHERE s.query LIKE ? OR s.url LIKE ?
                   ORDER BY s.timestamp DESC LIMIT 20''',
                (pattern, pattern)
            ).fetchall()
        results = []
        for r in rows:
            row = dict(r)
            try:
                row['results'] = json.loads(row['results'])
            except Exception:
                pass
            results.append(row)
        return results

    def export_session_json(self, session_id: str) -> str:
        sess = self.get_session(session_id)
        return json.dumps(sess, indent=2) if sess else '{}'

    # ──────────────────────────── Utils ────────────────────────────────────

    @staticmethod
    def _now() -> str:
        return datetime.utcnow().isoformat(timespec='seconds') + 'Z'
