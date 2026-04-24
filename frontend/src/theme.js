import { StyleSheet, Platform } from 'react-native';

export const colors = {
  bg:           '#060810',
  bgCard:       '#0b0d1a',
  bgSidebar:    '#080a14',
  bgInput:      '#0e1120',
  bgUserBubble: '#131a3e',
  bgBotBubble:  '#0b0e1e',
  border:       '#1a1f35',
  borderAccent: '#00f5d4',
  borderViolet: '#7b2fff',

  textPrimary:   '#e8eaf6',
  textSecondary: '#8892b0',
  textMuted:     '#4a5278',
  textAccent:    '#00f5d4',
  textViolet:    '#b78bff',

  accentTeal:   '#00f5d4',
  accentViolet: '#7b2fff',
  accentBlue:   '#4a90e2',

  success: '#00e676',
  error:   '#ff4081',
  warning: '#ffab40',
};

export const fonts = {
  mono:      'ShareTechMono_400Regular',
  ui:        'Exo2_400Regular',
  uiBold:    'Exo2_700Bold',
  uiLight:   'Exo2_300Light',
};

export const radius = { sm: 4, md: 8, lg: 12, xl: 16 };
export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };

export const shadows = {
  teal: {
    shadowColor: colors.accentTeal,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  violet: {
    shadowColor: colors.accentViolet,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
};

// Intent badge color map
export const intentColors = {
  contact:     { bg: '#0d1f1a', border: '#00e676', text: '#00e676' },
  services:    { bg: '#0d1520', border: '#4a90e2', text: '#4a90e2' },
  history:     { bg: '#1a0d20', border: '#b78bff', text: '#b78bff' },
  description: { bg: '#1a1200', border: '#ffab40', text: '#ffab40' },
  general:     { bg: '#0d1320', border: '#00f5d4', text: '#00f5d4' },
};

export const globalStyles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  card: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  monoText: {
    fontFamily: fonts.mono,
    color: colors.textPrimary,
    fontSize: 13,
  },
  label: {
    fontFamily: fonts.uiBold,
    color: colors.textSecondary,
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  accentText: {
    fontFamily: fonts.mono,
    color: colors.accentTeal,
    fontSize: 12,
  },
});
