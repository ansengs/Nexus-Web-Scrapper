import { useEffect, useCallback } from 'react';
import { View, StatusBar, Platform } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts, ShareTechMono_400Regular } from '@expo-google-fonts/share-tech-mono';
import { Exo2_300Light, Exo2_400Regular, Exo2_700Bold } from '@expo-google-fonts/exo-2';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import MainScreen from './src/screens/MainScreen';

SplashScreen.preventAutoHideAsync().catch(() => {});

if (Platform.OS === 'web' && typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.textContent = `
    *, *::before, *::after { box-sizing: border-box; }
    html, body, #root { height: 100%; background: #060810; }
    ::-webkit-scrollbar { width: 4px; height: 4px; }
    ::-webkit-scrollbar-track { background: #0b0d1a; }
    ::-webkit-scrollbar-thumb { background: #2a3060; border-radius: 2px; }
    ::-webkit-scrollbar-thumb:hover { background: #00b894; }
    input, textarea { outline: none !important; caret-color: #00b894; }
  `;
  document.head.appendChild(style);
}

export default function App() {
  const [fontsLoaded, fontError] = useFonts({
    ShareTechMono_400Regular,
    Exo2_300Light,
    Exo2_400Regular,
    Exo2_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" backgroundColor="#060810" translucent={false} />
      <View style={{ flex: 1, backgroundColor: '#060810' }}>
        <MainScreen />
      </View>
    </SafeAreaProvider>
  );
}
