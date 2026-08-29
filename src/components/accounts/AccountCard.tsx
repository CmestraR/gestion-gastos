import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { Account } from '../../types/finance';
import { useFinancial } from '../../context/FinancialContext';
import { useAlert } from '../../context/AlertContext';
import { formatCurrency } from '../../utils/formatters';
import { Theme } from '../common/Theme';
import { CustomIcon } from '../common/CustomIcon';

interface AccountCardProps {
  account: Account;
  onPress?: () => void;
}

export const AccountCard: React.FC<AccountCardProps> = ({ account, onPress }) => {
  const { deleteAccount, currency, isBalanceHidden } = useFinancial();
  const { showConfirm, showSuccess } = useAlert();

  const handleLongPress = () => {
    showConfirm(
      'Eliminar Cuenta',
      `¿Deseas eliminar la cuenta "${account.name}" y todos sus registros asociados?`,
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
      default:
        return 'Cuenta';
    }
  };

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={onPress}
      onLongPress={handleLongPress}
      activeOpacity={0.8}
    >
      <View style={styles.topRow}>
        <View style={[styles.iconBox, { backgroundColor: account.color + '20' }]}>
          <CustomIcon name={account.icon || 'Landmark'} size={18} color={account.color} />
        </View>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {account.hasGmf4x1000 && (
            <View style={[styles.typeBadge, { backgroundColor: 'rgba(239, 68, 68, 0.15)', borderColor: 'rgba(239, 68, 68, 0.4)', borderWidth: 1 }]}>
              <Text style={[styles.typeBadgeText, { color: '#F87171', fontWeight: 'bold' }]}>4x1000</Text>
            </View>
          )}
          {account.includeInTotal === false && (
            <View style={[styles.typeBadge, { backgroundColor: 'rgba(245, 158, 11, 0.15)', borderColor: '#F59E0B', borderWidth: 1 }]}>
              <Text style={[styles.typeBadgeText, { color: '#FBBF24' }]}>Separado</Text>
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
        <Text style={styles.balanceLabel}>Saldo Disponible</Text>
        <Text style={styles.balanceValue}>
          {isBalanceHidden ? '••••••' : formatCurrency(account.balance, currency)}
        </Text>
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
});
