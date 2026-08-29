import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  SafeAreaView,
  StatusBar,
} from 'react-native';
import { useFinancial } from '../context/FinancialContext';
import { formatCurrency } from '../utils/formatters';
import { Theme } from '../components/common/Theme';
import { CustomIcon } from '../components/common/CustomIcon';
import { CreditCardVisual, CARD_WIDTH } from '../components/cards/CreditCardVisual';
import { AccountCard } from '../components/accounts/AccountCard';
import { TransactionItem } from '../components/transactions/TransactionItem';
import { CardStatementModal } from '../components/cards/CardStatementModal';
import { InstallmentAmortizationModal } from '../components/cards/InstallmentAmortizationModal';
import { AddTransactionModal } from '../components/transactions/AddTransactionModal';
import { QuickIslandBar } from '../components/common/QuickIslandBar';
import { ParsedBankMessage } from '../utils/bankNotificationParser';
import { CreditCard, CardStatementSummary, CardPurchase } from '../types/finance';

interface DashboardScreenProps {
  onNavigateToTab: (tabName: string, params?: { accountId?: string }) => void;
}

export const DashboardScreen: React.FC<DashboardScreenProps> = ({ onNavigateToTab }) => {
  const {
    totalBankBalance,
    totalCreditDebt,
    netWorth,
    monthlyIncome,
    monthlyExpense,
    creditCards,
    cardStatements,
    accounts,
    transactions,
    activePurchases,
    refreshData,
    currency,
    isBalanceHidden,
    toggleHideBalance,
  } = useFinancial();

  const [refreshing, setRefreshing] = useState(false);
  const [activeCardIndex, setActiveCardIndex] = useState(0);
  const [statementModalVisible, setStatementModalVisible] = useState(false);
  const [selectedCardForStatement, setSelectedCardForStatement] = useState<CreditCard | null>(null);
  const [selectedStatement, setSelectedStatement] = useState<CardStatementSummary | null>(null);

  const [amortizationModalVisible, setAmortizationModalVisible] = useState(false);
  const [selectedPurchase, setSelectedPurchase] = useState<CardPurchase | null>(null);
  const [selectedPurchaseCard, setSelectedPurchaseCard] = useState<CreditCard | null>(null);

  const [addTxVisible, setAddTxVisible] = useState(false);
  const [prefillData, setPrefillData] = useState<Partial<ParsedBankMessage> | null>(null);

  const handleOpenAddWithPrefill = (data?: Partial<ParsedBankMessage>) => {
    setPrefillData(data || null);
    setAddTxVisible(true);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await refreshData();
    setRefreshing(false);
  };

  const handleOpenStatement = (card: CreditCard) => {
    const stmt = cardStatements.find((s) => s.cardId === card.id) || null;
    setSelectedCardForStatement(card);
    setSelectedStatement(stmt);
    setStatementModalVisible(true);
  };

  const handleOpenAmortization = (purchase: CardPurchase) => {
    const card = creditCards.find((c) => c.id === purchase.cardId) || null;
    setSelectedPurchase(purchase);
    setSelectedPurchaseCard(card);
    setAmortizationModalVisible(true);
  };

  const recentTransactions = transactions.slice(0, 5);

  return (
    <View style={styles.safeArea}>
      <ScrollView
        style={styles.container}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6366F1" />}
      >
        {/* Header Superior con Botón de Ocultar Saldo & Ajustes */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>Control Financiero</Text>
            <Text style={styles.appName}>Mi Billetera & Gastos</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity style={styles.settingsHeaderBtn} onPress={toggleHideBalance}>
              <CustomIcon name={isBalanceHidden ? 'EyeOff' : 'Eye'} size={20} color="#CBD5E1" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.settingsHeaderBtn} onPress={() => onNavigateToTab('settings')}>
              <CustomIcon name="Settings" size={20} color="#CBD5E1" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Acceso Rápido / Isla Dinámica de Notificaciones */}
        <QuickIslandBar onOpenAddModal={(data) => handleOpenAddWithPrefill(data)} />

        {/* Tarjeta de Saldo Disponible Consolidado */}
        <View style={styles.netWorthCard}>
          <View style={styles.netWorthHeader}>
            <Text style={styles.netWorthLabel}>SALDO DISPONIBLE</Text>
            <View style={styles.privacyBadge}>
              <CustomIcon name="ShieldCheck" size={13} color="#10B981" />
              <Text style={styles.privacyText}>100% Privado</Text>
            </View>
          </View>

          <Text style={[styles.netWorthAmount, netWorth < 0 && { color: '#F87171' }]}>
            {isBalanceHidden ? '$ ••••••' : formatCurrency(netWorth, currency)}
          </Text>

          <View style={styles.netWorthBreakdown}>
            <View style={styles.netWorthItem}>
              <View style={styles.dotIncome} />
              <View>
                <Text style={styles.breakdownSub}>Total en Cuentas</Text>
                <Text style={styles.breakdownVal}>
                  {isBalanceHidden ? '••••••' : formatCurrency(totalBankBalance, currency)}
                </Text>
              </View>
            </View>

            <View style={styles.dividerVertical} />

            <View style={styles.netWorthItem}>
              <View style={styles.dotDebt} />
              <View>
                <Text style={styles.breakdownSub}>Deuda Tarjetas</Text>
                <Text style={[styles.breakdownVal, { color: '#F87171' }]}>
                  {isBalanceHidden ? '••••••' : formatCurrency(totalCreditDebt, currency)}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* Resumen de Flujo Mensual (Ingresos vs Gastos) */}
        <View style={styles.cashFlowRow}>
          {/* Ingresos */}
          <View style={[styles.flowCard, styles.flowCardIncome]}>
            <View style={styles.flowIconBoxIncome}>
              <CustomIcon name="ArrowDownLeft" size={16} color="#10B981" />
            </View>
            <Text style={styles.flowLabel}>Ingresos del Mes</Text>
            <Text style={styles.flowAmountIncome}>
              {isBalanceHidden ? '••••••' : formatCurrency(monthlyIncome, currency)}
            </Text>
          </View>

          {/* Gastos */}
          <View style={[styles.flowCard, styles.flowCardExpense]}>
            <View style={styles.flowIconBoxExpense}>
              <CustomIcon name="ArrowUpRight" size={16} color="#EF4444" />
            </View>
            <Text style={styles.flowLabel}>Gastos del Mes</Text>
            <Text style={styles.flowAmountExpense}>
              {isBalanceHidden ? '••••••' : formatCurrency(monthlyExpense, currency)}
            </Text>
          </View>
        </View>

        {/* Sección de Tarjetas de Crédito */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Tarjetas de Crédito</Text>
          <TouchableOpacity onPress={() => onNavigateToTab('cards')}>
            <Text style={styles.seeAllText}>Gestionar ({creditCards.length})</Text>
          </TouchableOpacity>
        </View>

        {creditCards.length === 0 ? (
          <TouchableOpacity style={styles.emptyCard} onPress={() => onNavigateToTab('cards')}>
            <CustomIcon name="CreditCard" size={28} color="#6366F1" />
            <Text style={styles.emptyCardText}>No tienes tarjetas registradas</Text>
            <Text style={styles.emptyCardSub}>Toca aquí para agregar tu primera tarjeta de crédito</Text>
          </TouchableOpacity>
        ) : (
          <View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              snapToInterval={CARD_WIDTH + 12}
              snapToAlignment="start"
              decelerationRate="fast"
              nestedScrollEnabled={true}
              scrollEventThrottle={16}
              onScroll={(e) => {
                const offsetX = e.nativeEvent.contentOffset.x;
                const idx = Math.round(offsetX / (CARD_WIDTH + 12));
                if (idx >= 0 && idx < creditCards.length) {
                  setActiveCardIndex(idx);
                }
              }}
              style={styles.cardsScroll}
            >
              {creditCards.map((card, index) => {
                const stmt = cardStatements.find((s) => s.cardId === card.id);
                const isLast = index === creditCards.length - 1;
                return (
                  <View key={card.id} style={{ width: CARD_WIDTH, marginRight: isLast ? 0 : 12 }}>
                    <CreditCardVisual
                      card={card}
                      statement={stmt}
                      onViewStatement={() => handleOpenStatement(card)}
                      onAddPurchase={() => setAddTxVisible(true)}
                      onPayCard={() => handleOpenStatement(card)}
                    />
                  </View>
                );
              })}
            </ScrollView>

            {/* Indicador de Paginación de Tarjetas */}
            {creditCards.length > 1 && (
              <View style={styles.carouselPagination}>
                {creditCards.map((_, i) => (
                  <View
                    key={i}
                    style={[
                      styles.paginationDot,
                      activeCardIndex === i && styles.paginationDotActive,
                    ]}
                  />
                ))}
              </View>
            )}
          </View>
        )}

        {/* Compras a Cuotas Activas */}
        {activePurchases.length > 0 && (
          <View style={styles.installmentsBlock}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Cuotas Pendientes</Text>
              <Text style={styles.activeCountBadge}>{activePurchases.length} activas</Text>
            </View>

            {activePurchases.map((purch) => {
              const card = creditCards.find((c) => c.id === purch.cardId);
              return (
                <TouchableOpacity
                  key={purch.id}
                  style={styles.activePurchaseItem}
                  onPress={() => handleOpenAmortization(purch)}
                  activeOpacity={0.8}
                >
                  <View style={styles.purchLeft}>
                    <View style={styles.purchIconBox}>
                      <CustomIcon name="CalendarClock" size={16} color="#818CF8" />
                    </View>
                    <View>
                      <Text style={styles.purchTitle}>{purch.description}</Text>
                      <Text style={styles.purchSub}>
                        {card?.name || 'Tarjeta'} • Cuota {purch.installmentsPaid} de {purch.installmentsTotal}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.purchRight}>
                    <Text style={styles.purchAmount}>
                      {formatCurrency(purch.monthlyInstallmentAmount, currency)} / mes
                    </Text>
                    <Text style={styles.purchRate}>{purch.interestRateMonthly}% E.M.</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* Sección de Cuentas Bancarias */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Mis Cuentas & Billeteras</Text>
          <TouchableOpacity onPress={() => onNavigateToTab('accounts')}>
            <Text style={styles.seeAllText}>Ver todas</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.accountsGrid}>
          {accounts.map((acc) => (
            <AccountCard
              key={acc.id}
              account={acc}
              onPress={() => onNavigateToTab('transactions', { accountId: acc.id })}
            />
          ))}
        </View>

        {/* Últimas Transacciones */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Últimos Movimientos</Text>
          <TouchableOpacity onPress={() => onNavigateToTab('transactions')}>
            <Text style={styles.seeAllText}>Historial completo</Text>
          </TouchableOpacity>
        </View>

        {recentTransactions.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyText}>No hay movimientos registrados.</Text>
          </View>
        ) : (
          <View style={styles.transactionsList}>
            {recentTransactions.map((tx) => (
              <TransactionItem key={tx.id} transaction={tx} />
            ))}
          </View>
        )}

        <View style={{ height: 90 }} />
      </ScrollView>

      {/* Modales */}
      <CardStatementModal
        visible={statementModalVisible}
        card={selectedCardForStatement}
        statement={selectedStatement}
        onClose={() => setStatementModalVisible(false)}
      />

      <InstallmentAmortizationModal
        visible={amortizationModalVisible}
        purchase={selectedPurchase}
        card={selectedPurchaseCard}
        onClose={() => setAmortizationModalVisible(false)}
      />

      <AddTransactionModal
        visible={addTxVisible}
        prefillData={prefillData}
        onClose={() => {
          setAddTxVisible(false);
          setPrefillData(null);
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
  greeting: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  appName: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: 'bold',
  },
  settingsHeaderBtn: {
    backgroundColor: Theme.colors.surfaceElevated,
    width: 42,
    height: 42,
    borderRadius: 21,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  quickAddBtn: {
    backgroundColor: Theme.colors.primary,
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
  },
  netWorthCard: {
    backgroundColor: Theme.colors.surfaceCard,
    borderRadius: 20,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  netWorthHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  netWorthLabel: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
  },
  privacyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    gap: 4,
  },
  privacyText: {
    color: '#10B981',
    fontSize: 10,
    fontWeight: 'bold',
  },
  netWorthAmount: {
    color: '#FFFFFF',
    fontSize: 30,
    fontWeight: 'bold',
    marginVertical: 4,
  },
  netWorthBreakdown: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
    borderRadius: 12,
    padding: 12,
    marginTop: 8,
  },
  netWorthItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  dotIncome: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10B981',
  },
  dotDebt: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#EF4444',
  },
  breakdownSub: {
    color: '#94A3B8',
    fontSize: 10,
  },
  breakdownVal: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: 'bold',
    marginTop: 1,
  },
  dividerVertical: {
    width: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    marginHorizontal: 8,
  },
  cashFlowRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 18,
  },
  flowCard: {
    flex: 1,
    backgroundColor: Theme.colors.surfaceCard,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  flowCardIncome: {
    borderLeftWidth: 3,
    borderLeftColor: '#10B981',
  },
  flowCardExpense: {
    borderLeftWidth: 3,
    borderLeftColor: '#EF4444',
  },
  flowIconBoxIncome: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  flowIconBoxExpense: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  flowLabel: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '500',
  },
  flowAmountIncome: {
    color: '#10B981',
    fontSize: 16,
    fontWeight: 'bold',
    marginTop: 2,
  },
  flowAmountExpense: {
    color: '#EF4444',
    fontSize: 16,
    fontWeight: 'bold',
    marginTop: 2,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 12,
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: 'bold',
  },
  seeAllText: {
    color: '#818CF8',
    fontSize: 13,
    fontWeight: '600',
  },
  cardsScroll: {
    marginVertical: 4,
  },
  carouselPagination: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    marginBottom: 4,
  },
  paginationDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#334155',
  },
  paginationDotActive: {
    width: 20,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#818CF8',
  },
  emptyCard: {
    backgroundColor: Theme.colors.surfaceCard,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#1E293B',
    borderStyle: 'dashed',
  },
  emptyCardText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: 'bold',
    marginTop: 8,
  },
  emptyCardSub: {
    color: '#94A3B8',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 4,
  },
  installmentsBlock: {
    marginBottom: 16,
  },
  activeCountBadge: {
    color: '#818CF8',
    backgroundColor: 'rgba(99, 102, 241, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    fontSize: 11,
    fontWeight: 'bold',
  },
  activePurchaseItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Theme.colors.surfaceCard,
    padding: 12,
    borderRadius: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  purchLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  purchIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(129, 140, 248, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  purchTitle: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: 'bold',
  },
  purchSub: {
    color: '#94A3B8',
    fontSize: 11,
    marginTop: 1,
  },
  purchRight: {
    alignItems: 'flex-end',
  },
  purchAmount: {
    color: '#34D399',
    fontSize: 13,
    fontWeight: 'bold',
  },
  purchRate: {
    color: '#F59E0B',
    fontSize: 10,
    fontWeight: '600',
    marginTop: 1,
  },
  accountsGrid: {
    marginBottom: 10,
  },
  transactionsList: {
    marginBottom: 10,
  },
  emptyBox: {
    padding: 16,
    alignItems: 'center',
  },
  emptyText: {
    color: '#64748B',
    fontSize: 13,
  },
});
