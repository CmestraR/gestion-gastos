import * as Updates from 'expo-updates';
import * as Application from 'expo-application';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const LAST_CHECK_KEY = '@last_ota_check_timestamp';
const MIN_CHECK_INTERVAL_MS = 15 * 60 * 1000; // 15 minutos entre verificaciones automáticas de inicio

export interface AppVersionInfo {
  appVersion: string;
  versionCode: number | string;
  runtimeVersion: string;
  channel: string;
  updateId: string | null;
  isEmbeddedLaunch: boolean;
  isUpdatesEnabled: boolean;
  createdAt: string | null;
}

export interface CheckUpdateResult {
  isAvailable: boolean;
  isDevMode: boolean;
  message: string;
  manifest?: any;
}

export const UpdateService = {
  /**
   * Obtiene la información de versión y compilación del entorno actual de forma dinámica
   */
  getAppInfo(): AppVersionInfo {
    const isUpdatesEnabled = Updates.isEnabled;
    const updateId = Updates.updateId || null;
    const channel = Updates.channel || (isUpdatesEnabled ? 'preview' : 'development');
    const runtimeVersion = typeof Updates.runtimeVersion === 'string' ? Updates.runtimeVersion : (Constants.expoConfig?.runtimeVersion as string || '1.0.0');
    const isEmbeddedLaunch = Updates.isEmbeddedLaunch;
    const createdAt = Updates.createdAt ? Updates.createdAt.toISOString() : null;

    // Versión nativa obtenida directamente del binario compilado mediante expo-application (fuente de verdad oficial)
    const appVersion = Application.nativeApplicationVersion || Constants.expoConfig?.version || '1.0.0';
    const versionCode = Application.nativeBuildVersion || (Platform.OS === 'android' 
      ? (Constants.expoConfig?.android?.versionCode ?? 1)
      : (Constants.expoConfig?.ios?.buildNumber ?? '1'));

    return {
      appVersion,
      versionCode,
      runtimeVersion,
      channel,
      updateId,
      isEmbeddedLaunch,
      isUpdatesEnabled,
      createdAt,
    };
  },

  /**
   * Comprueba de manera manual o interactiva si existe una actualización OTA disponible
   */
  async checkForUpdate(): Promise<CheckUpdateResult> {
    try {
      if (!Updates.isEnabled) {
        return {
          isAvailable: false,
          isDevMode: true,
          message: 'En modo desarrollo local las actualizaciones OTA están pausadas. Estarán activas en tu APK instalado.',
        };
      }

      const update = await Updates.checkForUpdateAsync();
      await AsyncStorage.setItem(LAST_CHECK_KEY, Date.now().toString());

      if (update.isAvailable) {
        return {
          isAvailable: true,
          isDevMode: false,
          message: '¡Hay una nueva actualización disponible lista para descargar!',
          manifest: update.manifest,
        };
      }

      return {
        isAvailable: false,
        isDevMode: false,
        message: 'Ya tienes instalada la versión más reciente de la aplicación.',
      };
    } catch (error: any) {
      console.warn('Error checking for updates:', error);
      return {
        isAvailable: false,
        isDevMode: false,
        message: 'No fue posible conectar con el servidor de actualizaciones. Revisa tu conexión a internet.',
      };
    }
  },

  /**
   * PASO 1: Descarga la actualización OTA en segundo plano sin reiniciar
   */
  async downloadUpdate(): Promise<boolean> {
    try {
      if (!Updates.isEnabled) return false;
      const result = await Updates.fetchUpdateAsync();
      return result.isNew;
    } catch (error) {
      console.error('Error downloading update:', error);
      throw error;
    }
  },

  /**
   * PASO 2: Aplica la actualización descargada recargando el bundle de forma segura
   * Solo debe llamarse cuando el usuario lo confirme y no existan escrituras SQLite activas.
   */
  async applyDownloadedUpdate(): Promise<void> {
    try {
      if (!Updates.isEnabled) return;
      await Updates.reloadAsync();
    } catch (error) {
      console.error('Error applying update reload:', error);
      throw error;
    }
  },

  /**
   * Helper integrado: Descarga y aplica
   */
  async fetchAndApplyUpdate(): Promise<boolean> {
    const isNew = await this.downloadUpdate();
    if (isNew) {
      await this.applyDownloadedUpdate();
      return true;
    }
    return false;
  },

  /**
   * Verificación silenciosa en segundo plano al iniciar la app.
   * Respeta un intervalo de tiempo para no saturar la red ni la batería.
   */
  async checkOnStartupQuietly(onUpdateFound: () => void): Promise<void> {
    try {
      if (!Updates.isEnabled) return;

      const lastCheckStr = await AsyncStorage.getItem(LAST_CHECK_KEY);
      const now = Date.now();
      if (lastCheckStr) {
        const lastCheck = parseInt(lastCheckStr, 10);
        if (now - lastCheck < MIN_CHECK_INTERVAL_MS) {
          return; // Verificación reciente, no molestar
        }
      }

      const update = await Updates.checkForUpdateAsync();
      await AsyncStorage.setItem(LAST_CHECK_KEY, now.toString());

      if (update.isAvailable) {
        onUpdateFound();
      }
    } catch {
      // Silenciar errores en segundo plano para no interrumpir la experiencia del usuario
    }
  },
};
