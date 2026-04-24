import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, Platform, Dimensions, Animated, Keyboard,
  KeyboardAvoidingView, ActivityIndicator, useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, fonts, spacing, radius } from '../theme';
import { sendSearch, fetchSession } from '../api/scraperApi';
import ResultsCard from '../components/ResultsCard';
import WebPreviewPanel from '../components/WebPreviewPanel';
import Sidebar from '../components/Sidebar';

// ─────────────────────────── Message Types ─────────────────────────────────

function TypingIndicator() {
  const dots = [useRef(new Animated.Value(0)).current,
                useRef(new Animated.Value(0)).current,
                useRef(new Animated.Value(0)).current];

  useEffect(() => {
    const anims = dots.map((dot, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 150),
          Animated.timing(dot, { toValue: 1, duration: 400, useNativeDriver: true }),
          Animated.timing(dot, { toValue: 0, duration: 400, useNativeDriver: true }),
        ])
      )
    );
    anims.forEach(a => a.start());
    return () => anims.forEach(a => a.stop());
  }, []);

  return (
    <View style={[msgStyles.bubble, msgStyles.botBubble, { flexDirection: 'row', gap: 6, paddingVertical: 16, paddingHorizontal: 18 }]}>
      {dots.map((dot, i) => (
        <Animated.View
          key={i}
          style={[msgStyles.typingDot, { opacity: dot, transform: [{ translateY: dot.interpolate({ inputRange: [0, 1], outputRange: [0, -4] }) }] }]}
        />
      ))}
    </View>
  );
}

function UserMessage({ text, timestamp }) {
  return (
    <View style={msgStyles.userRow}>
      <View>
        <LinearGradient
          colors={['#1e3a6e', '#131a3e']}
          style={msgStyles.userBubble}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        >
          <Text style={msgStyles.userText}>{text}</Text>
        </LinearGradient>
        <Text style={msgStyles.timestamp}>{formatTime(timestamp)}</Text>
      </View>
    </View>
  );
}

function BotMessage({ message, onPreviewPress }) {
  if (message.type === 'typing') return <TypingIndicator />;

  if (message.type === 'error') {
    return (
      <View style={[msgStyles.botBubble, msgStyles.errorBubble]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Ionicons name="warning-outline" size={15} color={colors.error} />
          <Text style={msgStyles.errorText}>{message.text}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={msgStyles.botRow}>
      <View style={msgStyles.botAvatar}>
        <Text style={msgStyles.botAvatarText}>N</Text>
      </View>
      <View style={{ flex: 1 }}>
        <View style={msgStyles.botBubble}>
          {message.text ? (
            <Text style={msgStyles.botText}>{message.text}</Text>
          ) : null}
          {message.results && message.intent && (
            <ResultsCard
              results={message.results}
              url={message.url}
              intent={message.intent}
              onPreviewPress={() => onPreviewPress(message.url)}
            />
          )}
        </View>
        <Text style={msgStyles.timestamp}>{formatTime(message.timestamp)}</Text>
      </View>
    </View>
  );
}

function formatTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

// ─────────────────────────── Intent Selector ───────────────────────────────

const INTENTS = [
  { key: 'auto',        label: 'Auto',        icon: 'sparkles-outline',      color: '#00f5d4' },
  { key: 'contact',     label: 'Contact',     icon: 'call-outline',          color: '#00e676' },
  { key: 'services',    label: 'Services',    icon: 'briefcase-outline',     color: '#4a90e2' },
  { key: 'history',     label: 'History',     icon: 'time-outline',          color: '#b78bff' },
  { key: 'description', label: 'Description', icon: 'document-text-outline', color: '#ffab40' },
];

function IntentPicker({ selected, onChange }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={pickerStyles.row}
    >
      {INTENTS.map(item => {
        const active = selected === item.key;
        return (
          <TouchableOpacity
            key={item.key}
            style={[pickerStyles.chip, active && { borderColor: item.color, backgroundColor: item.color + '18' }]}
            onPress={() => onChange(item.key)}
          >
            <Ionicons name={item.icon} size={11} color={active ? item.color : colors.textMuted} />
            <Text style={[pickerStyles.chipText, active && { color: item.color }]}>{item.label}</Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

// ─────────────────────────── Main Screen ───────────────────────────────────

export default function MainScreen() {
  const insets  = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isWide  = width >= 768;
  const isXWide = width >= 1200;

  const [messages, setMessages]     = useState([]);
  const [inputText, setInputText]   = useState('');
  const [loading, setLoading]       = useState(false);
  const [sessionId, setSessionId]   = useState(null);
  const [intent, setIntent]         = useState('auto');
  const [previewUrl, setPreviewUrl] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(isWide);
  const [showPreview, setShowPreview] = useState(false);

  const scrollRef = useRef(null);

  // Auto-open sidebar on wide screens
  useEffect(() => { setSidebarOpen(isWide); }, [isWide]);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  }, []);

  useEffect(() => { scrollToBottom(); }, [messages]);

  // Load existing session
  const loadSession = useCallback(async (sid) => {
    if (!sid) {
      setMessages([]);
      setSessionId(null);
      return;
    }
    try {
      const session = await fetchSession(sid);
      setSessionId(sid);
      const msgs = [];
      for (const s of session.searches) {
        msgs.push({ id: `u-${s.id}`, role: 'user', text: s.query, timestamp: s.timestamp });
        msgs.push({
          id: `b-${s.id}`, role: 'bot',
          text: `→ ${s.intent.toUpperCase()} query resolved to ${s.url}`,
          results: s.results, url: s.url, intent: s.intent,
          timestamp: s.timestamp,
        });
      }
      setMessages(msgs);
    } catch (e) {
      console.warn('Load session error:', e);
    }
  }, []);

  const submit = useCallback(async () => {
    const q = inputText.trim();
    if (!q || loading) return;

    setInputText('');
    Keyboard.dismiss();

    const ts = new Date().toISOString();
    const userMsg = { id: `u-${ts}`, role: 'user', text: q, timestamp: ts };
    const typingMsg = { id: 'typing', role: 'bot', type: 'typing' };

    setMessages(prev => [...prev, userMsg, typingMsg]);
    setLoading(true);

    try {
      // Optionally inject intent into query
      let query = q;
      if (intent !== 'auto') {
        const prefixes = {
          contact:     'Get contact information for',
          services:    'What services does',
          history:     'Tell me the history of',
          description: 'Describe',
        };
        if (prefixes[intent] && !q.toLowerCase().includes(intent)) {
          query = `${prefixes[intent]} ${q}`;
        }
      }

      const data = await sendSearch(query, sessionId);

      const botMsg = {
        id: `b-${ts}`, role: 'bot',
        text: `→ ${data.intent.toUpperCase()} · ${data.target}`,
        results: data.results, url: data.url, intent: data.intent,
        timestamp: new Date().toISOString(),
      };

      setSessionId(data.session_id);
      setMessages(prev => prev.filter(m => m.id !== 'typing').concat(botMsg));
    } catch (err) {
      const msg = err.response?.data?.detail || err.message || 'Request failed';
      const errMsg = {
        id: `err-${ts}`, role: 'bot', type: 'error',
        text: msg, timestamp: new Date().toISOString(),
      };
      setMessages(prev => prev.filter(m => m.id !== 'typing').concat(errMsg));
    } finally {
      setLoading(false);
    }
  }, [inputText, loading, sessionId, intent]);

  const openPreview = (url) => {
    setPreviewUrl(url);
    setShowPreview(true);
  };

  const QUICK_PROMPTS = [
    'Contact info for apple.com',
    'Services offered by stripe.com',
    'History of tesla.com',
    'Describe what vercel.com does',
  ];

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* ── Sidebar ─────────────────────────────────────────────────── */}
      {sidebarOpen && (
        <Sidebar
          activeSessionId={sessionId}
          onSelectSession={loadSession}
          onNewSession={() => { setMessages([]); setSessionId(null); }}
          visible={true}
        />
      )}

      {/* ── Main Column ─────────────────────────────────────────────── */}
      <View style={{ flex: 1, flexDirection: isXWide && showPreview ? 'row' : 'column' }}>
        {/* Chat Area */}
        <View style={{ flex: 1 }}>
          {/* Top Bar */}
          <View style={styles.topBar}>
            <TouchableOpacity
              onPress={() => setSidebarOpen(s => !s)}
              style={styles.topBarBtn}
            >
              <Ionicons name={sidebarOpen ? 'menu' : 'menu'} size={20} color={colors.textSecondary} />
            </TouchableOpacity>

            <View style={styles.topBarCenter}>
              <View style={styles.statusDot} />
              <Text style={styles.topBarTitle}>NEXUS SCRAPER</Text>
            </View>

            <TouchableOpacity
              style={[styles.topBarBtn, showPreview && styles.topBarBtnActive]}
              onPress={() => setShowPreview(s => !s)}
            >
              <Ionicons name="browsers-outline" size={18}
                color={showPreview ? colors.accentTeal : colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Intent Picker */}
          <View style={styles.intentBar}>
            <IntentPicker selected={intent} onChange={setIntent} />
          </View>

          {/* Messages */}
          <ScrollView
            ref={scrollRef}
            style={styles.messageList}
            contentContainerStyle={styles.messageContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {messages.length === 0 ? (
              <View style={styles.emptyState}>
                {/* Splash */}
                <View style={styles.splashLogo}>
                  <View style={styles.splashRing}>
                    <Ionicons name="globe-outline" size={32} color={colors.accentTeal} />
                  </View>
                </View>
                <Text style={styles.splashTitle}>NEXUS SCRAPER</Text>
                <Text style={styles.splashSub}>
                  Intelligent web scraping with natural language queries.{'\n'}
                  Ask about contact info, services, history, or anything else.
                </Text>
                <Text style={styles.splashHint}>TRY THESE QUERIES</Text>
                <View style={styles.quickPrompts}>
                  {QUICK_PROMPTS.map((p, i) => (
                    <TouchableOpacity
                      key={i}
                      style={styles.quickPromptBtn}
                      onPress={() => setInputText(p)}
                    >
                      <Ionicons name="arrow-forward-outline" size={11} color={colors.accentTeal} />
                      <Text style={styles.quickPromptText}>{p}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            ) : (
              messages.map(msg =>
                msg.role === 'user'
                  ? <UserMessage key={msg.id} text={msg.text} timestamp={msg.timestamp} />
                  : <BotMessage key={msg.id} message={msg} onPreviewPress={openPreview} />
              )
            )}
          </ScrollView>

          {/* Input Bar */}
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={insets.bottom + 60}
          >
            <View style={[styles.inputContainer, { paddingBottom: insets.bottom || spacing.md }]}>
              <View style={styles.inputRow}>
                <TextInput
                  style={styles.input}
                  value={inputText}
                  onChangeText={setInputText}
                  placeholder={`Search... (e.g. "contact info for stripe.com")`}
                  placeholderTextColor={colors.textMuted}
                  multiline
                  maxLength={500}
                  onSubmitEditing={Platform.OS === 'web' ? submit : undefined}
                  blurOnSubmit={false}
                  returnKeyType="send"
                />
                <TouchableOpacity
                  style={[styles.sendBtn, (!inputText.trim() || loading) && styles.sendBtnDisabled]}
                  onPress={submit}
                  disabled={!inputText.trim() || loading}
                >
                  {loading
                    ? <ActivityIndicator color={colors.bg} size="small" />
                    : <Ionicons name="arrow-up" size={18} color={colors.bg} />
                  }
                </TouchableOpacity>
              </View>
              <Text style={styles.inputFooter}>
                Press ↵ to search · Backend at localhost:8000
              </Text>
            </View>
          </KeyboardAvoidingView>
        </View>

        {/* ── Web Preview (right panel or modal) ──────────────────── */}
        {showPreview && (
          isXWide ? (
            <WebPreviewPanel
              url={previewUrl}
              visible={true}
              onClose={() => setShowPreview(false)}
            />
          ) : (
            <View style={StyleSheet.absoluteFill}>
              <WebPreviewPanel
                url={previewUrl}
                visible={true}
                onClose={() => setShowPreview(false)}
              />
            </View>
          )
        )}
      </View>
    </View>
  );
}

// ─────────────────────────── Styles ────────────────────────────────────────

const msgStyles = StyleSheet.create({
  userRow: {
    alignItems: 'flex-end',
    marginVertical: 6,
    paddingHorizontal: spacing.lg,
  },
  userBubble: {
    maxWidth: '80%',
    borderRadius: radius.lg,
    borderBottomRightRadius: radius.sm,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: 'rgba(74,144,226,0.3)',
  },
  userText: {
    fontFamily: fonts.ui,
    fontSize: 14,
    color: colors.textPrimary,
    lineHeight: 20,
  },
  botRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginVertical: 6,
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  botAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.accentTeal + '20',
    borderWidth: 1,
    borderColor: colors.accentTeal + '66',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: 2,
  },
  botAvatarText: {
    fontFamily: fonts.uiBold,
    fontSize: 13,
    color: colors.accentTeal,
  },
  botBubble: {
    flex: 1,
    backgroundColor: '#0b0e1e',
    borderRadius: radius.lg,
    borderTopLeftRadius: radius.sm,
    borderWidth: 1,
    borderColor: '#1a2040',
    padding: spacing.md,
  },
  botText: {
    fontFamily: fonts.mono,
    fontSize: 12,
    color: colors.accentTeal,
    marginBottom: 6,
  },
  errorBubble: {
    borderColor: colors.error + '44',
    backgroundColor: 'rgba(255,64,129,0.06)',
    margin: spacing.lg,
    borderRadius: radius.md,
  },
  errorText: {
    fontFamily: fonts.mono,
    fontSize: 12,
    color: colors.error,
    flex: 1,
  },
  typingDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.accentTeal,
  },
  timestamp: {
    fontFamily: fonts.mono,
    fontSize: 10,
    color: colors.textMuted,
    marginTop: 3,
    textAlign: 'right',
  },
});

const pickerStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
    gap: spacing.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 100,
  },
  chipText: {
    fontFamily: fonts.uiBold,
    fontSize: 11,
    color: colors.textMuted,
    letterSpacing: 0.5,
  },
});

const styles = StyleSheet.create({
  root: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: colors.bg,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1f35',
    backgroundColor: '#080a14',
  },
  topBarBtn: {
    padding: 8,
    borderRadius: radius.sm,
  },
  topBarBtnActive: {
    backgroundColor: 'rgba(0,245,212,0.1)',
  },
  topBarCenter: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.success,
    ...(Platform.OS === 'web' ? { boxShadow: '0 0 6px #00e676' } : {}),
  },
  topBarTitle: {
    fontFamily: fonts.uiBold,
    fontSize: 13,
    color: colors.textPrimary,
    letterSpacing: 3,
  },
  intentBar: {
    borderBottomWidth: 1,
    borderBottomColor: '#1a1f35',
    backgroundColor: '#080a14',
  },
  messageList: {
    flex: 1,
  },
  messageContent: {
    paddingVertical: spacing.lg,
    flexGrow: 1,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingTop: 60,
    gap: 12,
  },
  splashLogo: {
    marginBottom: 8,
  },
  splashRing: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 1,
    borderColor: colors.accentTeal + '44',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,245,212,0.06)',
    ...(Platform.OS === 'web' ? { boxShadow: '0 0 24px rgba(0,245,212,0.15)' } : {}),
  },
  splashTitle: {
    fontFamily: fonts.uiBold,
    fontSize: 22,
    color: colors.accentTeal,
    letterSpacing: 5,
    ...(Platform.OS === 'web' ? { textShadow: '0 0 20px #00f5d4' } : {}),
  },
  splashSub: {
    fontFamily: fonts.ui,
    fontSize: 13,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 380,
  },
  splashHint: {
    fontFamily: fonts.uiBold,
    fontSize: 10,
    color: colors.textMuted,
    letterSpacing: 2,
    marginTop: spacing.lg,
  },
  quickPrompts: {
    gap: 8,
    width: '100%',
    maxWidth: 440,
  },
  quickPromptBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: '#0b0e1e',
    borderWidth: 1,
    borderColor: '#1a2040',
    borderRadius: radius.md,
  },
  quickPromptText: {
    fontFamily: fonts.ui,
    fontSize: 13,
    color: colors.textSecondary,
  },
  inputContainer: {
    backgroundColor: '#080a14',
    borderTopWidth: 1,
    borderTopColor: '#1a1f35',
    paddingTop: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: '#0b0e1e',
    borderWidth: 1,
    borderColor: '#2a3060',
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: Platform.OS === 'web' ? 0 : spacing.sm,
    gap: spacing.sm,
  },
  input: {
    flex: 1,
    fontFamily: fonts.ui,
    fontSize: 14,
    color: colors.textPrimary,
    paddingVertical: spacing.md,
    maxHeight: 120,
    ...(Platform.OS === 'web' ? { outlineWidth: 0 } : {}),
    lineHeight: 20,
  },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.accentTeal,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  sendBtnDisabled: {
    backgroundColor: '#1a2040',
  },
  inputFooter: {
    fontFamily: fonts.mono,
    fontSize: 9,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.sm,
    letterSpacing: 0.5,
  },
});
