import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Linking, ScrollView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, spacing, radius, intentColors } from '../theme';

const INTENT_META = {
  contact:     { label: 'CONTACT INFO',  icon: 'call',            color: '#00e676' },
  services:    { label: 'SERVICES',      icon: 'briefcase',       color: '#4a90e2' },
  history:     { label: 'HISTORY',       icon: 'time',            color: '#b78bff' },
  description: { label: 'DESCRIPTION',  icon: 'document-text',   color: '#ffab40' },
  general:     { label: 'GENERAL',       icon: 'globe',           color: '#00f5d4' },
};

// ──────────────────────────────────────────────────────────────────────────────
function DataRow({ label, value, copyable = false }) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    if (Platform.OS === 'web') {
      navigator.clipboard?.writeText(value);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <View style={styles.dataRow}>
      <Text style={styles.dataLabel}>{label}</Text>
      <View style={styles.dataValueRow}>
        <Text style={styles.dataValue} selectable>{value}</Text>
        {copyable && (
          <TouchableOpacity onPress={copy} style={styles.copyBtn}>
            <Ionicons name={copied ? 'checkmark' : 'copy-outline'} size={12}
              color={copied ? colors.success : colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

function TagList({ items, color }) {
  if (!items || items.length === 0) return null;
  return (
    <View style={styles.tagList}>
      {items.map((item, i) => (
        <View key={i} style={[styles.tag, { borderColor: color + '44' }]}>
          <Text style={[styles.tagText, { color }]}>{item}</Text>
        </View>
      ))}
    </View>
  );
}

function ServiceItem({ item, index }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <TouchableOpacity
      style={styles.serviceItem}
      onPress={() => setExpanded(e => !e)}
      activeOpacity={0.8}
    >
      <View style={styles.serviceHeader}>
        <View style={styles.serviceIndex}>
          <Text style={styles.serviceIndexText}>{String(index + 1).padStart(2, '0')}</Text>
        </View>
        <Text style={styles.serviceName} numberOfLines={expanded ? undefined : 1}>
          {item.name}
        </Text>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={14} color={colors.textMuted}
        />
      </View>
      {expanded && item.description ? (
        <Text style={styles.serviceDesc}>{item.description}</Text>
      ) : null}
    </TouchableOpacity>
  );
}

// ──────────────────────────────────────────────────────────────────────────────

export default function ResultsCard({ results, url, intent, onPreviewPress }) {
  const [expanded, setExpanded] = useState(true);
  const meta = INTENT_META[intent] || INTENT_META.general;
  const ic = intentColors[intent] || intentColors.general;

  return (
    <View style={styles.card}>
      {/* Card Header */}
      <View style={[styles.cardHeader, { borderBottomColor: meta.color + '33' }]}>
        <View style={styles.intentBadge}>
          <View style={[styles.intentDot, { backgroundColor: meta.color }]} />
          <Text style={[styles.intentLabel, { color: meta.color }]}>{meta.label}</Text>
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity
            style={styles.previewBtn}
            onPress={onPreviewPress}
          >
            <Ionicons name="browsers-outline" size={13} color={colors.accentTeal} />
            <Text style={styles.previewBtnText}>PREVIEW</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setExpanded(e => !e)}>
            <Ionicons
              name={expanded ? 'chevron-up' : 'chevron-down'}
              size={16} color={colors.textMuted}
            />
          </TouchableOpacity>
        </View>
      </View>

      {/* URL bar */}
      <TouchableOpacity
        style={styles.urlBar}
        onPress={() => Linking.openURL(url)}
      >
        <Ionicons name="link" size={11} color={colors.accentTeal} />
        <Text style={styles.urlText} numberOfLines={1}>{url}</Text>
        <Ionicons name="open-outline" size={11} color={colors.textMuted} />
      </TouchableOpacity>

      {/* Summary */}
      {results.summary ? (
        <View style={styles.summaryBox}>
          <Text style={styles.summaryText}>{results.summary}</Text>
        </View>
      ) : null}

      {/* Expanded Content */}
      {expanded && <ResultsBody results={results} intent={intent} meta={meta} />}
    </View>
  );
}

function ResultsBody({ results, intent, meta }) {
  // ── CONTACT ──────────────────────────────────────────────────────────────
  if (intent === 'contact') {
    return (
      <View style={styles.body}>
        {results.emails?.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>EMAIL ADDRESSES</Text>
            {results.emails.map((e, i) => (
              <DataRow key={i} label={`email_${i + 1}`} value={e} copyable />
            ))}
          </View>
        )}
        {results.phones?.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>PHONE NUMBERS</Text>
            {results.phones.map((p, i) => (
              <DataRow key={i} label={`phone_${i + 1}`} value={p} copyable />
            ))}
          </View>
        )}
        {results.addresses?.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>ADDRESSES</Text>
            {results.addresses.map((a, i) => (
              <DataRow key={i} label={`address_${i + 1}`} value={a} />
            ))}
          </View>
        )}
        {results.social_media && Object.keys(results.social_media).length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>SOCIAL MEDIA</Text>
            {Object.entries(results.social_media).map(([platform, link]) => (
              <TouchableOpacity key={platform} style={styles.socialLink} onPress={() => Linking.openURL(link)}>
                <Text style={styles.socialPlatform}>{platform.toUpperCase()}</Text>
                <Text style={styles.socialUrl} numberOfLines={1}>{link}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>
    );
  }

  // ── SERVICES ─────────────────────────────────────────────────────────────
  if (intent === 'services') {
    return (
      <View style={styles.body}>
        <Text style={styles.sectionTitle}>{results.count} LISTING(S) FOUND</Text>
        {(results.items || []).map((item, i) => (
          <ServiceItem key={i} item={item} index={i} />
        ))}
      </View>
    );
  }

  // ── HISTORY ──────────────────────────────────────────────────────────────
  if (intent === 'history') {
    return (
      <View style={styles.body}>
        {results.founding_statement ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>FOUNDING</Text>
            <Text style={styles.paragraphText}>{results.founding_statement}</Text>
          </View>
        ) : null}
        {results.key_years?.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>KEY YEARS</Text>
            <TagList items={results.key_years} color="#b78bff" />
          </View>
        )}
        {results.overview ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>OVERVIEW</Text>
            <Text style={styles.paragraphText}>{results.overview.slice(0, 600)}…</Text>
          </View>
        ) : null}
      </View>
    );
  }

  // ── DESCRIPTION ──────────────────────────────────────────────────────────
  if (intent === 'description') {
    return (
      <View style={styles.body}>
        {results.title ? <DataRow label="title" value={results.title} /> : null}
        {results.meta_description ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>META DESCRIPTION</Text>
            <Text style={styles.paragraphText}>{results.meta_description}</Text>
          </View>
        ) : null}
        {results.keywords ? <DataRow label="keywords" value={results.keywords} /> : null}
        {results.overview ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>PAGE CONTENT</Text>
            <Text style={styles.paragraphText}>{results.overview.slice(0, 500)}…</Text>
          </View>
        ) : null}
      </View>
    );
  }

  // ── GENERAL ──────────────────────────────────────────────────────────────
  return (
    <View style={styles.body}>
      {results.title ? <DataRow label="title" value={results.title} /> : null}
      {results.description ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>DESCRIPTION</Text>
          <Text style={styles.paragraphText}>{results.description.slice(0, 400)}</Text>
        </View>
      ) : null}
      {results.contact_preview?.emails?.length > 0 && (
        <DataRow label="emails found" value={results.contact_preview.emails.join(', ')} />
      )}
      {results.contact_preview?.phones?.length > 0 && (
        <DataRow label="phones found" value={results.contact_preview.phones.join(', ')} />
      )}
      {results.contact_preview?.social?.length > 0 && (
        <DataRow label="social platforms" value={results.contact_preview.social.join(', ')} />
      )}
    </View>
  );
}

// ──────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    marginTop: spacing.sm,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
  },
  intentBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  intentDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  intentLabel: {
    fontFamily: fonts.uiBold,
    fontSize: 11,
    letterSpacing: 1.5,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  previewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: colors.accentTeal + '55',
    borderRadius: radius.sm,
  },
  previewBtnText: {
    fontFamily: fonts.uiBold,
    fontSize: 9,
    color: colors.accentTeal,
    letterSpacing: 1,
  },
  urlBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    backgroundColor: '#060810',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  urlText: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.accentTeal,
    flex: 1,
  },
  summaryBox: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: 'rgba(0,245,212,0.03)',
  },
  summaryText: {
    fontFamily: fonts.ui,
    fontSize: 12,
    color: colors.textSecondary,
    fontStyle: 'italic',
  },
  body: {
    padding: spacing.md,
    gap: spacing.md,
  },
  section: {
    gap: spacing.xs,
  },
  sectionTitle: {
    fontFamily: fonts.uiBold,
    fontSize: 9,
    color: colors.textMuted,
    letterSpacing: 2,
    marginBottom: 6,
  },
  dataRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: colors.border + '66',
    gap: spacing.sm,
  },
  dataLabel: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.textMuted,
    width: 90,
  },
  dataValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 6,
  },
  dataValue: {
    fontFamily: fonts.mono,
    fontSize: 12,
    color: colors.textPrimary,
    flex: 1,
  },
  copyBtn: {
    padding: 4,
  },
  tagList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  tag: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderRadius: radius.sm,
  },
  tagText: {
    fontFamily: fonts.mono,
    fontSize: 11,
  },
  serviceItem: {
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border + '55',
  },
  serviceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  serviceIndex: {
    width: 26,
    height: 20,
    backgroundColor: 'rgba(74,144,226,0.15)',
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  serviceIndexText: {
    fontFamily: fonts.mono,
    fontSize: 10,
    color: colors.accentBlue,
  },
  serviceName: {
    fontFamily: fonts.uiBold,
    fontSize: 13,
    color: colors.textPrimary,
    flex: 1,
  },
  serviceDesc: {
    fontFamily: fonts.ui,
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 18,
    marginTop: 6,
    marginLeft: 36,
  },
  paragraphText: {
    fontFamily: fonts.ui,
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  socialLink: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    gap: 10,
  },
  socialPlatform: {
    fontFamily: fonts.uiBold,
    fontSize: 10,
    color: colors.accentTeal,
    width: 80,
    letterSpacing: 1,
  },
  socialUrl: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.textSecondary,
    flex: 1,
  },
});
