import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
  ActivityIndicator, Platform, Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, spacing, radius } from '../theme';
import { fetchSessions, removeSession } from '../api/scraperApi';

const INTENT_ICONS = {
  contact:     'call-outline',
  services:    'briefcase-outline',
  history:     'time-outline',
  description: 'document-text-outline',
  general:     'globe-outline',
};

const INTENT_COLORS = {
  contact:     '#00e676',
  services:    '#4a90e2',
  history:     '#b78bff',
  description: '#ffab40',
  general:     '#00f5d4',
};

function SessionItem({ session, isActive, onPress, onDelete }) {
  const [hovered, setHovered] = useState(false);

  const webHandlers = Platform.OS === 'web' ? {
    onMouseEnter: () => setHovered(true),
    onMouseLeave: () => setHovered(false),
  } : {};

  return (
    <TouchableOpacity
      style={[styles.sessionItem, isActive && styles.sessionActive, hovered && styles.sessionHover]}
      onPress={onPress}
      {...webHandlers}
    >
      <View style={styles.sessionLeft}>
        <Ionicons name="chatbubble-outline" size={14} color={isActive ? colors.accentTeal : colors.textMuted} />
        <View style={{ flex: 1, marginLeft: 8 }}>
          <Text style={[styles.sessionTitle, isActive && { color: colors.accentTeal }]} numberOfLines={1}>
            {session.title}
          </Text>
          <Text style={styles.sessionDate}>
            {formatDate(session.updated_at)}
          </Text>
        </View>
      </View>
      {hovered && (
        <TouchableOpacity onPress={(e) => { e.stopPropagation?.(); onDelete(session.id); }} style={styles.deleteBtn}>
          <Ionicons name="trash-outline" size={13} color={colors.error} />
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
}

export default function Sidebar({ activeSessionId, onSelectSession, onNewSession, visible }) {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchSessions();
      setSessions(data);
    } catch (e) {
      console.warn('Failed to load sessions:', e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [activeSessionId]);

  const handleDelete = async (id) => {
    try {
      await removeSession(id);
      setSessions(prev => prev.filter(s => s.id !== id));
      if (id === activeSessionId) onSelectSession(null);
    } catch (e) {
      console.warn('Delete failed:', e.message);
    }
  };

  if (!visible) return null;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLogo}>
          <View style={styles.logoDot} />
          <Text style={styles.logoText}>NEXUS</Text>
        </View>
        <Text style={styles.headerSub}>SCRAPER v1.0</Text>
      </View>

      {/* New Chat Button */}
      <TouchableOpacity style={styles.newBtn} onPress={onNewSession}>
        <Ionicons name="add" size={16} color={colors.accentTeal} />
        <Text style={styles.newBtnText}>NEW SESSION</Text>
      </TouchableOpacity>

      {/* Session List */}
      <Text style={styles.sectionLabel}>HISTORY</Text>
      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
        {loading ? (
          <ActivityIndicator color={colors.accentTeal} style={{ marginTop: 16 }} />
        ) : sessions.length === 0 ? (
          <Text style={styles.emptyText}>No sessions yet</Text>
        ) : (
          sessions.map(session => (
            <SessionItem
              key={session.id}
              session={session}
              isActive={session.id === activeSessionId}
              onPress={() => onSelectSession(session.id)}
              onDelete={handleDelete}
            />
          ))
        )}
      </ScrollView>

      {/* Footer */}
      <View style={styles.footer}>
        <TouchableOpacity style={styles.footerBtn} onPress={load}>
          <Ionicons name="refresh-outline" size={14} color={colors.textMuted} />
          <Text style={styles.footerBtnText}>Refresh</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const diff = now - d;
  if (diff < 60000)   return 'just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const styles = StyleSheet.create({
  container: {
    width: 240,
    backgroundColor: '#080a14',
    borderRightWidth: 1,
    borderRightColor: '#1a1f35',
    paddingTop: Platform.OS === 'ios' ? 50 : 16,
    paddingBottom: 16,
    flexShrink: 0,
  },
  header: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.lg,
  },
  headerLogo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 2,
  },
  logoDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.accentTeal,
    ...(Platform.OS === 'web' ? { boxShadow: '0 0 8px #00f5d4' } : {}),
  },
  logoText: {
    fontFamily: fonts.uiBold,
    fontSize: 18,
    color: colors.accentTeal,
    letterSpacing: 4,
    ...(Platform.OS === 'web' ? { textShadow: '0 0 12px #00f5d4' } : {}),
  },
  headerSub: {
    fontFamily: fonts.mono,
    fontSize: 9,
    color: colors.textMuted,
    letterSpacing: 2,
    marginLeft: 16,
  },
  newBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: colors.accentTeal,
    borderRadius: radius.sm,
    gap: 8,
    ...(Platform.OS === 'web' ? { boxShadow: '0 0 8px rgba(0,245,212,0.15)' } : {}),
  },
  newBtnText: {
    fontFamily: fonts.uiBold,
    fontSize: 11,
    color: colors.accentTeal,
    letterSpacing: 1.5,
  },
  sectionLabel: {
    fontFamily: fonts.uiBold,
    fontSize: 9,
    color: colors.textMuted,
    letterSpacing: 2,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  sessionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.sm,
    marginHorizontal: spacing.sm,
    marginBottom: 2,
  },
  sessionActive: {
    backgroundColor: 'rgba(0,245,212,0.06)',
    borderLeftWidth: 2,
    borderLeftColor: colors.accentTeal,
  },
  sessionHover: {
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  sessionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  sessionTitle: {
    fontFamily: fonts.ui,
    fontSize: 13,
    color: colors.textSecondary,
  },
  sessionDate: {
    fontFamily: fonts.mono,
    fontSize: 10,
    color: colors.textMuted,
    marginTop: 2,
  },
  deleteBtn: {
    padding: 4,
  },
  emptyText: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: 20,
  },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: '#1a1f35',
  },
  footerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
  },
  footerBtnText: {
    fontFamily: fonts.ui,
    fontSize: 12,
    color: colors.textMuted,
  },
});
