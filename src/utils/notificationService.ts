import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { CreditCard } from '../types/finance';

// Configurar cómo responde la app cuando entra una notificación
try {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
} catch (err) {
  console.warn('Could not set notification handler:', err);
}

export const NotificationService = {
  /**
   * Inicializa canales de Android y solicita permisos de notificación
   */
  async init(): Promise<boolean> {
    try {
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('card_alerts', {
          name: 'Recordatorios de Tarjetas & Finanzas',
          description: 'Notificaciones sobre fechas de corte, límites de pago y avisos financieros',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#6366F1',
          sound: 'default',
        });
      }

      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      return finalStatus === 'granted';
    } catch (error) {
      console.warn('Error initializing notifications:', error);
      return false;
    }
  },

  /**
   * Envía una notificación inmediata visible en la barra de estado de Android
   */
  async sendImmediateNotification(title: string, body: string, data?: Record<string, any>): Promise<string | null> {
    try {
      await this.init();
      const notificationId = await Notifications.scheduleNotificationAsync({
        content: {
          title,
          body,
          data: data || {},
          sound: 'default',
          color: '#6366F1',
        },
        trigger: null, // Envío inmediato al sistema
      });
      return notificationId;
    } catch (error) {
      console.warn('Error sending immediate notification:', error);
      return null;
    }
  },

  /**
   * Programa recordatorios para todas las tarjetas activas
   */
  async scheduleCardReminders(cards: CreditCard[]): Promise<void> {
    try {
      if (!cards || cards.length === 0) return;
      await this.init();
      // Limpiar recordatorios anteriores para no duplicar
      await Notifications.cancelAllScheduledNotificationsAsync();

      const now = new Date();

      for (const card of cards) {
        // Recordatorio de Corte: 3 días antes
        let targetCutOffDate = new Date(now.getFullYear(), now.getMonth(), card.cutOffDay - 3, 9, 0, 0);
        if (targetCutOffDate <= now) {
          targetCutOffDate = new Date(now.getFullYear(), now.getMonth() + 1, card.cutOffDay - 3, 9, 0, 0);
        }

        await Notifications.scheduleNotificationAsync({
          content: {
            title: `⏰ Corte Próximo: ${card.name}`,
            body: `Tu fecha de corte es el día ${card.cutOffDay}. ¡Revisa tus cuotas para cerrar el mes con control!`,
            data: { cardId: card.id, type: 'cutoff_reminder' },
            sound: 'default',
            color: '#6366F1',
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: targetCutOffDate,
          },
        });

        // Recordatorio de Pago: 3 días antes de la fecha límite
        let targetPaymentDate = new Date(now.getFullYear(), now.getMonth(), card.paymentDueDay - 3, 10, 0, 0);
        if (targetPaymentDate <= now) {
          targetPaymentDate = new Date(now.getFullYear(), now.getMonth() + 1, card.paymentDueDay - 3, 10, 0, 0);
        }

        await Notifications.scheduleNotificationAsync({
          content: {
            title: `🚨 Límite de Pago: ${card.name}`,
            body: `El día límite de pago es el ${card.paymentDueDay}. Realiza tu abono a tiempo para evitar intereses de mora.`,
            data: { cardId: card.id, type: 'payment_due_reminder' },
            sound: 'default',
            color: '#EF4444',
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: targetPaymentDate,
          },
        });
      }
    } catch (error) {
      console.warn('Error scheduling card reminders:', error);
    }
  },
};
