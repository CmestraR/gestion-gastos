import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Transaction } from '../../types/finance';
import { useFinancial } from '../../context/FinancialContext';
import { useAlert } from '../../context/AlertContext';
import { formatCurrency, formatRelativeDate } from '../../utils/formatters';
import { Theme } from '../common/Theme';
import { CustomIcon } from '../common/CustomIcon';

interface TransactionItemProps {
  transaction: Transaction;
  onPress?: () => void;
}

export const TransactionItem: React.FC<TransactionItemProps> = ({ transaction, onPress }) => {
  const { categories, accounts, creditCards, deleteTransaction, currency } = useFinancial();
  const { showConfirm, showSuccess } = useAlert();

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
    showConfirm(
      'Eliminar Transacción',
      `¿Deseas eliminar "${transaction.description}"? El saldo se actualizará automáticamente.`,
      async () => {
        await deleteTransaction(transaction.id);
        showSuccess('Transacción Eliminada', 'El movimiento ha sido eliminado con éxito.');
      },
      'Eliminar',
      'Cancelar',
      true
    );
  };

  const hasGmf = !!transaction.gmfAmount && transaction.gmfAmount > 0;

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={onPress}
      onLongPress={handleLongPress}
      activeOpacity={0.75}
    >
      {/* Icono de Categoría */}
      <View
        style={[
          styles.iconContainer,
          { backgroundColor: (category?.color || '#6366F1') + '20' },
        ]}
      >
        <CustomIcon
          name={category?.icon || 'CircleHelp'}
          size={18}
          color={category?.color || '#6366F1'}
        />
      </View>

      {/* Contenido Principal en Filas Estructuradas */}
      <View style={styles.contentContainer}>
        {/* Fila 1: Descripción Principal & Monto Principal (Predominantes) */}
        <View style={styles.row}>
          <Text style={styles.description} numberOfLines={1}>
            {transaction.description}
          </Text>
          <Text style={[styles.amount, { color: getAmountColor() }]}>
            {getAmountPrefix()}
            {formatCurrency(transaction.amount, currency)}
          </Text>
        </View>

        {/* Fila 2 (Opcional): 4x1000 en su propia línea */}
        {hasGmf && (
          <View style={styles.gmfRow}>
            <View style={styles.gmfPill}>
              <Text style={styles.gmfPillText}>4x1000</Text>
            </View>
            <Text style={styles.gmfAmountText}>
              -{formatCurrency(transaction.gmfAmount!, currency)}
            </Text>
          </View>
        )}

        {/* Fila 3: Cuenta & Fecha en letra pequeña */}
        <View style={styles.row}>
          <Text style={styles.accountText} numberOfLines={1}>
            {getAccountLabel()}
          </Text>
          <Text style={styles.dateText}>
            {formatRelativeDate(transaction.date)}
          </Text>
        </View>
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
  contentContainer: {
    flex: 1,
    justifyContent: 'center',
    gap: 3,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  description: {
    color: '#FFFFFF',
    fontSize: 14.5,
    fontWeight: '700',
    flex: 1,
    marginRight: 8,
  },
  amount: {
    fontSize: 14.5,
    fontWeight: '700',
  },
  gmfRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 1,
  },
  gmfPill: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
    borderWidth: 0.5,
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  gmfPillText: {
    color: '#F87171',
    fontSize: 10.5,
    fontWeight: 'bold',
  },
  gmfAmountText: {
    color: '#F87171',
    fontSize: 11.5,
    fontWeight: '600',
  },
  accountText: {
    color: '#94A3B8',
    fontSize: 11.5,
    fontWeight: '500',
    flex: 1,
    marginRight: 8,
  },
  dateText: {
    color: '#64748B',
    fontSize: 11.5,
  },
});
