# 💰 Control de Gastos & Tarjetas de Crédito (Android)

Aplicación móvil nativa para **Android** desarrollada con **React Native + Expo SDK 57** y **SQLite Local**. Diseñada para llevar el control completo de gastos del día a día, cuentas bancarias, billeteras digitales y un módulo financiero avanzado para tarjetas de crédito con amortización de cuotas, intereses, fechas de corte y fechas límite de pago.

---

## 🚀 Características Principales

### 💳 1. Módulo Especializado de Tarjetas de Crédito
- **Control de Cupo:** Cupo total, cupo disponible y porcentaje de uso en tiempo real con indicador visual.
- **Fechas de Facturación:** Control de **Día de Corte** y **Día Límite de Pago** con conteo regresivo de días y alertas de vencimiento.
- **Compras a Cuotas (Financiación):**
  - Registro de compras de 1 a 36 cuotas.
  - Tasa de interés mensual configurable (% E.M.) y convertidor desde Tasa Efectiva Anual (% E.A.).
  - **Tabla de amortización detallada (Sistema Francés):** Desglose de Capital, Intereses, Total por cuota y estado (Pagada / Pendiente).
  - Botón de **"Pagar Cuota"** que libera cupo en la tarjeta y descuenta el saldo de tu cuenta bancaria seleccionada.
- **Simulador de Extracto Mensual:**
  - Proyección de cobro del mes consolidando: Compras a 1 cuota + Cuotas diferidas del mes + Intereses estimados + Cuota de manejo.
  - Opciones de **Pago Total**, **Pago Mínimo** o **Abono personalizado** directamente desde la app.

### 🏦 2. Cuentas Bancarias & Billeteras Digitales
- Soporte para **Cuentas de Ahorros, Corrientes, Nequi, Daviplata, Efectivo e Inversiones**.
- Saldo consolidado en tiempo real y cálculo de **Patrimonio Neto** (Total Cuentas - Deuda de Tarjetas).
- Registro de **Transferencias entre Cuentas** con sincronización automática de saldos.

### 📊 3. Gastos e Ingresos Diarios
- Registro ágil de gastos con categorización automática (Alimentación, Transporte, Servicios, Ocio, Salud, etc.).
- Historial filtrable por mes, tipo de transacción y buscador por texto/notas.
- Resumen mensual de Ingresos, Gastos y Balance neto.

### 🔒 4. Privacidad y Funcionamiento Offline
- Almacenamiento **100% local con SQLite (`expo-sqlite`)**.
- Tus datos financieros nunca salen de tu dispositivo y funcionan **sin necesidad de conexión a internet**.

---

## 📱 Cómo Probar la App en tu Celular Android

### Opción 1: Probar en Tiempo Real con Expo Go (Recomendado)
1. Instala la app gratuita **Expo Go** desde la [Google Play Store](https://play.google.com/store/apps/details?id=host.exp.exponent) en tu celular Android.
2. Abre la terminal en esta carpeta y ejecuta:
   ```bash
   npx expo start
   ```
3. En la terminal aparecerá un código QR.
4. Abre la app **Expo Go** en tu celular, pulsa **"Scan QR code"** y escanea el código de la terminal.
5. ¡La app cargará en tu celular en cuestión de segundos y podrás interactuar con todas las pantallas y funciones!

---

## 🛠️ Generar el Archivo APK Instalable para Android
Para compilar un archivo `.apk` instalable de forma directa en cualquier teléfono Android:
1. Instala EAS CLI:
   ```bash
   npm install -g eas-cli
   ```
2. Inicia sesión en tu cuenta de Expo:
   ```bash
   eas login
   ```
3. Configura el build para generar APK:
   ```bash
   eas build:configure
   ```
4. Genera el APK:
   ```bash
   eas build -p android --profile preview
   ```

---

## 📁 Estructura del Código
```
├── App.tsx                        # Punto de entrada y barra de navegación flotante
├── src/
│   ├── context/
│   │   └── FinancialContext.tsx   # Estado global de finanzas y sincronización con SQLite
│   ├── database/
│   │   ├── database.ts            # Esquema relacional SQLite
│   │   ├── seedDemoData.ts        # Generador de datos de demostración inicial
│   │   └── repositories/          # Repositorios CRUD para cuentas, tarjetas, cuotas y gastos
│   ├── utils/
│   │   ├── financialMath.ts       # Fórmulas de amortización, interés mensual y ciclos de corte
│   │   └── formatters.ts          # Formateador de moneda (COP/USD) y fechas en español
│   ├── components/
│   │   ├── common/                # Tokens de diseño, temas y renderizado de iconos
│   │   ├── cards/                 # Visualizador de tarjetas, amortizaciones y extracto simulado
│   │   ├── accounts/              # Tarjetas de cuentas y modal de creación
│   │   └── transactions/          # Modal multidimensional y filas de transacciones
│   └── screens/
│       ├── DashboardScreen.tsx    # Pantalla principal con resumen y patrimonio neto
│       ├── CardsScreen.tsx        # Centro de tarjetas de crédito y cuotas activas
│       ├── AccountsScreen.tsx     # Gestión de cuentas y transferencias
│       ├── TransactionsScreen.tsx # Historial con filtros por mes y tipo
│       └── SettingsScreen.tsx     # Configuración de moneda y gestión de datos
```
