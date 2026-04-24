import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, TextInput, StyleSheet,
  Platform, ActivityIndicator, ScrollView,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, spacing, radius } from '../theme';
import { API_BASE, interactWithSite } from '../api/scraperApi';

// ─── Proxy URL builder ──────────────────────────────────────────────────────
const proxyUrl   = (url) => url ? `${API_BASE}/proxy?url=${encodeURIComponent(url)}`     : '';
const proxyRaw   = (url) => url ? `${API_BASE}/proxy/raw?url=${encodeURIComponent(url)}` : '';

// ─── Interaction Panel ─────────────────────────────────────────────────────
function InteractPanel({ url, onClose }) {
  const [action, setAction]   = useState('post');
  const [fields, setFields]   = useState([{ key: '', value: '' }]);
  const [loading, setLoading] = useState(false);
  const [result, setResult]   = useState(null);

  const addField = () => setFields(f => [...f, { key: '', value: '' }]);
  const updateField = (i, prop, val) =>
    setFields(f => f.map((item, idx) => idx === i ? { ...item, [prop]: val } : item));

  const submit = async () => {
    setLoading(true);
    const data = {};
    fields.forEach(({ key, value }) => { if (key) data[key] = value; });
    try {
      const res = await interactWithSite(url, action, data);
      setResult(res);
    } catch (e) {
      setResult({ success: false, error: e.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={s.interPanel}>
      <View style={s.interHeader}>
        <Text style={s.interTitle}>PUSH DATA TO SITE</Text>
        <TouchableOpacity onPress={onClose}>
          <Ionicons name="close" size={16} color={colors.textMuted} />
        </TouchableOpacity>
      </View>
      <Text style={s.interUrl} numberOfLines={1}>{url}</Text>
      <View style={s.actionRow}>
        {['post', 'get'].map(a => (
          <TouchableOpacity key={a}
            style={[s.actionBtn, action === a && s.actionBtnActive]}
            onPress={() => setAction(a)}>
            <Text style={[s.actionBtnText, action === a && s.actionBtnTextActive]}>
              {a.toUpperCase()}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      {fields.map((field, i) => (
        <View key={i} style={s.fieldRow}>
          <TextInput style={[s.textInput, { flex: 1 }]} placeholder="field"
            placeholderTextColor={colors.textMuted} value={field.key}
            onChangeText={v => updateField(i, 'key', v)} />
          <TextInput style={[s.textInput, { flex: 2 }]} placeholder="value"
            placeholderTextColor={colors.textMuted} value={field.value}
            onChangeText={v => updateField(i, 'value', v)} />
        </View>
      ))}
      <TouchableOpacity style={s.addFieldBtn} onPress={addField}>
        <Ionicons name="add" size={13} color={colors.textMuted} />
        <Text style={s.addFieldText}>Add field</Text>
      </TouchableOpacity>
      <TouchableOpacity style={s.submitBtn} onPress={submit} disabled={loading}>
        {loading
          ? <ActivityIndicator color="#fff" size="small" />
          : <Text style={s.submitText}>SEND REQUEST</Text>}
      </TouchableOpacity>
      {result && (
        <View style={[s.resultBox, { borderColor: result.success ? colors.success : colors.error }]}>
          <Text style={[s.resultText, { color: result.success ? colors.success : colors.error }]}>
            {result.success ? `\u2713 Status ${result.status_code}` : `\u2717 ${result.error}`}
          </Text>
        </View>
      )}
    </View>
  );
}

// ─── Web-platform iframe component ─────────────────────────────────────────
function WebIframe({ src, onLoad, onNavigate }) {
  const iframeRef = useRef(null);

  useEffect(() => {
    // Listen for navigation messages from the injected proxy script
    const handler = (e) => {
      if (e.data && e.data.type === 'NEXUS_NAV') {
        onNavigate && onNavigate(e.data.url);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [onNavigate]);

  return (
    <iframe
      ref={iframeRef}
      src={src}
      onLoad={onLoad}
      style={{
        width:  '100%',
        height: '100%',
        border: 'none',
        display: 'block',
        backgroundColor: colors.bg,
      }}
      sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
      referrerPolicy="no-referrer"
      title="Nexus Web Preview"
    />
  );
}

// ─── Main Panel ─────────────────────────────────────────────────────────────
export default function WebPreviewPanel({ url, onClose, visible }) {
  const [isLoading, setIsLoading]         = useState(false);
  const [addressBar, setAddressBar]       = useState('');
  const [currentUrl, setCurrentUrl]       = useState('');
  const [showInteract, setShowInteract]   = useState(false);
  const [useProxy, setUseProxy]           = useState(true);   // proxy ON by default
  const [loadError, setLoadError]         = useState(null);
  const webviewRef = useRef(null);

  // When a new URL is passed from outside (clicking PREVIEW on a result card)
  useEffect(() => {
    if (url && url !== currentUrl) {
      setCurrentUrl(url);
      setAddressBar(url);
      setIsLoading(true);
      setLoadError(null);
    }
  }, [url]);

  if (!visible) return null;

  // The URL actually loaded into the iframe/WebView
  const displayUrl = useProxy ? proxyUrl(currentUrl) : currentUrl;

  const navigateTo = (rawUrl) => {
    let nav = rawUrl.trim();
    if (!nav) return;
    if (!nav.startsWith('http')) nav = 'https://' + nav;
    setCurrentUrl(nav);
    setAddressBar(nav);
    setIsLoading(true);
    setLoadError(null);
  };

  const onAddressSubmit = () => navigateTo(addressBar);

  return (
    <View style={s.panel}>
      {/* ── Header ────────────────────────────────────────────────── */}
      <View style={s.header}>
        <View style={s.headerDot} />
        <Text style={s.headerTitle}>LIVE PREVIEW</Text>
        <View style={{ flex: 1 }} />

        {/* Proxy toggle */}
        <TouchableOpacity
          style={[s.headerBtn, useProxy && s.headerBtnActive]}
          onPress={() => { setUseProxy(p => !p); setIsLoading(true); }}
        >
          <Ionicons name="shield-checkmark-outline" size={14}
            color={useProxy ? colors.accentTeal : colors.textMuted} />
          <Text style={[s.headerBtnLabel, useProxy && { color: colors.accentTeal }]}>
            {useProxy ? 'PROXY' : 'DIRECT'}
          </Text>
        </TouchableOpacity>

        {/* Interact toggle */}
        <TouchableOpacity
          style={[s.headerBtn, showInteract && s.headerBtnViolet]}
          onPress={() => setShowInteract(v => !v)}
        >
          <Ionicons name="send-outline" size={14}
            color={showInteract ? colors.accentViolet : colors.textMuted} />
        </TouchableOpacity>

        {/* Close */}
        <TouchableOpacity style={s.headerBtn} onPress={onClose}>
          <Ionicons name="close" size={16} color={colors.textMuted} />
        </TouchableOpacity>
      </View>

      {/* ── Address bar ────────────────────────────────────────────── */}
      <View style={s.addressBar}>
        <Ionicons name={useProxy ? 'shield-checkmark' : 'lock-closed-outline'}
          size={11} color={useProxy ? colors.accentTeal : colors.textMuted} />
        <TextInput
          style={s.addressInput}
          value={addressBar}
          onChangeText={setAddressBar}
          onSubmitEditing={onAddressSubmit}
          returnKeyType="go"
          autoCapitalize="none"
          autoCorrect={false}
          selectTextOnFocus
          placeholder="Enter URL to preview..."
          placeholderTextColor={colors.textMuted}
        />
        <TouchableOpacity style={s.goBtn} onPress={onAddressSubmit}>
          <Ionicons name="arrow-forward" size={13} color={colors.accentTeal} />
        </TouchableOpacity>
      </View>

      {/* ── Interact Panel ─────────────────────────────────────────── */}
      {showInteract && (
        <InteractPanel url={currentUrl} onClose={() => setShowInteract(false)} />
      )}

      {/* ── No URL state ───────────────────────────────────────────── */}
      {!currentUrl ? (
        <View style={s.emptyView}>
          <Ionicons name="browsers-outline" size={36} color={colors.textMuted} />
          <Text style={s.emptyTitle}>No URL loaded</Text>
          <Text style={s.emptySubtitle}>
            Click PREVIEW on a result card{'\n'}or type a URL above
          </Text>
        </View>
      ) : (
        <View style={s.viewerContainer}>
          {/* Loading overlay */}
          {isLoading && (
            <View style={s.loadingOverlay}>
              <ActivityIndicator color={colors.accentTeal} size="large" />
              <Text style={s.loadingText}>LOADING</Text>
              <Text style={s.loadingUrl} numberOfLines={1}>{currentUrl}</Text>
            </View>
          )}

          {/* Error overlay */}
          {loadError && !isLoading && (
            <View style={s.errorOverlay}>
              <Ionicons name="warning-outline" size={28} color={colors.error} />
              <Text style={s.errorText}>{loadError}</Text>
              <TouchableOpacity style={s.retryBtn}
                onPress={() => { setLoadError(null); setIsLoading(true); }}>
                <Text style={s.retryBtnText}>RETRY</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Web: iframe via proxy */}
          {Platform.OS === 'web' ? (
            <WebIframe
              src={displayUrl}
              onLoad={() => setIsLoading(false)}
              onNavigate={(newUrl) => {
                // Proxied link clicked inside iframe — update address bar
                setAddressBar(newUrl);
                setCurrentUrl(newUrl);
                setIsLoading(true);
              }}
            />
          ) : (
            /* Native: react-native-webview */
            <WebView
              ref={webviewRef}
              source={{ uri: displayUrl }}
              style={s.webview}
              onLoadStart={() => { setIsLoading(true); setLoadError(null); }}
              onLoadEnd={() => setIsLoading(false)}
              onError={(e) => {
                setIsLoading(false);
                setLoadError(e.nativeEvent.description || 'Failed to load page');
              }}
              onNavigationStateChange={(state) => {
                if (state.url && !state.url.startsWith(API_BASE)) {
                  setAddressBar(state.url);
                }
              }}
              javaScriptEnabled
              domStorageEnabled
              allowsInlineMediaPlayback
              mixedContentMode="always"
              originWhitelist={['*']}
            />
          )}
        </View>
      )}
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  panel: {
    flex: 1,
    backgroundColor: colors.bg,
    borderLeftWidth: 1,
    borderLeftColor: colors.border,
    minWidth: 300,
    display: 'flex',
    flexDirection: 'column',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.bgSidebar,
    gap: 4,
  },
  headerDot: {
    width: 6, height: 6, borderRadius: 3,
    backgroundColor: colors.accentTeal,
    marginRight: 4,
  },
  headerTitle: {
    fontFamily: fonts.uiBold, fontSize: 11,
    color: colors.accentTeal, letterSpacing: 2,
  },
  headerBtn: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 7, paddingVertical: 5,
    borderRadius: radius.sm, gap: 4,
  },
  headerBtnActive: { backgroundColor: 'rgba(0,184,148,0.1)' },
  headerBtnViolet: { backgroundColor: 'rgba(108,92,231,0.1)' },
  headerBtnLabel: {
    fontFamily: fonts.mono, fontSize: 9,
    color: colors.textMuted, letterSpacing: 1,
  },
  addressBar: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.md, paddingVertical: 5,
    borderBottomWidth: 1, borderBottomColor: colors.border,
    backgroundColor: colors.bgCard, gap: 7,
  },
  addressInput: {
    flex: 1, fontFamily: fonts.mono, fontSize: 12,
    color: colors.textPrimary, paddingVertical: 5,
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {}),
  },
  goBtn: { padding: 4 },
  viewerContainer: { flex: 1, position: 'relative', overflow: 'hidden' },
  webview: { flex: 1, backgroundColor: colors.bg },

  // Loading
  loadingOverlay: {
    ...Platform.select({ web: { position: 'absolute', inset: 0 },
                         default: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}),
    backgroundColor: 'rgba(6,8,16,0.92)',
    alignItems: 'center', justifyContent: 'center',
    gap: 10, zIndex: 20,
  },
  loadingText: {
    fontFamily: fonts.mono, fontSize: 11,
    color: colors.accentTeal, letterSpacing: 3,
  },
  loadingUrl: {
    fontFamily: fonts.mono, fontSize: 10, color: colors.textMuted,
    maxWidth: 260, textAlign: 'center',
  },

  // Error
  errorOverlay: {
    ...Platform.select({ web: { position: 'absolute', inset: 0 },
                         default: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}),
    backgroundColor: colors.bg,
    alignItems: 'center', justifyContent: 'center',
    gap: 12, padding: 32, zIndex: 20,
  },
  errorText: {
    fontFamily: fonts.ui, fontSize: 13, color: colors.textSecondary,
    textAlign: 'center', lineHeight: 20,
  },
  retryBtn: {
    paddingHorizontal: 16, paddingVertical: 7,
    borderWidth: 1, borderColor: colors.accentTeal, borderRadius: radius.sm,
    marginTop: 4,
  },
  retryBtnText: {
    fontFamily: fonts.mono, fontSize: 11, color: colors.accentTeal, letterSpacing: 1,
  },

  // Empty state
  emptyView: {
    flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 32,
  },
  emptyTitle: {
    fontFamily: fonts.uiBold, fontSize: 14, color: colors.textSecondary,
  },
  emptySubtitle: {
    fontFamily: fonts.ui, fontSize: 12, color: colors.textMuted,
    textAlign: 'center', lineHeight: 19,
  },

  // Interact panel
  interPanel: {
    backgroundColor: colors.bgCard, borderBottomWidth: 1,
    borderBottomColor: colors.border, padding: spacing.md, gap: spacing.sm,
  },
  interHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  interTitle: { fontFamily: fonts.uiBold, fontSize: 10, color: colors.accentViolet, letterSpacing: 1.5 },
  interUrl: { fontFamily: fonts.mono, fontSize: 10, color: colors.textMuted },
  actionRow: { flexDirection: 'row', gap: 6 },
  actionBtn: { paddingHorizontal: 12, paddingVertical: 4, borderWidth: 1,
    borderColor: colors.border, borderRadius: radius.sm },
  actionBtnActive: { borderColor: colors.accentViolet, backgroundColor: 'rgba(108,92,231,0.12)' },
  actionBtnText: { fontFamily: fonts.mono, fontSize: 11, color: colors.textMuted },
  actionBtnTextActive: { color: colors.accentViolet },
  fieldRow: { flexDirection: 'row', gap: 6 },
  textInput: {
    backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 6,
    fontFamily: fonts.mono, fontSize: 12, color: colors.textPrimary,
  },
  addFieldBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  addFieldText: { fontFamily: fonts.ui, fontSize: 12, color: colors.textMuted },
  submitBtn: { backgroundColor: colors.accentViolet, borderRadius: radius.sm,
    paddingVertical: 8, alignItems: 'center' },
  submitText: { fontFamily: fonts.uiBold, fontSize: 11, color: '#fff', letterSpacing: 1 },
  resultBox: { padding: spacing.sm, borderWidth: 1, borderRadius: radius.sm },
  resultText: { fontFamily: fonts.mono, fontSize: 11 },
});
