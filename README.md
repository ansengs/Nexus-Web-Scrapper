# NEXUS SCRAPER

Intelligent full-stack web scraper with a natural-language chat interface.  
Runs as a **React Native** app on iOS, Android, and Web, powered by a **Python FastAPI** backend.

```
┌─────────────┬──────────────────────────────┬───────────────────┐
│  HISTORY    │      CHAT INTERFACE          │  LIVE PREVIEW     │
│  (Sidebar)  │  ┌─────────────────────┐     │  ┌─────────────┐  │
│             │  │ > Contact info for  │     │  │  iframe /   │  │
│  Session 1  │  │   stripe.com        │     │  │  WebView    │  │
│  Session 2  │  ├─────────────────────┤     │  │             │  │
│  Session 3  │  │ ◉ CONTACT INFO      │     │  │ stripe.com  │  │
│             │  │   emails: 2         │     │  │             │  │
│             │  │   phones: 1         │     │  └─────────────┘  │
│             │  └─────────────────────┘     │  [PUSH DATA btn]  │
│             │  [_____________________] ↑   │                   │
└─────────────┴──────────────────────────────┴───────────────────┘
```

---

## Architecture

```
nexus-scraper/
├── backend/
│   ├── main.py           ← FastAPI app (REST endpoints)
│   ├── scraper.py        ← BeautifulSoup web scraper
│   ├── nlp_processor.py  ← NLP intent classifier
│   ├── database.py       ← SQLite3 persistence layer
│   ├── requirements.txt
│   └── data/
│       └── nexus.sqlite3 ← Auto-created on first run
│
└── frontend/
    ├── App.js            ← Root entry (font loading, SafeArea)
    ├── app.json          ← Expo config
    ├── package.json
    └── src/
        ├── api/
        │   └── scraperApi.js       ← Axios API client
        ├── theme.js                ← Colors, fonts, tokens
        ├── screens/
        │   └── MainScreen.js       ← Main chat + layout
        └── components/
            ├── Sidebar.js          ← History panel
            ├── ResultsCard.js      ← Scraped data display
            └── WebPreviewPanel.js  ← Live website preview
```

---

## Backend Setup

### Requirements
- Python 3.10+

### Install & run

```bash
cd backend
pip install -r requirements.txt
python main.py
# → Server running at http://localhost:8000
# → Docs at http://localhost:8000/docs
```

### API Endpoints

| Method | Path                  | Description                          |
|--------|-----------------------|--------------------------------------|
| POST   | /search               | Main NLP → scrape → store pipeline   |
| GET    | /sessions             | List all conversation sessions       |
| GET    | /sessions/{id}        | Get a session with all searches      |
| DELETE | /sessions/{id}        | Delete a session                     |
| POST   | /interact             | Submit form data to a live website   |
| GET    | /proxy?url=…          | Proxy a website for iframe rendering |
| GET    | /nlp/explain?query=…  | Debug NLP classification             |

### Example search request

```json
POST /search
{
  "query": "Get contact information for stripe.com",
  "session_id": null
}
```

---

## Frontend Setup

### Requirements
- Node.js 18+
- Expo CLI (`npm install -g expo-cli`)

### Install

```bash
cd frontend
npm install
```

### Run

```bash
# Web (recommended for development)
npx expo start --web

# iOS simulator
npx expo start --ios

# Android emulator
npx expo start --android

# Physical device - scan QR with Expo Go app
npx expo start
```

### Configure backend URL

Edit `src/api/scraperApi.js`:

```js
export const API_BASE = __DEV__
  ? 'http://localhost:8000'        // web / simulator
  : 'https://your-server.com';    // production
```

> **Physical device tip**: Replace `localhost` with your machine's LAN IP  
> (e.g. `http://192.168.1.42:8000`) so your phone can reach the backend.

---

## Natural Language Queries

The NLP engine automatically detects intent from plain English:

| Intent      | Example queries                                            |
|-------------|------------------------------------------------------------|
| contact     | "Contact information for apple.com"                       |
| contact     | "What's the phone number for microsoft.com?"              |
| services    | "What services does stripe.com offer?"                    |
| services    | "Products from shopify.com"                               |
| history     | "History of Tesla"                                        |
| history     | "When was GitHub founded?"                                |
| description | "Describe what Vercel does"                               |
| description | "Give me a general overview of anthropic.com"             |
| general     | "anthropic.com" (bare URL — scrapes everything)           |

You can also use the **intent chip selector** in the app to force a specific mode.

---

## Features

### Smart Scraping
- **Contact**: emails (regex), phones, addresses, social media links
- **Services**: heading + paragraph extraction from services/products pages
- **History**: about/history page detection, founding statements, year extraction
- **Description**: meta tags, OG data, page content summary

### Live Preview
- Embedded website preview with address bar navigation
- **Proxy mode** (🛡️ button): routes page through backend to bypass iframe restrictions
- **Push Data** (✈️ button): submit form fields directly to the scraped site

### Persistence
- All sessions stored in SQLite3 (`backend/data/nexus.sqlite3`)
- Searchable history via `/history/search?q=…`
- Export sessions as JSON

### Cross-Platform
- **Web**: full 3-panel layout (sidebar + chat + preview)
- **Tablet**: 2-panel layout
- **Mobile**: single-column with slide-out panels

---

## Extending

### Add a new intent

1. Add patterns to `backend/nlp_processor.py → INTENT_PATTERNS`
2. Add a scraper method to `backend/scraper.py`
3. Register it in `scrape()` dispatcher
4. Add display logic in `frontend/src/components/ResultsCard.js → ResultsBody`

### Production deployment

```bash
# Backend (e.g. Railway, Render, fly.io)
pip install gunicorn
gunicorn main:app -w 4 -k uvicorn.workers.UvicornWorker

# Frontend (EAS Build for app stores)
npm install -g eas-cli
eas build --platform all
```

---

## Tech Stack

| Layer    | Technology                          |
|----------|-------------------------------------|
| Frontend | React Native · Expo · RN Web        |
| Styling  | StyleSheet · LinearGradient         |
| Fonts    | Share Tech Mono · Exo 2             |
| Backend  | Python · FastAPI · uvicorn          |
| Scraping | requests · BeautifulSoup4           |
| NLP      | Regex-based weighted classifier     |
| Storage  | SQLite3 (file-based)                |
| HTTP     | axios (frontend) · httpx (backend)  |

---

> Built with your `web_scraper.py`, `carfinder.py`, and `pydatabases.py` as the starting foundation.
