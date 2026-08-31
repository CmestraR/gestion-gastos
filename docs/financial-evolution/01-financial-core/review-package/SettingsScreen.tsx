import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  SafeAreaView,
  StatusBar,
  Linking,
  Image,
} from 'react-native';
import { useFinancial } from '../context/FinancialContext';
import { useAlert } from '../context/AlertContext';
import { NotificationService } from '../utils/notificationService';
import { Theme } from '../components/common/Theme';
import { CustomIcon } from '../components/common/CustomIcon';
import { ManageCategoriesModal } from '../components/categories/ManageCategoriesModal';
import { UpdateService } from '../utils/updateService';
import { ActivityIndicator } from 'react-native';

const CURRENCIES = [
  { code: 'COP', label: 'Peso Colombiano (COP $)' },
  { code: 'USD', label: 'Dólar Estadounidense (USD $)' },
  { code: 'MXN', label: 'Peso Mexicano (MXN $)' },
  { code: 'EUR', label: 'Euro (EUR €)' },
];

export const SettingsScreen: React.FC = () => {
  const { currency, setCurrencyPreference, loadDemoData, resetDatabase, creditCards } = useFinancial();
  const { showSuccess, showWarning, showConfirm } = useAlert();
  const [manageCatsVisible, setManageCatsVisible] = useState(false);
  const [isCheckingUpdates, setIsCheckingUpdates] = useState(false);
  const appInfo = UpdateService.getAppInfo();

  const handleCheckUpdatesManual = async () => {
    setIsCheckingUpdates(true);
    try {
      const result = await UpdateService.checkForUpdate();
      if (result.isAvailable) {
        showConfirm(
          '¡Actualización Disponible!',
          'Se ha encontrado una nueva versión con mejoras para la aplicación. ¿Deseas descargarla y aplicarla ahora mismo?',
          async () => {
            showSuccess('Descargando...', 'Aplicando actualización instantánea...');
            await UpdateService.fetchAndApplyUpdate();
          },
          'Actualizar Ahora',
          'Más Tarde'
        );
      } else {
        showSuccess('Versión al Día', result.message);
      }
    } catch {
      showWarning('Aviso', 'No fue posible verificar actualizaciones en este momento.');
    } finally {
      setIsCheckingUpdates(false);
    }
  };

  const handleReset = () => {
    showConfirm(
      '¿Restablecer Base de Datos?',
      'Esta acción borrará todas las cuentas, tarjetas y transacciones locales de tu dispositivo. No se puede deshacer.',
      async () => {
        await resetDatabase();
        showSuccess('Restablecido', 'La base de datos ha sido vaciada con éxito.');
      },
      'Borrar Todo',
      'Cancelar',
      true
    );
  };

  const handleSeed = () => {
    showConfirm(
      'Cargar Datos de Ejemplo',
      'Se generarán cuentas bancarias, tarjetas de crédito (Visa, Nu) y compras a cuotas para demostración.',
      async () => {
        await loadDemoData();
        showSuccess('¡Listo!', 'Datos de ejemplo cargados correctamente.');
      },
      'Cargar Datos',
      'Cancelar'
    );
  };

  const handleTestNotification = async () => {
    const firstCard = creditCards[0];
    if (firstCard) {
      await NotificationService.sendImmediateNotification(
        `⏰ Alerta de Corte: ${firstCard.name}`,
        `Tu fecha de corte se aproxima en 3 días (Día ${firstCard.cutOffDay}). Revisa tu extracto y consumo en la app.`,
        { cardId: firstCard.id }
      );
      showSuccess(
        '🔔 ¡Notificación Enviada!',
        `Se ha disparado una notificación en la barra superior de tu teléfono para ${firstCard.name}. Desliza hacia abajo tu barra de estado para verla.`
      );
    } else {
      showWarning(
        'Sin Tarjetas Registradas',
        'Registra una tarjeta de crédito primero para recibir recordatorios automáticos de corte y fecha de pago.'
      );
    }
  };

  return (
    <View style={styles.safeArea}>
      <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.tag}>CONFIGURACIÓN</Text>
          <Text style={styles.title}>Ajustes & Opciones</Text>
        </View>

        {/* Selector de Moneda */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Moneda Principal</Text>
          <Text style={styles.cardSubtitle}>
            Formato de moneda que se usará en toda la aplicación:
          </Text>

          {CURRENCIES.map((c) => {
            const isSelected = currency === c.code;
            return (
              <TouchableOpacity
                key={c.code}
                style={[styles.currencyRow, isSelected && styles.currencyRowSelected]}
                onPress={() => setCurrencyPreference(c.code)}
              >
                <Text style={[styles.currencyText, isSelected && styles.currencyTextSelected]}>
                  {c.label}
                </Text>
                {isSelected && <CustomIcon name="Check" size={16} color="#34D399" />}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Categorías Inteligentes & Reglas de IA */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Categorías & Reglas de IA</Text>
          <Text style={styles.cardSubtitle}>
            Crea categorías personalizadas y asigna palabras clave para que la app autocomplete tus gastos en automático:
          </Text>

          <TouchableOpacity style={styles.actionRow} onPress={() => setManageCatsVisible(true)}>
            <View style={[styles.actionIconBox, { backgroundColor: 'rgba(16, 185, 129, 0.15)' }]}>
              <CustomIcon name="Sparkles" size={16} color="#10B981" />
            </View>
            <View style={styles.actionTextBox}>
              <Text style={styles.actionTitle}>Gestionar Categorías & Palabras Clave</Text>
              <Text style={styles.actionSub}>Configura reglas de detección inteligente</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Notificaciones & Recordatorios de Corte */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Alertas & Recordatorios de Tarjetas</Text>
          <Text style={styles.cardSubtitle}>
            La app monitorea automáticamente tus días de corte y de pago para avisarte 3 días antes de cada vencimiento:
          </Text>

          <TouchableOpacity
            style={styles.actionRow}
            onPress={handleTestNotification}
          >
            <View style={[styles.actionIconBox, { backgroundColor: 'rgba(245, 158, 11, 0.15)' }]}>
              <CustomIcon name="Bell" size={16} color="#F59E0B" />
            </View>
            <View style={styles.actionTextBox}>
              <Text style={styles.actionTitle}>Probar Alerta en Barra de Notificaciones</Text>
              <Text style={styles.actionSub}>Envía un aviso real a la barra superior de tu celular</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Privacidad & Datos */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Datos & Almacenamiento Local</Text>
          <Text style={styles.cardSubtitle}>
            Toda tu información financiera se almacena de forma 100% segura y privada en tu dispositivo mediante SQLite. No requiere conexión a internet.
          </Text>

          <TouchableOpacity style={styles.actionRow} onPress={handleSeed}>
            <View style={styles.actionIconBox}>
              <CustomIcon name="Sparkles" size={16} color="#818CF8" />
            </View>
            <View style={styles.actionTextBox}>
              <Text style={styles.actionTitle}>Cargar Datos de Ejemplo</Text>
              <Text style={styles.actionSub}>Genera cuentas, tarjetas de crédito y cuotas de prueba</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.actionRow, styles.actionRowDanger]} onPress={handleReset}>
            <View style={[styles.actionIconBox, { backgroundColor: 'rgba(239, 68, 68, 0.15)' }]}>
              <CustomIcon name="Trash2" size={16} color="#EF4444" />
            </View>
            <View style={styles.actionTextBox}>
              <Text style={[styles.actionTitle, { color: '#F87171' }]}>Vaciar Base de Datos</Text>
              <Text style={styles.actionSub}>Elimina todas las cuentas, tarjetas y movimientos</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Sistema de Versión y Actualizaciones OTA */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Versión & Actualizaciones</Text>
          <Text style={styles.cardSubtitle}>
            Administra las actualizaciones instantáneas (Over-The-Air) y el estado de tu versión instalada:
          </Text>

          <TouchableOpacity
            style={styles.actionRow}
            onPress={handleCheckUpdatesManual}
            disabled={isCheckingUpdates}
            activeOpacity={0.8}
          >
            <View style={[styles.actionIconBox, { backgroundColor: 'rgba(99, 102, 241, 0.15)' }]}>
              {isCheckingUpdates ? (
                <ActivityIndicator size="small" color="#6366F1" />
              ) : (
                <CustomIcon name="RefreshCw" size={16} color="#6366F1" />
              )}
            </View>
            <View style={styles.actionTextBox}>
              <Text style={styles.actionTitle}>
                {isCheckingUpdates ? 'Buscando Actualizaciones...' : 'Buscar Actualizaciones'}
              </Text>
              <Text style={styles.actionSub}>Comprueba si hay mejoras OTA disponibles</Text>
            </View>
          </TouchableOpacity>

          <View style={styles.divider} />

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Versión de Aplicación</Text>
            <Text style={styles.infoValue}>v{appInfo.appVersion}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Compilación (Build)</Text>
            <Text style={styles.infoValue}>Build {appInfo.versionCode}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Runtime Version</Text>
            <Text style={styles.infoValue}>{appInfo.runtimeVersion}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Canal EAS</Text>
            <Text style={styles.infoValue}>{appInfo.channel.toUpperCase()}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Revisión OTA</Text>
            <Text style={styles.infoValue}>
              {appInfo.updateId ? `Update ${appInfo.updateId.substring(0, 8)}` : `Bundle Base (v${appInfo.appVersion})`}
            </Text>
          </View>
        </View>

        {/* Info App & Creador */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Acerca de la App</Text>

          {/* Tarjeta del Creador */}
          <View style={styles.creatorCard}>
            <Image
              source={require('../../assets/icon.png')}
              style={styles.creatorAppLogo}
            />
            <View style={{ flex: 1 }}>
              <Text style={styles.creatorAppTitle}>Control de Gastos</Text>
              <Text style={styles.creatorAuthorText}>
                Creado Por: <Text style={styles.creatorNameText}>Cristian Mestra</Text>
              </Text>
            </View>
          </View>

          {/* Botón de Instagram */}
          <TouchableOpacity
            style={styles.instagramButton}
            onPress={() => {
              Linking.openURL('https://www.instagram.com/cristian_mr17?igsi=cW9wZmQzMHdwM3ph');
            }}
            activeOpacity={0.85}
          >
            <View style={styles.instagramIconBadge}>
              <CustomIcon name="Instagram" size={18} color="#FFFFFF" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.instagramBtnTitle}>Seguir al Creador</Text>
              <Text style={styles.instagramBtnSub}>@cristian_mr17 en Instagram</Text>
            </View>
            <CustomIcon name="ExternalLink" size={16} color="#F43F5E" />
          </TouchableOpacity>

          <View style={styles.divider} />

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Versión</Text>
            <Text style={styles.infoValue}>1.0.0 (Android Ready)</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Motor Financiero</Text>
            <Text style={styles.infoValue}>Amortización Francesa & E.M.</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Base de Datos</Text>
            <Text style={styles.infoValue}>SQLite Local (Offline First)</Text>
          </View>
        </View>

        <View style={{ height: 90 }} />
      </ScrollView>

      <ManageCategoriesModal
        visible={manageCatsVisible}
        onClose={() => setManageCatsVisible(false)}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Theme.colors.background,
  },
  container: {
    flex: 1,
    paddingHorizontal: 16,
  },
  header: {
    paddingVertical: 14,
  },
  tag: {
    color: '#818CF8',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: 'bold',
  },
  card: {
    backgroundColor: Theme.colors.surfaceCard,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  cardTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  cardSubtitle: {
    color: '#94A3B8',
    fontSize: 12,
    marginBottom: 14,
    lineHeight: 18,
  },
  currencyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Theme.colors.surfaceElevated,
    padding: 12,
    borderRadius: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  currencyRowSelected: {
    backgroundColor: 'rgba(99, 102, 241, 0.25)',
    borderColor: '#818CF8',
  },
  currencyText: {
    color: '#CBD5E1',
    fontSize: 13,
    fontWeight: '500',
  },
  currencyTextSelected: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Theme.colors.surfaceElevated,
    padding: 12,
    borderRadius: 12,
    marginBottom: 10,
    gap: 12,
  },
  actionRowDanger: {
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
  },
  actionIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(129, 140, 248, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionTextBox: {
    flex: 1,
  },
  actionTitle: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: 'bold',
  },
  actionSub: {
    color: '#94A3B8',
    fontSize: 11,
    marginTop: 1,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
  },
  infoLabel: {
    color: '#94A3B8',
    fontSize: 12,
  },
  infoValue: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  creatorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#0F172A',
    borderRadius: 14,
    padding: 12,
    marginTop: 8,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#334155',
  },
  creatorAppLogo: {
    width: 46,
    height: 46,
    borderRadius: 10,
  },
  creatorAppTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  creatorAuthorText: {
    color: '#94A3B8',
    fontSize: 12,
    marginTop: 2,
  },
  creatorNameText: {
    color: '#34D399',
    fontWeight: 'bold',
  },
  instagramButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(244, 63, 94, 0.12)',
    borderRadius: 12,
    padding: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(244, 63, 94, 0.3)',
  },
  instagramIconBadge: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#E1306C',
    justifyContent: 'center',
    alignItems: 'center',
  },
  instagramBtnTitle: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: 'bold',
  },
  instagramBtnSub: {
    color: '#FDA4AF',
    fontSize: 11,
    marginTop: 1,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    marginVertical: 6,
  },
});
