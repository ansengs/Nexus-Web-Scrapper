"""
Nexus Scraper – FastAPI backend
Run: uvicorn main:app --reload --port 8000
"""

import os
import asyncio
from functools import lru_cache
from typing import Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse
from pydantic import BaseModel, AnyHttpUrl

from scraper import WebScraper
from nlp_processor import NLPProcessor
from database import ScraperDatabase

# ─────────────────────────── App Setup ─────────────────────────────────────

app = FastAPI(
    title="Nexus Scraper API",
    description="Intelligent web scraping with NLP query processing",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH  = os.path.join(BASE_DIR, 'data', 'nexus.sqlite3')

db      = ScraperDatabase(DB_PATH)
nlp     = NLPProcessor()
scraper = WebScraper()

# ─────────────────────────── Startup ───────────────────────────────────────

@app.on_event("startup")
async def startup():
    db.initialize()
    print("✓  Database ready:", DB_PATH)

# ─────────────────────────── Models ────────────────────────────────────────

class SearchRequest(BaseModel):
    query: str
    session_id: Optional[str] = None

class InteractRequest(BaseModel):
    url: str
    action: str = "post"       # "post" | "get"
    data: dict  = {}

class DeleteSessionRequest(BaseModel):
    session_id: str

# ─────────────────────────── Routes ────────────────────────────────────────

@app.get("/")
async def root():
    return {"status": "running", "service": "Nexus Scraper API"}


@app.post("/search")
async def search(req: SearchRequest):
    """
    Process a natural-language scraping query.
    1. NLP classifies intent + extracts target + topic
    2. Target URL resolved
    3. Page scraped (single-page or multi-page crawl depending on intent)
    4. Result persisted to SQLite and returned
    """
    if not req.query.strip():
        raise HTTPException(400, "Query cannot be empty")

    # NLP processing — returns intent, target, AND topic
    intent, target, topic = nlp.process_query(req.query)

    # URL resolution (potentially slow – runs in thread pool to avoid blocking)
    loop = asyncio.get_event_loop()
    url = await loop.run_in_executor(None, scraper.resolve_url, target)

    if not url:
        raise HTTPException(
            404,
            f"Could not resolve '{target}' to a reachable URL. "
            "Try including the full domain (e.g. example.com)"
        )

    # Scrape (crawler path for 'inquiry' — may take several seconds)
    try:
        results = await loop.run_in_executor(
            None, scraper.scrape, url, intent, topic
        )
    except Exception as exc:
        raise HTTPException(502, f"Scraping error: {exc}")

    # Persist
    session_id = db.save_search(
        query=req.query,
        intent=intent,
        target=target,
        url=url,
        results=results,
        session_id=req.session_id,
    )

    return {
        "success":    True,
        "session_id": session_id,
        "intent":     intent,
        "target":     target,
        "topic":      topic,
        "url":        url,
        "results":    results,
    }


@app.get("/sessions")
async def list_sessions():
    """Return all conversation sessions, newest first."""
    return db.get_all_sessions()


@app.get("/sessions/{session_id}")
async def get_session(session_id: str):
    sess = db.get_session(session_id)
    if not sess:
        raise HTTPException(404, "Session not found")
    return sess


@app.delete("/sessions/{session_id}")
async def delete_session(session_id: str):
    db.delete_session(session_id)
    return {"deleted": session_id}


@app.get("/sessions/{session_id}/export")
async def export_session(session_id: str):
    """Download session as JSON."""
    data = db.export_session_json(session_id)
    return JSONResponse(content=data, media_type="application/json")


@app.get("/history/search")
async def history_search(q: str = Query(..., min_length=1)):
    return db.search_history(q)


@app.post("/interact")
async def interact(req: InteractRequest):
    """
    Submit form data or GET request to a live website.
    Used when the user wants to push data to a scraped site.
    """
    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(
        None, scraper.interact, req.url, req.action, req.data
    )
    if not result.get('success'):
        raise HTTPException(502, result.get('error', 'Interaction failed'))
    return result


@app.get("/proxy")
async def proxy_page(url: str = Query(...)):
    """
    Full reverse-proxy for iframe rendering.
    - Strips X-Frame-Options and Content-Security-Policy from upstream response
    - Rewrites relative asset paths using <base href>
    - Rewrites absolute links to stay within the proxy
    - Returns permissive framing headers so the iframe can render it
    """
    loop = asyncio.get_event_loop()
    html, content_type, error = await loop.run_in_executor(
        None, scraper.fetch_proxied_full, url
    )

    if error:
        # Return a simple error page that still renders in the iframe
        html = f"""<!DOCTYPE html><html><body style="
            background:#060810;color:#ff4081;font-family:monospace;
            padding:24px;font-size:13px;">
            <p>⚠ Proxy error: {error}</p>
            <p style="color:#8892b0;margin-top:8px">
              Some sites block all external requests.<br>
              Try opening it directly:
              <a href="{url}" target="_blank" style="color:#00b894">{url}</a>
            </p>
        </body></html>"""

    return HTMLResponse(
        content=html,
        headers={
            "X-Frame-Options":          "ALLOWALL",
            "Content-Security-Policy":  "default-src * 'unsafe-inline' 'unsafe-eval' data: blob:;",
            "Access-Control-Allow-Origin": "*",
            "Cache-Control":            "no-store",
        }
    )


@app.get("/proxy/raw")
async def proxy_raw(url: str = Query(...)):
    """Pass-through proxy for static assets (images, CSS, JS) needed by the iframe."""
    loop = asyncio.get_event_loop()
    try:
        r = await loop.run_in_executor(
            None,
            lambda: scraper.session.get(url, timeout=8, stream=False,
                                        headers={"Referer": url})
        )
        from fastapi.responses import Response
        ct = r.headers.get("content-type", "application/octet-stream")
        # Strip framing headers from assets too
        headers = {
            "Content-Type":             ct,
            "X-Frame-Options":          "ALLOWALL",
            "Content-Security-Policy":  "",
            "Access-Control-Allow-Origin": "*",
            "Cache-Control":            "public, max-age=3600",
        }
        return Response(content=r.content, headers=headers)
    except Exception as e:
        from fastapi.responses import Response
        return Response(status_code=502, content=str(e))


@app.get("/nlp/explain")
async def nlp_explain(query: str = Query(...)):
    """Debug NLP classification for a given query string."""
    return nlp.explain(query)


# ─────────────────────────── Dev entry ─────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
