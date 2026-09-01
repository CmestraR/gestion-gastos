import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Account } from '../../types/finance';
import { useFinancial } from '../../context/FinancialContext';
import { useAlert } from '../../context/AlertContext';
import { formatCurrency } from '../../utils/formatters';
import { Theme } from '../common/Theme';
import { CustomIcon } from '../common/CustomIcon';

interface AccountCardProps {
  account: Account;
  onPress?: () => void;
  onPayDebt?: () => void;
}

export const AccountCard: React.FC<AccountCardProps> = ({
  account,
  onPress,
  onPayDebt,
}) => {
  const { deleteAccount, currency, isBalanceHidden } = useFinancial();
  const { showConfirm, showSuccess } = useAlert();

  const handleLongPress = () => {
    showConfirm(
      'Eliminar Cuenta',
      `¿Deseas eliminar "${account.name}" y todos sus registros asociados?`,
      async () => {
        await deleteAccount(account.id);
        showSuccess('Cuenta Eliminada', `La cuenta ${account.name} ha sido eliminada.`);
      },
      'Eliminar',
      'Cancelar',
      true
    );
  };

  const getTypeName = (type: Account['type']) => {
    switch (type) {
      case 'savings':
        return 'Ahorros';
      case 'checking':
        return 'Corriente';
      case 'wallet':
        return 'Billetera';
      case 'cash':
        return 'Efectivo';
      case 'investment':
        return 'Inversión';
      case 'debt':
        return 'Deuda / Fiado';
      default:
        return 'Cuenta';
    }
  };

  const isDebt = account.type === 'debt';
  const debtOwed = Math.abs(account.balance);

  return (
    <TouchableOpacity
      style={[
        styles.card,
        isDebt && styles.debtCard,
      ]}
      onPress={onPress}
      onLongPress={handleLongPress}
      activeOpacity={0.8}
    >
      <View style={styles.topRow}>
        <View style={[styles.iconBox, { backgroundColor: account.color + '20' }]}>
          <CustomIcon name={account.icon || (isDebt ? 'Receipt' : 'Landmark')} size={18} color={account.color} />
        </View>
        <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
          {isDebt && (
            <View style={[styles.typeBadge, styles.debtBadge]}>
              <Text style={styles.debtBadgeText}>DEUDA</Text>
            </View>
          )}
          {account.hasGmf4x1000 && (
            <View style={[styles.typeBadge, styles.gmfBadge]}>
              <Text style={styles.gmfBadgeText}>4x1000</Text>
            </View>
          )}
          {account.includeInTotal === false && !isDebt && (
            <View style={[styles.typeBadge, styles.separatedBadge]}>
              <Text style={styles.separatedBadgeText}>Separado</Text>
            </View>
          )}
          <View style={styles.typeBadge}>
            <Text style={styles.typeBadgeText}>{getTypeName(account.type)}</Text>
          </View>
        </View>
      </View>

      <Text style={styles.accountName} numberOfLines={1}>
        {account.name}
      </Text>
      <Text style={styles.bankName}>{account.bankName}</Text>

      <View style={styles.balanceSection}>
        <View style={styles.balanceRow}>
          <View>
            <Text style={styles.balanceLabel}>
              {isDebt ? 'Deuda Pendiente' : 'Saldo Disponible'}
            </Text>
            <Text
              style={[
                styles.balanceValue,
                isDebt && { color: debtOwed > 0 ? '#EF4444' : '#10B981' },
              ]}
            >
              {isBalanceHidden
                ? '••••••'
                : isDebt
                ? debtOwed > 0 ? `-${formatCurrency(debtOwed, currency)}` : '$0 (Al día)'
                : formatCurrency(account.balance, currency)}
            </Text>
          </View>

          {/* Botón de Pagar/Abonar si es cuenta de deuda y debe dinero */}
          {isDebt && onPayDebt && (
            <TouchableOpacity
              style={styles.payDebtBtn}
              onPress={onPayDebt}
              activeOpacity={0.8}
            >
              <CustomIcon name="CreditCard" size={13} color="#FFFFFF" />
              <Text style={styles.payDebtBtnText}>Pagar / Abonar</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: Theme.colors.surfaceCard,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#1E293B',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  debtCard: {
    borderColor: 'rgba(239, 68, 68, 0.3)',
    backgroundColor: '#16131E',
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  iconBox: {
    width: 38,
    height: 38,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  typeBadge: {
    backgroundColor: Theme.colors.surfaceElevated,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  typeBadgeText: {
    color: '#94A3B8',
    fontSize: 10,
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
  debtBadge: {
    backgroundColor: 'rgba(239, 68, 68, 0.18)',
    borderColor: 'rgba(239, 68, 68, 0.4)',
    borderWidth: 1,
  },
  debtBadgeText: {
    color: '#F87171',
    fontWeight: 'bold',
    fontSize: 10,
  },
  gmfBadge: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderColor: 'rgba(239, 68, 68, 0.4)',
    borderWidth: 1,
  },
  gmfBadgeText: {
    color: '#F87171',
    fontWeight: 'bold',
    fontSize: 10,
  },
  separatedBadge: {
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    borderColor: '#F59E0B',
    borderWidth: 1,
  },
  separatedBadgeText: {
    color: '#FBBF24',
    fontSize: 10,
  },
  accountName: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  bankName: {
    color: '#94A3B8',
    fontSize: 12,
    marginTop: 1,
    marginBottom: 12,
  },
  balanceSection: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.06)',
    paddingTop: 8,
  },
  balanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  balanceLabel: {
    color: '#64748B',
    fontSize: 11,
  },
  balanceValue: {
    color: '#34D399',
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 2,
  },
  payDebtBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#10B981',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  payDebtBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
});
