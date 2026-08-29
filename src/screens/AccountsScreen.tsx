import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
} from 'react-native';
import { useFinancial } from '../context/FinancialContext';
import { formatCurrency } from '../utils/formatters';
import { Theme } from '../components/common/Theme';
import { CustomIcon } from '../components/common/CustomIcon';
import { Account } from '../types/finance';
import { AccountCard } from '../components/accounts/AccountCard';
import { AddAccountModal } from '../components/accounts/AddAccountModal';
import { AddTransactionModal } from '../components/transactions/AddTransactionModal';

export const AccountsScreen: React.FC = () => {
  const { accounts, totalBankBalance, currency } = useFinancial();
  const [addAccountModalVisible, setAddAccountModalVisible] = useState(false);
  const [selectedAccountToEdit, setSelectedAccountToEdit] = useState<Account | null>(null);
  const [transferModalVisible, setTransferModalVisible] = useState(false);

  const handleOpenCreate = () => {
    setSelectedAccountToEdit(null);
    setAddAccountModalVisible(true);
  };

  const handleOpenEdit = (acc: Account) => {
    setSelectedAccountToEdit(acc);
    setAddAccountModalVisible(true);
  };

  return (
    <View style={styles.safeArea}>
      <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.tag}>MIS FONDOS</Text>
            <Text style={styles.title}>Cuentas & Billeteras</Text>
          </View>
          <TouchableOpacity
            style={styles.addBtn}
            onPress={handleOpenCreate}
          >
            <CustomIcon name="Plus" size={16} color="#FFFFFF" />
            <Text style={styles.addBtnText}>Nueva Cuenta</Text>
          </TouchableOpacity>
        </View>

        {/* Resumen Total */}
        <View style={styles.heroCard}>
          <Text style={styles.heroLabel}>SALDO TOTAL EN CUENTAS</Text>
          <Text style={styles.heroAmount}>{formatCurrency(totalBankBalance, currency)}</Text>
          <Text style={styles.heroSub}>{accounts.length} cuentas y billeteras activas (Toca para editar)</Text>

          <TouchableOpacity
            style={styles.transferBtn}
            onPress={() => setTransferModalVisible(true)}
          >
            <CustomIcon name="Repeat" size={16} color="#FFFFFF" />
            <Text style={styles.transferBtnText}>Transferir entre Cuentas</Text>
          </TouchableOpacity>
        </View>

        {/* Lista de Cuentas */}
        <Text style={styles.sectionHeading}>Todas las Cuentas (Toca para editar)</Text>

        {accounts.length === 0 ? (
          <View style={styles.emptyState}>
            <CustomIcon name="Landmark" size={36} color="#64748B" />
            <Text style={styles.emptyTitle}>Sin cuentas registradas</Text>
            <Text style={styles.emptyText}>Agrega tus cuentas bancarias, billeteras digitales o efectivo.</Text>
            <TouchableOpacity
              style={styles.emptyBtn}
              onPress={handleOpenCreate}
            >
              <Text style={styles.emptyBtnText}>Agregar Cuenta</Text>
            </TouchableOpacity>
          </View>
        ) : (
          accounts.map((acc) => (
            <AccountCard
              key={acc.id}
              account={acc}
              onPress={() => handleOpenEdit(acc)}
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
    backgroundColor: Theme.colors.surfaceCard,
    borderRadius: 20,
    padding: 20,
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  heroLabel: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
  },
  heroAmount: {
    color: '#34D399',
    fontSize: 28,
    fontWeight: 'bold',
    marginVertical: 6,
  },
  heroSub: {
    color: '#64748B',
    fontSize: 12,
    marginBottom: 14,
  },
  transferBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#06B6D4',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    gap: 8,
  },
  transferBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: 'bold',
  },
  sectionHeading: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  emptyState: {
    backgroundColor: Theme.colors.surfaceCard,
    borderRadius: 16,
    padding: 30,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  emptyTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
    marginTop: 10,
  },
  emptyText: {
    color: '#94A3B8',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 16,
  },
  emptyBtn: {
    backgroundColor: Theme.colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
  },
  emptyBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: 'bold',
  },
});
