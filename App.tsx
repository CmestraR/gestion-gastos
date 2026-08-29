import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  StatusBar,
  Platform,
} from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { FinancialProvider, useFinancial } from './src/context/FinancialContext';
import { AlertProvider } from './src/context/AlertContext';
import { NotificationService } from './src/utils/notificationService';
import { DashboardScreen } from './src/screens/DashboardScreen';
import { CardsScreen } from './src/screens/CardsScreen';
import { AccountsScreen } from './src/screens/AccountsScreen';
import { TransactionsScreen } from './src/screens/TransactionsScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { AddTransactionModal } from './src/components/transactions/AddTransactionModal';
import { Theme } from './src/components/common/Theme';
import { CustomIcon } from './src/components/common/CustomIcon';

function MainApp() {
  const { isLoading, creditCards } = useFinancial();
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<'dashboard' | 'cards' | 'accounts' | 'transactions' | 'settings'>('dashboard');
  const [filterAccountId, setFilterAccountId] = useState<string | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  useEffect(() => {
    NotificationService.init();
    if (creditCards && creditCards.length > 0) {
      NotificationService.scheduleCardReminders(creditCards);
    }
  }, [creditCards]);

  // Espacio seguro superior e inferior para Android (POCO / Notch / Isla Dinámica)
  const topSafePadding = Math.max(
    insets.top,
    Platform.OS === 'android' ? (StatusBar.currentHeight || 28) : 0
  ) + 6;

  const bottomSafePadding = Math.max(insets.bottom, 8);

  const handleNavigateToTab = (
    tab: string,
    params?: { accountId?: string }
  ) => {
    if (params?.accountId) {
      setFilterAccountId(params.accountId);
    } else if (tab === 'transactions') {
      setFilterAccountId(null);
    }
    setActiveTab(tab as any);
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <StatusBar barStyle="light-content" backgroundColor={Theme.colors.background} />
        <ActivityIndicator size="large" color={Theme.colors.primary} />
        <Text style={styles.loadingText}>Cargando tus finanzas...</Text>
      </View>
    );
  }

  const renderActiveScreen = () => {
    switch (activeTab) {
      case 'dashboard':
        return <DashboardScreen onNavigateToTab={handleNavigateToTab} />;
      case 'cards':
        return <CardsScreen />;
      case 'accounts':
        return <AccountsScreen />;
      case 'transactions':
        return (
          <TransactionsScreen
            filterAccountId={filterAccountId}
            onClearAccountFilter={() => setFilterAccountId(null)}
          />
        );
      case 'settings':
        return <SettingsScreen />;
      default:
        return <DashboardScreen onNavigateToTab={handleNavigateToTab} />;
    }
  };

  const navItems = [
    { id: 'dashboard', label: 'Inicio', icon: 'LayoutDashboard' },
    { id: 'cards', label: 'Tarjetas', icon: 'CreditCard' },
    { id: 'add_action', label: 'Nuevo', icon: 'Plus', isAction: true },
    { id: 'accounts', label: 'Cuentas', icon: 'Landmark' },
    { id: 'transactions', label: 'Historial', icon: 'Receipt' },
  ];

  return (
    <View style={[styles.container, { paddingTop: topSafePadding }]}>
      <StatusBar
        barStyle="light-content"
        backgroundColor={Theme.colors.background}
        translucent={true}
      />

      {/* Pantalla Activa */}
      <View style={styles.screenContainer}>{renderActiveScreen()}</View>

      {/* Barra de Navegación Inferior Flotante con Botón Central */}
      <View style={[styles.bottomNavWrapper, { paddingBottom: bottomSafePadding }]}>
        <View style={styles.bottomNav}>
          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            const isCenterAction = item.isAction;

            if (isCenterAction) {
              return (
                <TouchableOpacity
                  key={item.id}
                  style={styles.centerNavBtn}
                  onPress={() => setIsAddModalOpen(true)}
                  activeOpacity={0.8}
                >
                  <View style={styles.centerIconWrapper}>
                    <CustomIcon name="Plus" size={24} color="#FFFFFF" />
                  </View>
                  <Text style={styles.centerNavLabel}>{item.label}</Text>
                </TouchableOpacity>
              );
            }

            return (
              <TouchableOpacity
                key={item.id}
                style={styles.navTab}
                onPress={() => {
                  if (item.id === 'transactions') {
                    setFilterAccountId(null);
                  }
                  setActiveTab(item.id as any);
                }}
                activeOpacity={0.7}
              >
                <View
                  style={[
                    styles.iconWrapper,
                    isActive && styles.iconWrapperActive,
                  ]}
                >
                  <CustomIcon
                    name={item.icon}
                    size={19}
                    color={isActive ? '#FFFFFF' : '#64748B'}
                  />
                </View>
                <Text
                  style={[
                    styles.navLabel,
                    isActive && styles.navLabelActive,
                  ]}
                >
                  {item.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Modal Global de Transacción Rápida */}
      <AddTransactionModal
        visible={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
      />
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AlertProvider>
        <FinancialProvider>
          <MainApp />
        </FinancialProvider>
      </AlertProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Theme.colors.background,
  },
  screenContainer: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: Theme.colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    color: '#94A3B8',
    fontSize: 14,
    fontWeight: '500',
  },
  bottomNavWrapper: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'transparent',
    paddingHorizontal: 12,
  },
  bottomNav: {
    flexDirection: 'row',
    backgroundColor: 'rgba(17, 24, 39, 0.96)',
    borderRadius: 26,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: '#1E293B',
    alignItems: 'center',
    elevation: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
  },
  navTab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
  },
  iconWrapper: {
    width: 36,
    height: 30,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconWrapperActive: {
    backgroundColor: Theme.colors.primary,
  },
  centerNavBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    marginTop: -10, // Eleva el botón central para máxima ergonomía
  },
  centerIconWrapper: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#10B981',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 8,
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45,
    shadowRadius: 8,
    borderWidth: 3,
    borderColor: '#0F172A',
  },
  centerNavLabel: {
    color: '#34D399',
    fontSize: 10,
    fontWeight: '700',
    marginTop: 2,
  },
  navLabel: {
    color: '#64748B',
    fontSize: 10,
    fontWeight: '600',
    marginTop: 2,
  },
  navLabelActive: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
});
