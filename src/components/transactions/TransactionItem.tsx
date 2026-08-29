import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { Transaction } from '../../types/finance';
import { useFinancial } from '../../context/FinancialContext';
import { formatCurrency, formatRelativeDate } from '../../utils/formatters';
import { Theme } from '../common/Theme';
import { CustomIcon } from '../common/CustomIcon';

interface TransactionItemProps {
  transaction: Transaction;
  onPress?: () => void;
}

export const TransactionItem: React.FC<TransactionItemProps> = ({ transaction, onPress }) => {
  const { categories, accounts, creditCards, deleteTransaction, currency } = useFinancial();

  const category = categories.find((c) => c.id === transaction.categoryId);
  const account = accounts.find((a) => a.id === transaction.accountId);
  const toAccount = accounts.find((a) => a.id === transaction.toAccountId);
  const card = creditCards.find((c) => c.id === transaction.cardId);

  const getAccountLabel = () => {
    if (transaction.type === 'transfer') {
      return `${account?.name || 'Cuenta'} → ${toAccount?.name || 'Cuenta'}`;
    }
    if (transaction.type === 'card_purchase' || transaction.cardId) {
      const notes = transaction.notes ? ` (${transaction.notes})` : '';
      return `${card?.name || 'Tarjeta'}${notes}`;
    }
    if (transaction.type === 'card_payment') {
      return `Pago ${card?.name || 'Tarjeta'} desde ${account?.name || 'Cuenta'}`;
    }
    return account?.name || 'Efectivo';
  };

  const getAmountColor = () => {
    switch (transaction.type) {
      case 'income':
        return '#10B981';
      case 'expense':
        return '#EF4444';
      case 'card_purchase':
        return '#818CF8';
      case 'transfer':
        return '#06B6D4';
      case 'card_payment':
        return '#F59E0B';
      default:
        return '#FFFFFF';
    }
  };

  const getAmountPrefix = () => {
    switch (transaction.type) {
      case 'income':
        return '+';
      case 'expense':
      case 'card_purchase':
      case 'card_payment':
        return '-';
      case 'transfer':
        return '⇄ ';
      default:
        return '';
    }
  };

  const handleLongPress = () => {
    Alert.alert(
      'Eliminar Transacción',
      `¿Deseas eliminar "${transaction.description}"? El saldo se actualizará automáticamente.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            await deleteTransaction(transaction.id);
          },
        },
      ]
    );
  };

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={onPress}
      onLongPress={handleLongPress}
      activeOpacity={0.7}
    >
      {/* Icono de Categoría */}
      <View
        style={[
          styles.iconContainer,
          { backgroundColor: (category?.color || '#6366F1') + '25' },
        ]}
      >
        <CustomIcon
          name={category?.icon || 'CircleHelp'}
          size={18}
          color={category?.color || '#6366F1'}
        />
      </View>

      {/* Textos Centrales */}
      <View style={styles.textContainer}>
        <Text style={styles.description} numberOfLines={1}>
          {transaction.description}
        </Text>
        <View style={styles.metaRow}>
          <Text style={styles.accountText}>{getAccountLabel()}</Text>
          {!!transaction.gmfAmount && transaction.gmfAmount > 0 && (
            <>
              <Text style={styles.dot}>•</Text>
              <Text style={{ color: '#F87171', fontSize: 10.5, fontWeight: '700' }}>
                +4x1000: {formatCurrency(transaction.gmfAmount, currency)}
              </Text>
            </>
          )}
          <Text style={styles.dot}>•</Text>
          <Text style={styles.dateText}>{formatRelativeDate(transaction.date)}</Text>
        </View>
      </View>

      {/* Monto */}
      <View style={styles.amountContainer}>
        <Text style={[styles.amount, { color: getAmountColor() }]}>
          {getAmountPrefix()}
          {formatCurrency(transaction.amount, currency)}
        </Text>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Theme.colors.surfaceCard,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  textContainer: {
    flex: 1,
    marginRight: 8,
  },
  description: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  accountText: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '500',
  },
  dot: {
    color: '#64748B',
    marginHorizontal: 4,
    fontSize: 11,
  },
  dateText: {
    color: '#64748B',
    fontSize: 11,
  },
  amountContainer: {
    alignItems: 'flex-end',
  },
  amount: {
    fontSize: 14,
    fontWeight: 'bold',
  },
});
