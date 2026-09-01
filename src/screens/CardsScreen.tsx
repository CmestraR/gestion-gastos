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
import { useAlert } from '../context/AlertContext';
import { formatCurrency } from '../utils/formatters';
import { Theme } from '../components/common/Theme';
import { CustomIcon } from '../components/common/CustomIcon';
import { CreditCardVisual } from '../components/cards/CreditCardVisual';
import { AddCreditCardModal } from '../components/cards/AddCreditCardModal';
import { CardStatementModal } from '../components/cards/CardStatementModal';
import { PayCardModal } from '../components/cards/PayCardModal';
import { ReconcileCardModal } from '../components/cards/ReconcileCardModal';
import { ManualStatementModal } from '../components/cards/ManualStatementModal';
import { InstallmentAmortizationModal } from '../components/cards/InstallmentAmortizationModal';
import { AddTransactionModal } from '../components/transactions/AddTransactionModal';
import { CreditCard, CardStatementSummary, CardPurchase } from '../types/finance';

export const CardsScreen: React.FC = () => {
  const {
    creditCards,
    cardStatements,
    activePurchases,
    deleteCreditCard,
    currency,
  } = useFinancial();
  const { showConfirm, showSuccess } = useAlert();

  const [addCardModalVisible, setAddCardModalVisible] = useState(false);
  const [selectedCardToEdit, setSelectedCardToEdit] = useState<CreditCard | null>(null);

  const [statementModalVisible, setStatementModalVisible] = useState(false);
  const [selectedCardForStatement, setSelectedCardForStatement] = useState<CreditCard | null>(null);
  const [selectedStatement, setSelectedStatement] = useState<CardStatementSummary | null>(null);

  const [payModalVisible, setPayModalVisible] = useState(false);
  const [selectedCardForPay, setSelectedCardForPay] = useState<CreditCard | null>(null);
  const [selectedStatementForPay, setSelectedStatementForPay] = useState<CardStatementSummary | null>(null);

  const [reconcileModalVisible, setReconcileModalVisible] = useState(false);
  const [selectedCardForReconcile, setSelectedCardForReconcile] = useState<CreditCard | null>(null);

  const [manualStatementModalVisible, setManualStatementModalVisible] = useState(false);
  const [selectedCardForManual, setSelectedCardForManual] = useState<CreditCard | null>(null);
  const [manualStatementMode, setManualStatementMode] = useState<'opening_balance' | 'statement' | undefined>(undefined);

  const [amortizationModalVisible, setAmortizationModalVisible] = useState(false);
  const [selectedPurchase, setSelectedPurchase] = useState<CardPurchase | null>(null);
  const [selectedPurchaseCard, setSelectedPurchaseCard] = useState<CreditCard | null>(null);

  const [addPurchaseModalVisible, setAddPurchaseModalVisible] = useState(false);

  const totalCreditLimit = creditCards.reduce((sum, c) => sum + c.creditLimit, 0);
  const totalAvailable = creditCards.reduce((sum, c) => sum + c.availableLimit, 0);
  const totalUsedDebt = totalCreditLimit - totalAvailable;
  const totalPaymentThisMonth = cardStatements.reduce((sum, s) => sum + s.totalToPayThisMonth, 0);

  const handleOpenCreateCard = () => {
    setSelectedCardToEdit(null);
    setAddCardModalVisible(true);
  };

  const handleCardCreated = (newCard: CreditCard) => {
    showConfirm(
      '¿Ya utilizabas esta tarjeta?',
      'Usa esta opción si ya utilizabas esta tarjeta antes de agregarla a la app para configurar su saldo actual. Si es una tarjeta nueva sin movimientos previos, puedes empezar desde cero.',
      () => handleOpenManualStatement(newCard, 'opening_balance'),
      'Configurar saldo actual',
      'Empezar desde cero'
    );
  };

  const handleOpenEditCard = (card: CreditCard) => {
    setSelectedCardToEdit(card);
    setAddCardModalVisible(true);
  };

  const handleDeleteCard = (card: CreditCard) => {
    showConfirm(
      'Eliminar Tarjeta',
      `¿Estás seguro de que deseas eliminar la tarjeta "${card.name}" (${card.bankName})? Si tiene compras o movimientos registrados pasará a estado archivado para preservar tu integridad contable.`,
      async () => {
        await deleteCreditCard(card.id);
        showSuccess('Tarjeta Procesada', `La tarjeta ${card.name} fue gestionada correctamente.`);
      },
      'Eliminar / Archivar',
      'Cancelar',
      true
    );
  };

  const handleOpenStatement = (card: CreditCard) => {
    const stmt = cardStatements.find((s) => s.cardId === card.id) || null;
    setSelectedCardForStatement(card);
    setSelectedStatement(stmt);
    setStatementModalVisible(true);
  };

  const handleOpenPay = (card: CreditCard) => {
    const stmt = cardStatements.find((s) => s.cardId === card.id) || null;
    setSelectedCardForPay(card);
    setSelectedStatementForPay(stmt);
    setPayModalVisible(true);
  };

  const handleOpenReconcile = (card: CreditCard) => {
    setSelectedCardForReconcile(card);
    setReconcileModalVisible(true);
  };

  const handleOpenManualStatement = (card: CreditCard, mode?: 'opening_balance' | 'statement') => {
    const stmt = cardStatements.find((s) => s.cardId === card.id) || null;
    setSelectedCardForManual(card);
    setSelectedStatement(stmt);
    setManualStatementMode(mode);
    setManualStatementModalVisible(true);
  };

  const handleOpenAmortization = (purchase: CardPurchase) => {
    const card = creditCards.find((c) => c.id === purchase.cardId) || null;
    setSelectedPurchase(purchase);
    setSelectedPurchaseCard(card);
    setAmortizationModalVisible(true);
  };

  return (
    <View style={styles.safeArea}>
      <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <View style={{ flex: 1, marginRight: 8 }}>
            <Text style={styles.tag}>GESTIÓN DE CRÉDITO</Text>
            <Text style={styles.title}>Tarjetas</Text>
          </View>
          <TouchableOpacity
            style={styles.addCardBtn}
            onPress={handleOpenCreateCard}
          >
            <CustomIcon name="Plus" size={16} color="#FFFFFF" />
            <Text style={styles.addCardBtnText}>Nueva Tarjeta</Text>
          </TouchableOpacity>
        </View>

        {/* Resumen Global de Tarjetas */}
        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>Resumen Consolidado de Crédito</Text>

          <View style={styles.statsGrid}>
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>Total Facturado Pendiente</Text>
              <Text style={[styles.statValue, { color: '#F59E0B' }]}>
                {formatCurrency(totalPaymentThisMonth, currency)}
              </Text>
            </View>

            <View style={styles.statBox}>
              <Text style={styles.statLabel}>Deuda Total Acumulada</Text>
              <Text style={[styles.statValue, { color: '#EF4444' }]}>
                {formatCurrency(totalUsedDebt, currency)}
              </Text>
            </View>
          </View>

          <View style={styles.limitBarSection}>
            <View style={styles.limitRow}>
              <Text style={styles.limitSub}>Cupo Total: {formatCurrency(totalCreditLimit, currency)}</Text>
              <Text style={[styles.limitSub, { color: '#10B981', fontWeight: 'bold' }]}>
                Disponible: {formatCurrency(totalAvailable, currency)}
              </Text>
            </View>
            <View style={styles.barBg}>
              <View
                style={[
                  styles.barFill,
                  {
                    width: `${totalCreditLimit > 0 ? (totalAvailable / totalCreditLimit) * 100 : 0}%`,
                  },
                ]}
              />
            </View>
          </View>
        </View>

        {/* Tarjetas de Crédito Registradas */}
        <View style={styles.sectionHeadingRow}>
          <Text style={styles.sectionHeading}>Tus Tarjetas ({creditCards.length})</Text>
          <TouchableOpacity
            style={styles.newPurchaseQuick}
            onPress={() => setAddPurchaseModalVisible(true)}
          >
            <CustomIcon name="ShoppingBag" size={14} color="#818CF8" />
            <Text style={styles.newPurchaseQuickText}>+ Compra a Cuotas</Text>
          </TouchableOpacity>
        </View>

        {creditCards.length === 0 ? (
          <View style={styles.emptyState}>
            <CustomIcon name="CreditCard" size={36} color="#64748B" />
            <Text style={styles.emptyTitle}>Sin tarjetas registradas</Text>
            <Text style={styles.emptyText}>
              Agrega tus tarjetas de crédito para simular cuotas, imputación de pagos, conciliación y extractos.
            </Text>
            <TouchableOpacity
              style={styles.emptyBtn}
              onPress={() => setAddCardModalVisible(true)}
            >
              <Text style={styles.emptyBtnText}>Agregar Tarjeta</Text>
            </TouchableOpacity>
          </View>
        ) : (
          creditCards.map((card) => {
            const stmt = cardStatements.find((s) => s.cardId === card.id);
            const cardPurchases = activePurchases.filter((p) => p.cardId === card.id);

            // Estado del extracto
            let statusBadge = { label: 'AL DÍA', color: '#10B981', bg: 'rgba(16, 185, 129, 0.15)' };
            if (stmt?.statementStatus === 'paid') {
              statusBadge = { label: 'EXTRACTO PAGADO', color: '#10B981', bg: 'rgba(16, 185, 129, 0.2)' };
            } else if (stmt?.statementStatus === 'minimum_covered') {
              statusBadge = { label: 'MÍNIMO CUBIERTO', color: '#38BDF8', bg: 'rgba(56, 189, 248, 0.2)' };
            } else if (stmt?.statementStatus === 'overdue') {
              statusBadge = { label: 'VENCIDO', color: '#EF4444', bg: 'rgba(239, 68, 68, 0.2)' };
            } else if (stmt?.statementStatus === 'partially_paid') {
              statusBadge = { label: 'ABONO PARCIAL', color: '#F59E0B', bg: 'rgba(245, 158, 11, 0.2)' };
            }

            return (
              <View key={card.id} style={styles.cardWrapper}>
                {/* Header superior de la tarjeta con emisor y acciones */}
                <View style={styles.cardHeaderActions}>
                  <View style={[styles.statusBadgePill, { backgroundColor: statusBadge.bg }]}>
                    <Text style={[styles.statusBadgeText, { color: statusBadge.color }]}>
                      {statusBadge.label}
                    </Text>
                  </View>

                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <TouchableOpacity
                      style={styles.editCardBtn}
                      onPress={() => handleOpenEditCard(card)}
                    >
                      <CustomIcon name="Edit3" size={13} color="#CBD5E1" />
                      <Text style={styles.editCardBtnText}>Editar</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.deleteCardBtn}
                      onPress={() => handleDeleteCard(card)}
                    >
                      <CustomIcon name="Trash2" size={13} color="#EF4444" />
                      <Text style={styles.deleteCardBtnText}>Eliminar</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Componente Visual de Tarjeta */}
                <CreditCardVisual
                  card={card}
                  statement={stmt}
                  onViewStatement={() => handleOpenStatement(card)}
                  onAddPurchase={() => setAddPurchaseModalVisible(true)}
                  onPayCard={() => handleOpenPay(card)}
                />

                {/* Banner no invasivo para tarjetas sin saldo inicial configurado */}
                {!stmt?.hasOpeningBalance && (
                  <View style={styles.openingBalanceBanner}>
                    <View style={styles.openingBalanceIconBox}>
                      <CustomIcon name="Sliders" size={15} color="#818CF8" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.openingBalanceTitle}>Configurar saldo actual</Text>
                      <Text style={styles.openingBalanceSub}>
                        Usa esta opción si ya utilizabas esta tarjeta antes de agregarla a la app.
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={styles.openingBalanceBtn}
                      onPress={() => handleOpenManualStatement(card, 'opening_balance')}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.openingBalanceBtnText}>Configurar</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {/* Barra de Acciones de Tarjeta */}
                <View style={styles.cardActionsBar}>
                  <TouchableOpacity
                    style={[styles.cardActionBtn, styles.cardActionBtnPrimary]}
                    onPress={() => handleOpenPay(card)}
                    activeOpacity={0.7}
                  >
                    <CustomIcon name="CreditCard" size={13} color="#FFFFFF" />
                    <Text style={styles.cardActionBtnTextPrimary}>Pagar</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.cardActionBtn}
                    onPress={() => handleOpenStatement(card)}
                    activeOpacity={0.7}
                  >
                    <CustomIcon name="FileText" size={13} color="#CBD5E1" />
                    <Text style={styles.cardActionBtnText}>Extracto</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.cardActionBtn}
                    onPress={() => handleOpenReconcile(card)}
                    activeOpacity={0.7}
                  >
                    <CustomIcon name="ShieldCheck" size={13} color="#CBD5E1" />
                    <Text style={styles.cardActionBtnText}>Conciliar</Text>
                  </TouchableOpacity>

                  {!stmt?.hasOpeningBalance ? (
                    <TouchableOpacity
                      style={[styles.cardActionBtn, styles.cardActionBtnAccent]}
                      onPress={() => handleOpenManualStatement(card, 'opening_balance')}
                      activeOpacity={0.7}
                    >
                      <CustomIcon name="Sliders" size={13} color="#818CF8" />
                      <Text style={[styles.cardActionBtnText, { color: '#818CF8', fontWeight: 'bold' }]}>
                        Saldo Inicial
                      </Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      style={styles.cardActionBtn}
                      onPress={() => handleOpenManualStatement(card, 'statement')}
                      activeOpacity={0.7}
                    >
                      <CustomIcon name="Plus" size={13} color="#CBD5E1" />
                      <Text style={styles.cardActionBtnText}>+ Cifras</Text>
                    </TouchableOpacity>
                  )}
                </View>

                {/* Compras a cuotas específicas de esta tarjeta */}
                {cardPurchases.length > 0 && (
                  <View style={styles.cardPurchasesList}>
                    <Text style={styles.cardPurchasesTitle}>Compras a Cuotas en {card.name}:</Text>
                    {cardPurchases.map((p) => (
                      <TouchableOpacity
                        key={p.id}
                        style={styles.purchaseRow}
                        onPress={() => handleOpenAmortization(p)}
                        activeOpacity={0.7}
                      >
                        <View style={styles.pLeft}>
                          <Text style={styles.pTitle}>{p.description}</Text>
                          <Text style={styles.pSub}>
                            Cuota {p.installmentsPaid} de {p.installmentsTotal} ({p.interestRateMonthly}% E.M.)
                          </Text>
                        </View>
                        <View style={styles.pRight}>
                          <Text style={styles.pQuota}>
                            {formatCurrency(p.monthlyInstallmentAmount, currency)}/m
                          </Text>
                          <View style={styles.detailsBadge}>
                            <Text style={styles.detailsText}>Ver tabla</Text>
                            <CustomIcon name="ChevronRight" size={12} color="#818CF8" />
                          </View>
                        </View>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>
            );
          })
        )}

        <View style={{ height: 90 }} />
      </ScrollView>

      {/* Modales */}
      <AddCreditCardModal
        visible={addCardModalVisible}
        cardToEdit={selectedCardToEdit}
        onCardCreated={handleCardCreated}
        onClose={() => {
          setAddCardModalVisible(false);
          setSelectedCardToEdit(null);
        }}
      />

      <PayCardModal
        visible={payModalVisible}
        card={selectedCardForPay}
        statementSummary={selectedStatementForPay}
        onClose={() => {
          setPayModalVisible(false);
          setSelectedCardForPay(null);
        }}
      />

      <ReconcileCardModal
        visible={reconcileModalVisible}
        card={selectedCardForReconcile}
        statementSummary={selectedStatement}
        onClose={() => {
          setReconcileModalVisible(false);
          setSelectedCardForReconcile(null);
        }}
      />

      <ManualStatementModal
        visible={manualStatementModalVisible}
        card={selectedCardForManual}
        statementSummary={selectedStatement}
        initialMode={manualStatementMode}
        onClose={() => {
          setManualStatementModalVisible(false);
          setSelectedCardForManual(null);
          setSelectedStatement(null);
          setManualStatementMode(undefined);
        }}
      />

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
        visible={addPurchaseModalVisible}
        defaultType="card_purchase"
        onClose={() => setAddPurchaseModalVisible(false)}
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
  addCardBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Theme.colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    gap: 4,
  },
  addCardBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  summaryCard: {
    backgroundColor: Theme.colors.surfaceCard,
    borderRadius: 18,
    padding: 16,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  summaryTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  statBox: {
    flex: 1,
    backgroundColor: Theme.colors.surfaceElevated,
    borderRadius: 12,
    padding: 10,
  },
  statLabel: {
    color: '#94A3B8',
    fontSize: 11,
  },
  statValue: {
    fontSize: 16,
    fontWeight: 'bold',
    marginTop: 4,
  },
  limitBarSection: {},
  limitRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  limitSub: {
    color: '#94A3B8',
    fontSize: 11,
  },
  barBg: {
    height: 7,
    backgroundColor: '#334155',
    borderRadius: 4,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    backgroundColor: '#10B981',
    borderRadius: 4,
  },
  sectionHeadingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionHeading: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  newPurchaseQuick: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(99, 102, 241, 0.15)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  newPurchaseQuickText: {
    color: '#818CF8',
    fontSize: 11,
    fontWeight: 'bold',
  },
  cardWrapper: {
    marginBottom: 20,
  },
  cardHeaderActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  statusBadgePill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  editCardBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#1E293B',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  editCardBtnText: {
    color: '#CBD5E1',
    fontSize: 11.5,
    fontWeight: '600',
  },
  deleteCardBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  deleteCardBtnText: {
    color: '#EF4444',
    fontSize: 11.5,
    fontWeight: 'bold',
  },
  cardActionsBar: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
    marginBottom: 10,
  },
  cardActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    backgroundColor: Theme.colors.surfaceElevated,
    borderRadius: 10,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  cardActionBtnPrimary: {
    backgroundColor: Theme.colors.primary,
    borderColor: Theme.colors.primary,
  },
  cardActionBtnAccent: {
    backgroundColor: 'rgba(99, 102, 241, 0.12)',
    borderColor: 'rgba(99, 102, 241, 0.35)',
  },
  cardActionBtnText: {
    color: '#CBD5E1',
    fontSize: 11.5,
    fontWeight: '600',
  },
  cardActionBtnTextPrimary: {
    color: '#FFFFFF',
    fontSize: 11.5,
    fontWeight: 'bold',
  },
  openingBalanceBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(99, 102, 241, 0.08)',
    borderRadius: 12,
    padding: 12,
    marginTop: 8,
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.25)',
    gap: 10,
  },
  openingBalanceIconBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(99, 102, 241, 0.18)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  openingBalanceTitle: {
    color: '#FFFFFF',
    fontSize: 12.5,
    fontWeight: 'bold',
  },
  openingBalanceSub: {
    color: '#94A3B8',
    fontSize: 11,
    marginTop: 2,
    lineHeight: 15,
  },
  openingBalanceBtn: {
    backgroundColor: '#6366F1',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  openingBalanceBtnText: {
    color: '#FFFFFF',
    fontSize: 11.5,
    fontWeight: 'bold',
  },
  cardPurchasesList: {
    backgroundColor: Theme.colors.surfaceCard,
    borderRadius: 14,
    padding: 12,
    marginTop: -6,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  cardPurchasesTitle: {
    color: '#CBD5E1',
    fontSize: 12,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  purchaseRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.06)',
  },
  pLeft: {
    flex: 1,
  },
  pTitle: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  pSub: {
    color: '#94A3B8',
    fontSize: 11,
    marginTop: 1,
  },
  pRight: {
    alignItems: 'flex-end',
  },
  pQuota: {
    color: '#34D399',
    fontSize: 13,
    fontWeight: 'bold',
  },
  detailsBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    marginTop: 2,
  },
  detailsText: {
    color: '#818CF8',
    fontSize: 10,
    fontWeight: '600',
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
