import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Account } from '../../types/finance';
import { useFinancial } from '../../context/FinancialContext';
import { formatCurrency } from '../../utils/formatters';
import { Theme } from '../common/Theme';
import { CustomIcon } from '../common/CustomIcon';

interface AccountMiniCardProps {
  account: Account;
  onPress?: () => void;
  onPayDebt?: () => void;
}

export const MINI_CARD_WIDTH = 150;

/**
 * Versión compacta de una cuenta (logo + saldo) para carrusel horizontal.
 */
export const AccountMiniCard: React.FC<AccountMiniCardProps> = ({ account, onPress, onPayDebt }) => {
  const { currency, isBalanceHidden } = useFinancial();

  const isDebt = account.type === 'debt';
  const debtOwed = Math.abs(account.balance);

  const balanceText = isBalanceHidden
    ? '••••••'
    : isDebt
    ? debtOwed > 0
      ? `-${formatCurrency(debtOwed, currency)}`
      : '$0 (Al día)'
    : formatCurrency(account.balance, currency);

  return (
    <TouchableOpacity
      style={[styles.card, isDebt && styles.debtCard]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <View style={styles.topRow}>
        <View style={[styles.iconBox, { backgroundColor: (account.color || '#6366F1') + '20' }]}>
          <CustomIcon
            name={account.icon || (isDebt ? 'Receipt' : 'Landmark')}
            size={16}
            color={account.color || '#6366F1'}
          />
        </View>
        {isDebt && onPayDebt && debtOwed > 0 && (
          <TouchableOpacity style={styles.payBtn} onPress={onPayDebt} activeOpacity={0.8}>
            <Text style={styles.payBtnText}>Abonar</Text>
          </TouchableOpacity>
        )}
      </View>

      <Text style={styles.name} numberOfLines={1}>
        {account.name}
      </Text>
      <Text
        style={[
          styles.balance,
          isDebt && { color: debtOwed > 0 ? '#EF4444' : '#10B981' },
        ]}
        numberOfLines={1}
      >
        {balanceText}
      </Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    width: MINI_CARD_WIDTH,
    backgroundColor: Theme.colors.surfaceCard,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  debtCard: {
    borderColor: 'rgba(239, 68, 68, 0.3)',
    backgroundColor: '#16131E',
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  iconBox: {
    width: 32,
    height: 32,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
  },
  payBtn: {
    backgroundColor: '#10B981',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  payBtnText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: 'bold',
  },
  name: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '600',
  },
  balance: {
    color: '#34D399',
    fontSize: 15,
    fontWeight: 'bold',
    marginTop: 2,
  },
});
