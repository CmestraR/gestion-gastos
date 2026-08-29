import { registerRootComponent } from 'expo';
import { LogBox } from 'react-native';

// Ignorar advertencia informativa de Expo Go sobre Push Tokens remotos
// (En desarrollo con Expo Go se usan notificaciones locales; los Push Tokens remotos se usan en el APK de producción)
LogBox.ignoreLogs([
  'Android Push notifications',
  'expo-notifications: Android Push notifications',
  'functionality provided by expo-notifications was removed from Expo Go',
]);

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
