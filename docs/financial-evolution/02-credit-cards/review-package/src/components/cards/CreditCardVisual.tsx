import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { CreditCard, CardStatementSummary } from '../../types/finance';
import { formatCurrency } from '../../utils/formatters';
import { useFinancial } from '../../context/FinancialContext';
import { Theme } from '../common/Theme';
import { CustomIcon } from '../common/CustomIcon';

interface CreditCardVisualProps {
  card: CreditCard;
  statement?: CardStatementSummary;
  onPress?: () => void;
  onViewStatement?: () => void;
  onAddPurchase?: () => void;
  onPayCard?: () => void;
  compact?: boolean;
}

const { width } = Dimensions.get('window');
// Ancho ajustado para que quede perfectamente alineado y centrado
export const CARD_WIDTH = width - 32;

export const CreditCardVisual: React.FC<CreditCardVisualProps> = ({
  card,
  statement,
  onPress,
  onViewStatement,
  onAddPurchase,
  onPayCard,
  compact = false,
}) => {
  const { isBalanceHidden } = useFinancial();
  const usedAmount = card.creditLimit - card.availableLimit;
  const usedPercentage = card.creditLimit > 0 ? Math.min(100, Math.max(0, (usedAmount / card.creditLimit) * 100)) : 0;

  // Días para fecha de corte y pago
  const daysToCutOff = statement?.daysToCutOff ?? 0;
  const daysToPayment = statement?.daysToPayment ?? 0;
  const isCutOffPassed = statement?.isCutOffPassed ?? (daysToCutOff < 0);
  const isPaymentOverdue = statement?.isPaymentOverdue ?? (daysToPayment < 0);

  const gradientColors = card.colorGradient && card.colorGradient.length === 2 
    ? card.colorGradient 
    : Theme.colors.cardGradients[0];

  return (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={onPress}
      style={[styles.container, compact && styles.compactContainer]}
    >
      <LinearGradient
        colors={gradientColors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradient}
      >
        {/* Encabezado de la Tarjeta */}
        <View style={styles.header}>
          <View style={styles.bankInfo}>
            <Text style={styles.bankName}>{card.bankName.toUpperCase()}</Text>
            <Text style={styles.cardName}>{card.name}</Text>
          </View>
          <View style={styles.brandBadge}>
            <Text style={styles.brandText}>{card.cardBrand.toUpperCase()}</Text>
          </View>
        </View>

        {/* Chip y Números */}
        <View style={styles.middleSection}>
          <View style={styles.chipVisual}>
            <View style={styles.chipInner} />
          </View>
          <Text style={styles.cardNumber}>
            •••• •••• •••• {card.lastFourDigits || '0000'}
          </Text>
        </View>

        {/* Barra de Cupo */}
        <View style={styles.limitSection}>
          <View style={styles.limitHeader}>
            <Text style={styles.limitLabel}>Cupo Disponible</Text>
            <Text style={styles.limitValue}>
              {isBalanceHidden ? '••••••' : formatCurrency(card.availableLimit, card.currency)}
            </Text>
          </View>

          <View style={styles.progressBarBg}>
            <View
              style={[
                styles.progressBarFill,
                {
                  width: `${100 - usedPercentage}%`,
                  backgroundColor: usedPercentage > 85 ? '#EF4444' : usedPercentage > 60 ? '#F59E0B' : '#10B981',
                },
              ]}
            />
          </View>

          <View style={styles.limitFooter}>
            <Text style={styles.limitSub}>
              Cupo Total: {isBalanceHidden ? '••••••' : formatCurrency(card.creditLimit, card.currency)}
            </Text>
            <Text style={styles.limitSub}>
              Usado: {isBalanceHidden ? '••%' : `${usedPercentage.toFixed(0)}%`}
            </Text>
          </View>
        </View>

        {/* Fechas de Corte y Pago */}
        <View style={styles.datesGrid}>
          {/* Fecha de Corte */}
          <View style={[styles.dateBox, isCutOffPassed && styles.dateBoxCutPassed]}>
            <View style={styles.dateIconRow}>
              <CustomIcon
                name={isCutOffPassed ? 'CheckCircle2' : 'Calendar'}
                size={13}
                color={isCutOffPassed ? '#F87171' : '#CBD5E1'}
              />
              <Text style={[styles.dateTitle, isCutOffPassed && styles.dateTitleCutPassed]}>
                Día de Corte: {card.cutOffDay}
              </Text>
            </View>
            <Text style={[styles.dateSubtitle, isCutOffPassed && styles.dateSubtitleCutPassed]}>
              {daysToCutOff === 0
                ? '¡Corte hoy!'
                : isCutOffPassed
                ? `Cerró hace ${Math.abs(daysToCutOff)} d`
                : `Cierra en ${daysToCutOff} d`}
            </Text>
          </View>

          {/* Fecha Límite de Pago */}
          <View style={[styles.dateBox, (daysToPayment <= 5 || isPaymentOverdue) && styles.dateBoxUrgent]}>
            <View style={styles.dateIconRow}>
              <CustomIcon
                name="AlertCircle"
                size={13}
                color={daysToPayment <= 5 || isPaymentOverdue ? '#F87171' : '#CBD5E1'}
              />
              <Text style={[styles.dateTitle, (daysToPayment <= 5 || isPaymentOverdue) && styles.dateTitleUrgent]}>
                Día de Pago: {card.paymentDueDay}
              </Text>
            </View>
            <Text style={[styles.dateSubtitle, (daysToPayment <= 5 || isPaymentOverdue) && styles.dateSubtitleUrgent]}>
              {isPaymentOverdue
                ? `Vencido (${Math.abs(daysToPayment)} d)`
                : daysToPayment === 0
                ? '¡Paga Hoy!'
                : `Vence en ${daysToPayment} d`}
            </Text>
          </View>
        </View>

        {/* Acciones Rápidas (si no es compact) */}
        {!compact && (
          <View style={styles.actionsRow}>
            {onViewStatement && (
              <TouchableOpacity style={styles.actionBtn} onPress={onViewStatement}>
                <CustomIcon name="FileText" size={13} color="#FFFFFF" />
                <Text style={styles.actionBtnText} numberOfLines={1}>Extracto</Text>
              </TouchableOpacity>
            )}

            {onAddPurchase && (
              <TouchableOpacity style={[styles.actionBtn, styles.actionBtnAccent]} onPress={onAddPurchase}>
                <CustomIcon name="Plus" size={13} color="#FFFFFF" />
                <Text style={styles.actionBtnText} numberOfLines={1}>Compra</Text>
              </TouchableOpacity>
            )}

            {onPayCard && (
              <TouchableOpacity style={[styles.actionBtn, styles.actionBtnPay]} onPress={onPayCard}>
                <CustomIcon name="CheckCircle2" size={13} color="#FFFFFF" />
                <Text style={styles.actionBtnText} numberOfLines={1}>Abonar</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </LinearGradient>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    width: CARD_WIDTH,
    borderRadius: Theme.borderRadius.lg,
    overflow: 'hidden',
    marginBottom: 16,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
  },
  compactContainer: {
    marginBottom: 10,
  },
  gradient: {
    padding: 16,
    borderRadius: Theme.borderRadius.lg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  bankInfo: {
    flex: 1,
  },
  bankName: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
  },
  cardName: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 2,
  },
  brandBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
  },
  brandText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
  },
  middleSection: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 14,
    marginBottom: 12,
  },
  chipVisual: {
    width: 34,
    height: 24,
    backgroundColor: '#D4AF37',
    borderRadius: 5,
    marginRight: 14,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#F59E0B',
  },
  chipInner: {
    width: 24,
    height: 14,
    borderRadius: 2,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.25)',
  },
  cardNumber: {
    color: 'rgba(255, 255, 255, 0.85)',
    fontSize: 14,
    letterSpacing: 2,
    fontWeight: '600',
  },
  limitSection: {
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
    padding: 10,
    borderRadius: 12,
    marginBottom: 12,
  },
  limitHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  limitLabel: {
    color: '#CBD5E1',
    fontSize: 12,
    fontWeight: '500',
  },
  limitValue: {
    color: '#34D399',
    fontSize: 15,
    fontWeight: 'bold',
  },
  progressBarBg: {
    height: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  limitFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  limitSub: {
    color: '#94A3B8',
    fontSize: 11,
  },
  datesGrid: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  dateBox: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    padding: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  dateBoxUrgent: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    borderColor: 'rgba(239, 68, 68, 0.4)',
  },
  dateBoxCutPassed: {
    backgroundColor: 'rgba(239, 68, 68, 0.18)',
    borderColor: 'rgba(239, 68, 68, 0.45)',
    borderWidth: 1,
  },
  dateTitleCutPassed: {
    color: '#FCA5A5',
    fontWeight: 'bold',
  },
  dateSubtitleCutPassed: {
    color: '#F87171',
    fontWeight: 'bold',
  },
  dateIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  dateTitle: {
    color: '#CBD5E1',
    fontSize: 11,
    fontWeight: '600',
  },
  dateTitleUrgent: {
    color: '#FCA5A5',
  },
  dateSubtitle: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 'bold',
    marginTop: 2,
  },
  dateSubtitleUrgent: {
    color: '#F87171',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 6,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.12)',
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: 8,
    gap: 4,
  },
  actionBtnAccent: {
    backgroundColor: 'rgba(99, 102, 241, 0.7)',
  },
  actionBtnPay: {
    backgroundColor: 'rgba(16, 185, 129, 0.7)',
  },
  actionBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
});
