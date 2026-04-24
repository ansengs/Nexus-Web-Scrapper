import axios from 'axios';

// ── Change this to your backend URL (LAN IP when testing on device) ──────────
export const API_BASE = __DEV__
  ? 'http://localhost:8000'
  : 'https://your-production-server.com';

const api = axios.create({
  baseURL: API_BASE,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

// ── API calls ────────────────────────────────────────────────────────────────

export const sendSearch = async (query, sessionId = null) => {
  const { data } = await api.post('/search', { query, session_id: sessionId });
  return data;
};

export const fetchSessions = async () => {
  const { data } = await api.get('/sessions');
  return data;
};

export const fetchSession = async (sessionId) => {
  const { data } = await api.get(`/sessions/${sessionId}`);
  return data;
};

export const removeSession = async (sessionId) => {
  const { data } = await api.delete(`/sessions/${sessionId}`);
  return data;
};

export const interactWithSite = async (url, action = 'post', formData = {}) => {
  const { data } = await api.post('/interact', { url, action, data: formData });
  return data;
};

export const explainQuery = async (query) => {
  const { data } = await api.get('/nlp/explain', { params: { query } });
  return data;
};

export const proxyUrl = (url) =>
  url ? `${API_BASE}/proxy?url=${encodeURIComponent(url)}` : '';

export const proxyRaw = (url) =>
  url ? `${API_BASE}/proxy/raw?url=${encodeURIComponent(url)}` : '';
