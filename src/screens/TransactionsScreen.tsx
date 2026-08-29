import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Dimensions,
} from 'react-native';
import { useFinancial } from '../context/FinancialContext';
import { TransactionItem } from '../components/transactions/TransactionItem';
import { AddTransactionModal } from '../components/transactions/AddTransactionModal';
import { formatCurrency, getMonthName } from '../utils/formatters';
import { Theme } from '../components/common/Theme';
import { CustomIcon } from '../components/common/CustomIcon';

const { width } = Dimensions.get('window');

interface TransactionsScreenProps {
  filterAccountId?: string | null;
  onClearAccountFilter?: () => void;
}

export const TransactionsScreen: React.FC<TransactionsScreenProps> = ({
  filterAccountId,
  onClearAccountFilter,
}) => {
  const { transactions, categories, accounts, currency } = useFinancial();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedType, setSelectedType] = useState<string>('all');
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(filterAccountId || null);
  const [searchQuery, setSearchQuery] = useState('');
  const [addTxVisible, setAddTxVisible] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'chart'>('list');

  // Sincronizar cuando cambie la prop desde afuera
  React.useEffect(() => {
    if (filterAccountId !== undefined) {
      setSelectedAccountId(filterAccountId);
    }
  }, [filterAccountId]);

  const activeAccount = accounts.find((a) => a.id === selectedAccountId);

  // Mes y Año en formato YYYY-MM
  const currentYearMonth = useMemo(() => {
    const year = selectedDate.getFullYear();
    const month = String(selectedDate.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  }, [selectedDate]);

  const handlePrevMonth = () => {
    setSelectedDate(new Date(selectedDate.getFullYear(), selectedDate.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setSelectedDate(new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 1));
  };

  // Filtrar transacciones por mes, tipo y búsqueda
  const filteredTransactions = useMemo(() => {
    return transactions.filter((tx) => {
      // Filtro de mes
      if (!tx.date.startsWith(currentYearMonth)) return false;

      // Filtro de tipo
      if (selectedType !== 'all') {
        if (selectedType === 'expense' && tx.type !== 'expense') return false;
        if (selectedType === 'income' && tx.type !== 'income') return false;
        if (selectedType === 'transfer' && tx.type !== 'transfer') return false;
        if (selectedType === 'card_purchase' && tx.type !== 'card_purchase') return false;
      }

      // Filtro de cuenta específica
      if (selectedAccountId) {
        const matchAcc = tx.accountId === selectedAccountId || tx.toAccountId === selectedAccountId;
        if (!matchAcc) return false;
      }

      // Filtro de búsqueda
      if (searchQuery.trim() !== '') {
        const q = searchQuery.toLowerCase();
        const matchDesc = tx.description.toLowerCase().includes(q);
        const matchNotes = tx.notes?.toLowerCase().includes(q);
        if (!matchDesc && !matchNotes) return false;
      }

      return true;
    });
  }, [transactions, currentYearMonth, selectedType, selectedAccountId, searchQuery]);

  // Totales del mes seleccionado
  const monthTotals = useMemo(() => {
    let income = 0;
    let expense = 0;

    for (const tx of filteredTransactions) {
      if (tx.type === 'income') income += tx.amount;
      if (tx.type === 'expense' || tx.type === 'card_purchase') expense += tx.amount;
    }

    return { income, expense, balance: income - expense };
  }, [filteredTransactions]);

  // Datos para la vista gráfica por categorías
  const categoryStats = useMemo(() => {
    const expenseByCategory: Record<string, number> = {};
    const incomeByCategory: Record<string, number> = {};

    filteredTransactions.forEach((tx) => {
      if (tx.type === 'expense' || tx.type === 'card_purchase') {
        expenseByCategory[tx.categoryId] = (expenseByCategory[tx.categoryId] || 0) + tx.amount;
      } else if (tx.type === 'income') {
        incomeByCategory[tx.categoryId] = (incomeByCategory[tx.categoryId] || 0) + tx.amount;
      }
    });

    const expenseList = Object.keys(expenseByCategory)
      .map((catId) => {
        const cat = categories.find((c) => c.id === catId);
        const amount = expenseByCategory[catId];
        const percentage = monthTotals.expense > 0 ? (amount / monthTotals.expense) * 100 : 0;
        return {
          catId,
          name: cat?.name || 'Varios',
          icon: cat?.icon || 'ShoppingBag',
          color: cat?.color || '#EF4444',
          amount,
          percentage,
        };
      })
      .sort((a, b) => b.amount - a.amount);

    const incomeList = Object.keys(incomeByCategory)
      .map((catId) => {
        const cat = categories.find((c) => c.id === catId);
        const amount = incomeByCategory[catId];
        const percentage = monthTotals.income > 0 ? (amount / monthTotals.income) * 100 : 0;
        return {
          catId,
          name: cat?.name || 'Ingreso',
          icon: cat?.icon || 'TrendingUp',
          color: cat?.color || '#10B981',
          amount,
          percentage,
        };
      })
      .sort((a, b) => b.amount - a.amount);

    return { expenseList, incomeList };
  }, [filteredTransactions, categories, monthTotals]);

  const typeFilterChips = [
    { id: 'all', label: 'Todos' },
    { id: 'expense', label: 'Gastos' },
    { id: 'card_purchase', label: 'Tarjetas' },
    { id: 'income', label: 'Ingresos' },
    { id: 'transfer', label: 'Transferencias' },
  ];

  return (
    <View style={styles.safeArea}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.tag}>HISTORIAL</Text>
            <Text style={styles.title}>Movimientos</Text>
          </View>

          {/* Toggle Vista Lista / Vista Gráfica */}
          <View style={styles.viewToggle}>
            <TouchableOpacity
              style={[styles.toggleBtn, viewMode === 'list' && styles.toggleBtnActive]}
              onPress={() => setViewMode('list')}
            >
              <CustomIcon name="List" size={16} color={viewMode === 'list' ? '#FFFFFF' : '#94A3B8'} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.toggleBtn, viewMode === 'chart' && styles.toggleBtnActive]}
              onPress={() => setViewMode('chart')}
            >
              <CustomIcon name="BarChart3" size={16} color={viewMode === 'chart' ? '#FFFFFF' : '#94A3B8'} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Selector de Mes */}
        <View style={styles.monthSelector}>
          <TouchableOpacity onPress={handlePrevMonth} style={styles.monthArrow}>
            <CustomIcon name="ChevronLeft" size={20} color="#CBD5E1" />
          </TouchableOpacity>
          <View style={styles.monthTitleBox}>
            <CustomIcon name="Calendar" size={15} color="#818CF8" />
            <Text style={styles.monthTitleText}>
              {getMonthName(selectedDate.getMonth())} {selectedDate.getFullYear()}
            </Text>
          </View>
          <TouchableOpacity onPress={handleNextMonth} style={styles.monthArrow}>
            <CustomIcon name="ChevronRight" size={20} color="#CBD5E1" />
          </TouchableOpacity>
        </View>

        {/* Resumen del Mes Filtrado */}
        <View style={styles.summaryBar}>
          <View style={styles.summaryCol}>
            <Text style={styles.summaryLabel}>Ingresos</Text>
            <Text style={[styles.summaryVal, { color: '#10B981' }]}>
              +{formatCurrency(monthTotals.income, currency)}
            </Text>
          </View>
          <View style={styles.summaryCol}>
            <Text style={styles.summaryLabel}>Gastos</Text>
            <Text style={[styles.summaryVal, { color: '#EF4444' }]}>
              -{formatCurrency(monthTotals.expense, currency)}
            </Text>
          </View>
          <View style={styles.summaryCol}>
            <Text style={styles.summaryLabel}>Balance</Text>
            <Text style={[styles.summaryVal, { color: monthTotals.balance >= 0 ? '#34D399' : '#F87171' }]}>
              {formatCurrency(monthTotals.balance, currency)}
            </Text>
          </View>
        </View>

        {/* Barra de Búsqueda y Filtros de Tipo */}
        <View style={styles.searchRow}>
          <View style={styles.searchInputBox}>
            <CustomIcon name="Search" size={16} color="#64748B" />
            <TextInput
              style={styles.searchInput}
              placeholder="Buscar movimiento..."
              placeholderTextColor="#64748B"
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <CustomIcon name="X" size={14} color="#94A3B8" />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Chips de Categorías / Filtros */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.filterChipsRow}
          contentContainerStyle={styles.filterChipsContent}
        >
          {typeFilterChips.map((chip) => {
            const isSelected = selectedType === chip.id;
            return (
              <TouchableOpacity
                key={chip.id}
                style={[styles.filterChip, isSelected && styles.filterChipSelected]}
                onPress={() => setSelectedType(chip.id)}
              >
                <Text style={[styles.filterChipText, isSelected && styles.filterChipTextSelected]}>
                  {chip.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Chips de Cuentas */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.accountChipsRow}
          contentContainerStyle={styles.accountChipsContent}
        >
          <TouchableOpacity
            style={[styles.accountChip, !selectedAccountId && styles.accountChipSelected]}
            onPress={() => {
              setSelectedAccountId(null);
              onClearAccountFilter?.();
            }}
          >
            <CustomIcon name="Layers" size={13} color={!selectedAccountId ? '#FFFFFF' : '#94A3B8'} />
            <Text style={[styles.accountChipText, !selectedAccountId && styles.accountChipTextSelected]}>
              Todas las Cuentas
            </Text>
          </TouchableOpacity>
          {accounts.map((acc) => {
            const isSelected = selectedAccountId === acc.id;
            return (
              <TouchableOpacity
                key={acc.id}
                style={[
                  styles.accountChip,
                  isSelected && { backgroundColor: acc.color, borderColor: acc.color },
                ]}
                onPress={() => {
                  if (isSelected) {
                    setSelectedAccountId(null);
                    onClearAccountFilter?.();
                  } else {
                    setSelectedAccountId(acc.id);
                  }
                }}
              >
                <CustomIcon name={acc.icon || 'Landmark'} size={13} color={isSelected ? '#FFFFFF' : acc.color} />
                <Text style={[styles.accountChipText, isSelected && styles.accountChipTextSelected]}>
                  {acc.name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Banner de Filtro Activo por Cuenta */}
        {activeAccount && (
          <View style={styles.activeFilterBanner}>
            <View style={styles.activeFilterLeft}>
              <CustomIcon name={activeAccount.icon || 'Landmark'} size={14} color={activeAccount.color} />
              <Text style={styles.activeFilterText}>
                Filtrando por: <Text style={{ color: '#FFFFFF', fontWeight: 'bold' }}>{activeAccount.name}</Text>
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => {
                setSelectedAccountId(null);
                onClearAccountFilter?.();
              }}
              style={styles.clearFilterBadge}
            >
              <CustomIcon name="X" size={12} color="#CBD5E1" />
              <Text style={styles.clearFilterText}>Quitar</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Vista Lista o Vista Gráfica */}
        {viewMode === 'list' ? (
          <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
            {filteredTransactions.length === 0 ? (
              <View style={styles.emptyState}>
                <CustomIcon name="Receipt" size={36} color="#64748B" />
                <Text style={styles.emptyTitle}>Sin movimientos</Text>
                <Text style={styles.emptySub}>
                  No hay transacciones que coincidan con los filtros para este mes.
                </Text>
              </View>
            ) : (
              filteredTransactions.map((tx) => (
                <TransactionItem key={tx.id} transaction={tx} />
              ))
            )}
            <View style={{ height: 90 }} />
          </ScrollView>
        ) : (
          /* Vista Gráfica */
          <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
            {/* Gráfica de Comparación Visual Ingresos vs Gastos */}
            <View style={styles.chartCard}>
              <Text style={styles.chartTitle}>Comparación del Mes</Text>
              <View style={styles.comparisonBarContainer}>
                <View style={styles.comparisonBarRow}>
                  <Text style={styles.compBarLabel}>Ingresos</Text>
                  <View style={styles.compBarBg}>
                    <View
                      style={[
                        styles.compBarFill,
                        {
                          backgroundColor: '#10B981',
                          width: `${Math.min(100, monthTotals.income > 0 ? (monthTotals.income / (monthTotals.income + monthTotals.expense || 1)) * 100 : 0)}%`,
                        },
                      ]}
                    />
                  </View>
                  <Text style={[styles.compBarVal, { color: '#10B981' }]}>
                    {formatCurrency(monthTotals.income, currency)}
                  </Text>
                </View>

                <View style={styles.comparisonBarRow}>
                  <Text style={styles.compBarLabel}>Gastos</Text>
                  <View style={styles.compBarBg}>
                    <View
                      style={[
                        styles.compBarFill,
                        {
                          backgroundColor: '#EF4444',
                          width: `${Math.min(100, monthTotals.expense > 0 ? (monthTotals.expense / (monthTotals.income + monthTotals.expense || 1)) * 100 : 0)}%`,
                        },
                      ]}
                    />
                  </View>
                  <Text style={[styles.compBarVal, { color: '#EF4444' }]}>
                    {formatCurrency(monthTotals.expense, currency)}
                  </Text>
                </View>
              </View>
            </View>

            {/* Desglose Gráfico de Gastos por Categoría */}
            <View style={styles.chartCard}>
              <Text style={styles.chartTitle}>Gastos por Categoría</Text>
              {categoryStats.expenseList.length === 0 ? (
                <Text style={styles.emptyChartText}>No hay gastos registrados este mes.</Text>
              ) : (
                categoryStats.expenseList.map((cat) => (
                  <View key={cat.catId} style={styles.catStatRow}>
                    <View style={styles.catStatHeader}>
                      <View style={styles.catStatLeft}>
                        <View style={[styles.catStatDot, { backgroundColor: cat.color }]} />
                        <Text style={styles.catStatName}>{cat.name}</Text>
                      </View>
                      <View style={styles.catStatRight}>
                        <Text style={styles.catStatAmount}>{formatCurrency(cat.amount, currency)}</Text>
                        <Text style={styles.catStatPercent}>{cat.percentage.toFixed(1)}%</Text>
                      </View>
                    </View>
                    <View style={styles.catProgressBarBg}>
                      <View
                        style={[
                          styles.catProgressBarFill,
                          { width: `${cat.percentage}%`, backgroundColor: cat.color },
                        ]}
                      />
                    </View>
                  </View>
                ))
              )}
            </View>

            {/* Desglose Gráfico de Ingresos por Categoría */}
            <View style={styles.chartCard}>
              <Text style={styles.chartTitle}>Ingresos por Categoría</Text>
              {categoryStats.incomeList.length === 0 ? (
                <Text style={styles.emptyChartText}>No hay ingresos registrados este mes.</Text>
              ) : (
                categoryStats.incomeList.map((cat) => (
                  <View key={cat.catId} style={styles.catStatRow}>
                    <View style={styles.catStatHeader}>
                      <View style={styles.catStatLeft}>
                        <View style={[styles.catStatDot, { backgroundColor: cat.color }]} />
                        <Text style={styles.catStatName}>{cat.name}</Text>
                      </View>
                      <View style={styles.catStatRight}>
                        <Text style={styles.catStatAmount}>{formatCurrency(cat.amount, currency)}</Text>
                        <Text style={styles.catStatPercent}>{cat.percentage.toFixed(1)}%</Text>
                      </View>
                    </View>
                    <View style={styles.catProgressBarBg}>
                      <View
                        style={[
                          styles.catProgressBarFill,
                          { width: `${cat.percentage}%`, backgroundColor: cat.color },
                        ]}
                      />
                    </View>
                  </View>
                ))
              )}
            </View>

            <View style={{ height: 90 }} />
          </ScrollView>
        )}
      </View>

      <AddTransactionModal
        visible={addTxVisible}
        onClose={() => setAddTxVisible(false)}
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
    paddingVertical: 12,
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
  viewToggle: {
    flexDirection: 'row',
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 3,
    gap: 2,
    borderWidth: 1,
    borderColor: '#334155',
  },
  toggleBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  toggleBtnActive: {
    backgroundColor: '#6366F1',
  },
  monthSelector: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Theme.colors.surfaceCard,
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 12,
  },
  monthArrow: {
    padding: 6,
  },
  monthTitleBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  monthTitleText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
    textTransform: 'capitalize',
  },
  summaryBar: {
    flexDirection: 'row',
    backgroundColor: Theme.colors.surfaceCard,
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  summaryCol: {
    flex: 1,
    alignItems: 'center',
  },
  summaryLabel: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '500',
  },
  summaryVal: {
    fontSize: 13,
    fontWeight: 'bold',
    marginTop: 2,
  },
  searchRow: {
    marginBottom: 10,
  },
  searchInputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Theme.colors.surfaceCard,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 40,
    gap: 8,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  searchInput: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 13,
  },
  filterChipsRow: {
    flexGrow: 0,
    height: 36,
    marginBottom: 8,
  },
  filterChipsContent: {
    alignItems: 'center',
  },
  filterChip: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    marginRight: 6,
    borderWidth: 1,
    borderColor: '#334155',
    height: 30,
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterChipSelected: {
    backgroundColor: '#6366F1',
    borderColor: '#818CF8',
  },
  filterChipText: {
    color: '#94A3B8',
    fontSize: 11.5,
    fontWeight: '600',
  },
  filterChipTextSelected: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  accountChipsRow: {
    flexGrow: 0,
    height: 36,
    marginBottom: 8,
  },
  accountChipsContent: {
    alignItems: 'center',
  },
  accountChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#1E293B',
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: 8,
    marginRight: 6,
    borderWidth: 1,
    borderColor: '#334155',
    height: 30,
    justifyContent: 'center',
  },
  accountChipSelected: {
    backgroundColor: '#6366F1',
    borderColor: '#818CF8',
  },
  accountChipText: {
    color: '#94A3B8',
    fontSize: 11.5,
    fontWeight: '600',
  },
  accountChipTextSelected: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  activeFilterBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(99, 102, 241, 0.15)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 7,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.3)',
  },
  activeFilterLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  activeFilterText: {
    color: '#CBD5E1',
    fontSize: 12,
  },
  clearFilterBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#334155',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
  },
  clearFilterText: {
    color: '#FFFFFF',
    fontSize: 10.5,
    fontWeight: 'bold',
  },
  list: {
    flex: 1,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    gap: 8,
  },
  emptyTitle: {
    color: '#94A3B8',
    fontSize: 15,
    fontWeight: 'bold',
  },
  emptySub: {
    color: '#64748B',
    fontSize: 12,
    textAlign: 'center',
    paddingHorizontal: 30,
  },
  chartCard: {
    backgroundColor: Theme.colors.surfaceCard,
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  chartTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  emptyChartText: {
    color: '#64748B',
    fontSize: 12,
    textAlign: 'center',
    paddingVertical: 10,
  },
  comparisonBarContainer: {
    gap: 12,
  },
  comparisonBarRow: {
    gap: 4,
  },
  compBarLabel: {
    color: '#CBD5E1',
    fontSize: 12,
    fontWeight: '500',
  },
  compBarBg: {
    height: 12,
    backgroundColor: '#0F172A',
    borderRadius: 6,
    overflow: 'hidden',
  },
  compBarFill: {
    height: '100%',
    borderRadius: 6,
  },
  compBarVal: {
    fontSize: 13,
    fontWeight: 'bold',
    alignSelf: 'flex-end',
    marginTop: 2,
  },
  catStatRow: {
    marginBottom: 12,
  },
  catStatHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  catStatLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  catStatDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  catStatName: {
    color: '#E2E8F0',
    fontSize: 13,
    fontWeight: '500',
  },
  catStatRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  catStatAmount: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  catStatPercent: {
    color: '#94A3B8',
    fontSize: 11,
  },
  catProgressBarBg: {
    height: 6,
    backgroundColor: '#0F172A',
    borderRadius: 3,
    overflow: 'hidden',
  },
  catProgressBarFill: {
    height: '100%',
    borderRadius: 3,
  },
});
