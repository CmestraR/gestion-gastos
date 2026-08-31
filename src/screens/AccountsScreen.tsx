import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { useFinancial } from '../context/FinancialContext';
import { formatCurrency } from '../utils/formatters';
import { Theme } from '../components/common/Theme';
import { CustomIcon } from '../components/common/CustomIcon';
import { Account } from '../types/finance';
import { AccountCard } from '../components/accounts/AccountCard';
import { AddAccountModal } from '../components/accounts/AddAccountModal';
import { AddTransactionModal } from '../components/transactions/AddTransactionModal';
import { PayDebtModal } from '../components/accounts/PayDebtModal';

export const AccountsScreen: React.FC = () => {
  const { accounts, totalBankBalance, totalOtherDebts, currency } = useFinancial();
  const [addAccountModalVisible, setAddAccountModalVisible] = useState(false);
  const [selectedAccountToEdit, setSelectedAccountToEdit] = useState<Account | null>(null);
  const [transferModalVisible, setTransferModalVisible] = useState(false);
  const [payDebtModalVisible, setPayDebtModalVisible] = useState(false);
  const [selectedDebtAccountToPay, setSelectedDebtAccountToPay] = useState<Account | null>(null);

  const handleOpenCreate = () => {
    setSelectedAccountToEdit(null);
    setAddAccountModalVisible(true);
  };

  const handleOpenEdit = (acc: Account) => {
    setSelectedAccountToEdit(acc);
    setAddAccountModalVisible(true);
  };

  const handleOpenPayDebt = (acc: Account) => {
    setSelectedDebtAccountToPay(acc);
    setPayDebtModalVisible(true);
  };

  const liquidAccounts = accounts.filter((a) => a.type !== 'debt');
  const debtAccounts = accounts.filter((a) => a.type === 'debt');

  return (
    <View style={styles.safeArea}>
      <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerTitleCol}>
            <Text style={styles.tag}>MIS FONDOS & DEUDAS</Text>
            <Text style={styles.title} numberOfLines={1}>Cuentas & Deudas</Text>
          </View>
          <TouchableOpacity
            style={styles.addBtn}
            onPress={handleOpenCreate}
            activeOpacity={0.8}
          >
            <CustomIcon name="Plus" size={15} color="#FFFFFF" />
            <Text style={styles.addBtnText}>Nueva</Text>
          </TouchableOpacity>
        </View>

        {/* Resumen Total */}
        <View style={styles.heroCard}>
          <View style={styles.heroRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.heroLabel}>SALDO DISPONIBLE EN CUENTAS</Text>
              <Text style={styles.heroAmount}>{formatCurrency(totalBankBalance, currency)}</Text>
            </View>
            {totalOtherDebts > 0 && (
              <View style={styles.heroDebtCol}>
                <Text style={styles.heroDebtLabel}>DEUDAS ACTIVAS</Text>
                <Text style={styles.heroDebtAmount}>-{formatCurrency(totalOtherDebts, currency)}</Text>
              </View>
            )}
          </View>
          <Text style={styles.heroSub}>{liquidAccounts.length} cuentas disponibles • {debtAccounts.length} deudas activas</Text>

          <TouchableOpacity
            style={styles.transferBtn}
            onPress={() => setTransferModalVisible(true)}
          >
            <CustomIcon name="Repeat" size={16} color="#FFFFFF" />
            <Text style={styles.transferBtnText}>Transferir entre Cuentas</Text>
          </TouchableOpacity>
        </View>

        {/* Sección: Cuentas y Billeteras Líquidas */}
        <Text style={styles.sectionHeading}>Cuentas & Billeteras ({liquidAccounts.length})</Text>

        {liquidAccounts.length === 0 ? (
          <View style={styles.emptyState}>
            <CustomIcon name="Landmark" size={32} color="#64748B" />
            <Text style={styles.emptyTitle}>Sin cuentas bancarias</Text>
            <Text style={styles.emptyText}>Agrega cuentas de ahorros, corriente, efectivo o billeteras.</Text>
          </View>
        ) : (
          liquidAccounts.map((acc) => (
            <AccountCard
              key={acc.id}
              account={acc}
              onPress={() => handleOpenEdit(acc)}
            />
          ))
        )}

        {/* Sección: Deudas y Cuentas por Pagar (Fiados, Cafetería, etc.) */}
        <View style={styles.debtHeaderRow}>
          <Text style={[styles.sectionHeading, { color: '#F87171', marginTop: 16 }]}>
            Deudas & Cuentas por Pagar ({debtAccounts.length})
          </Text>
          {debtAccounts.length > 0 && (
            <View style={styles.debtTotalBadge}>
              <Text style={styles.debtTotalBadgeText}>
                Total: -{formatCurrency(totalOtherDebts, currency)}
              </Text>
            </View>
          )}
        </View>

        {debtAccounts.length === 0 ? (
          <View style={[styles.emptyState, { backgroundColor: '#13111C' }]}>
            <CustomIcon name="Receipt" size={32} color="#64748B" />
            <Text style={styles.emptyTitle}>Sin deudas pendientes</Text>
            <Text style={styles.emptyText}>
              ¿Consumes en la cafetería o tienes fiados? Crea una cuenta de deuda para registrar consumos y pagarla a fin de mes.
            </Text>
          </View>
        ) : (
          debtAccounts.map((acc) => (
            <AccountCard
              key={acc.id}
              account={acc}
              onPress={() => handleOpenEdit(acc)}
              onPayDebt={() => handleOpenPayDebt(acc)}
            />
          ))
        )}

        <View style={{ height: 90 }} />
      </ScrollView>

      {/* Modales */}
      <AddAccountModal
        visible={addAccountModalVisible}
        accountToEdit={selectedAccountToEdit}
        onClose={() => {
          setAddAccountModalVisible(false);
          setSelectedAccountToEdit(null);
        }}
      />

      <AddTransactionModal
        visible={transferModalVisible}
        defaultType="transfer"
        onClose={() => setTransferModalVisible(false)}
      />

      <PayDebtModal
        visible={payDebtModalVisible}
        debtAccount={selectedDebtAccountToPay}
        onClose={() => {
          setPayDebtModalVisible(false);
          setSelectedDebtAccountToPay(null);
        }}
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
  },
  headerTitleCol: {
    flex: 1,
    marginRight: 10,
  },
  tag: {
    color: '#818CF8',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 21,
    fontWeight: 'bold',
    marginTop: 2,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Theme.colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    gap: 4,
  },
  addBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  heroCard: {
    backgroundColor: Theme.colors.surfaceElevated,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  heroRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  heroLabel: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  heroAmount: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: 'bold',
    marginTop: 4,
  },
  heroDebtCol: {
    alignItems: 'flex-end',
  },
  heroDebtLabel: {
    color: '#F87171',
    fontSize: 10.5,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  heroDebtAmount: {
    color: '#EF4444',
    fontSize: 16,
    fontWeight: 'bold',
    marginTop: 2,
  },
  heroSub: {
    color: '#64748B',
    fontSize: 11,
    marginTop: 4,
    marginBottom: 14,
  },
  transferBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1E293B',
    paddingVertical: 10,
    borderRadius: 10,
    gap: 6,
    borderWidth: 1,
    borderColor: '#334155',
  },
  transferBtnText: {
    color: '#818CF8',
    fontSize: 13,
    fontWeight: 'bold',
  },
  sectionHeading: {
    color: '#FFFFFF',
    fontSize: 14.5,
    fontWeight: 'bold',
    marginBottom: 10,
    marginTop: 4,
  },
  debtHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  debtTotalBadge: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  debtTotalBadgeText: {
    color: '#F87171',
    fontSize: 11,
    fontWeight: 'bold',
  },
  emptyState: {
    backgroundColor: Theme.colors.surfaceCard,
    borderRadius: 14,
    padding: 20,
    alignItems: 'center',
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  emptyTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
    marginTop: 8,
  },
  emptyText: {
    color: '#94A3B8',
    fontSize: 11.5,
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 16,
  },
});
