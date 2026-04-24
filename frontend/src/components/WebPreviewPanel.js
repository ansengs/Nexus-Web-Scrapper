import React, { useState, useRef } from 'react';
import {
  View, Text, TouchableOpacity, TextInput, StyleSheet,
  Platform, ActivityIndicator,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, spacing, radius } from '../theme';
import { proxyUrl, interactWithSite } from '../api/scraperApi';

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

export default function WebPreviewPanel({ url, onClose, visible }) {
  const [isLoading, setIsLoading]       = useState(true);
  const [addressBar, setAddressBar]     = useState(url || '');
  const [currentUrl, setCurrentUrl]     = useState(url || '');
  const [showInteract, setShowInteract] = useState(false);
  const [useProxy, setUseProxy]         = useState(false);
  const webviewRef = useRef(null);

  React.useEffect(() => {
    if (url) { setCurrentUrl(url); setAddressBar(url); setIsLoading(true); }
  }, [url]);

  if (!visible) return null;

  const displayUrl = useProxy ? proxyUrl(currentUrl) : currentUrl;

  const navigate = () => {
    let nav = addressBar.trim();
    if (nav && !nav.startsWith('http')) nav = 'https://' + nav;
    if (nav !== currentUrl) { setCurrentUrl(nav); setIsLoading(true); }
    else webviewRef.current?.reload?.();
  };

  return (
    <View style={s.panel}>
      <View style={s.header}>
        <View style={s.headerDot} />
        <Text style={s.headerTitle}>LIVE PREVIEW</Text>
        <View style={{ flex: 1 }} />
        <TouchableOpacity style={[s.iconBtn, useProxy && s.iconBtnActive]}
          onPress={() => setUseProxy(p => !p)}>
          <Ionicons name="shield-checkmark-outline" size={15}
            color={useProxy ? colors.accentTeal : colors.textMuted} />
        </TouchableOpacity>
        <TouchableOpacity style={[s.iconBtn, showInteract && s.iconBtnActive]}
          onPress={() => setShowInteract(v => !v)}>
          <Ionicons name="send-outline" size={15}
            color={showInteract ? colors.accentViolet : colors.textMuted} />
        </TouchableOpacity>
        <TouchableOpacity style={s.iconBtn} onPress={onClose}>
          <Ionicons name="close" size={17} color={colors.textMuted} />
        </TouchableOpacity>
      </View>

      <View style={s.addressBar}>
        <Ionicons name="lock-closed-outline" size={11} color={colors.textMuted} />
        <TextInput style={s.addressInput} value={addressBar}
          onChangeText={setAddressBar} onSubmitEditing={navigate}
          returnKeyType="go" autoCapitalize="none" autoCorrect={false}
          placeholder="https://..." placeholderTextColor={colors.textMuted} />
        <TouchableOpacity onPress={navigate}>
          <Ionicons name="arrow-forward" size={14} color={colors.accentTeal} />
        </TouchableOpacity>
      </View>

      {showInteract && <InteractPanel url={currentUrl} onClose={() => setShowInteract(false)} />}

      <View style={s.viewerContainer}>
        {isLoading && (
          <View style={s.loadingOverlay}>
            <ActivityIndicator color={colors.accentTeal} />
            <Text style={s.loadingText}>LOADING...</Text>
          </View>
        )}
        {currentUrl ? (
          <WebView ref={webviewRef} source={{ uri: displayUrl }} style={s.webview}
            onLoadStart={() => setIsLoading(true)} onLoadEnd={() => setIsLoading(false)}
            onNavigationStateChange={state => { if (state.url) setAddressBar(state.url); }}
            javaScriptEnabled domStorageEnabled />
        ) : (
          <View style={s.emptyView}>
            <Ionicons name="globe-outline" size={32} color={colors.textMuted} />
            <Text style={s.emptyText}>No URL loaded</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  panel: { flex: 1, backgroundColor: colors.bg, borderLeftWidth: 1,
    borderLeftColor: colors.border, minWidth: 300 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md,
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border,
    backgroundColor: colors.bgSidebar, gap: 6 },
  headerDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.accentTeal },
  headerTitle: { fontFamily: fonts.uiBold, fontSize: 11, color: colors.accentTeal, letterSpacing: 2 },
  iconBtn: { padding: 6, borderRadius: radius.sm },
  iconBtnActive: { backgroundColor: 'rgba(0,184,148,0.1)' },
  addressBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md,
    paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.border,
    backgroundColor: colors.bgCard, gap: 8 },
  addressInput: { flex: 1, fontFamily: fonts.mono, fontSize: 12,
    color: colors.textPrimary, paddingVertical: 4 },
  viewerContainer: { flex: 1, position: 'relative' },
  webview: { flex: 1, backgroundColor: colors.bg },
  loadingOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(6,8,16,0.85)', alignItems: 'center',
    justifyContent: 'center', gap: 12, zIndex: 10 },
  loadingText: { fontFamily: fonts.mono, fontSize: 11, color: colors.accentTeal, letterSpacing: 2 },
  emptyView: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  emptyText: { fontFamily: fonts.mono, fontSize: 12, color: colors.textMuted },
  interPanel: { backgroundColor: colors.bgCard, borderBottomWidth: 1,
    borderBottomColor: colors.border, padding: spacing.md, gap: spacing.sm },
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
  textInput: { backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 6,
    fontFamily: fonts.mono, fontSize: 12, color: colors.textPrimary },
  addFieldBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  addFieldText: { fontFamily: fonts.ui, fontSize: 12, color: colors.textMuted },
  submitBtn: { backgroundColor: colors.accentViolet, borderRadius: radius.sm,
    paddingVertical: 8, alignItems: 'center' },
  submitText: { fontFamily: fonts.uiBold, fontSize: 11, color: '#fff', letterSpacing: 1 },
  resultBox: { padding: spacing.sm, borderWidth: 1, borderRadius: radius.sm },
  resultText: { fontFamily: fonts.mono, fontSize: 11 },
});
