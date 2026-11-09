# 📘 PROJECT_CONTEXT.md — Documentación Maestra del Proyecto KeAhorro

> **Aplicación:** KeAhorro (Control y Gestión Financiera Personal)  
> **Identificador de Paquete:** `com.cristianmestra.gestiongastos`  
> **Repositorio:** `https://github.com/CmestraR/gestion-gastos.git`  
> **Versión Actual:** v2.0.1  
> **Última Actualización:** Noviembre 2026  

---

## 1. Visión General del Proyecto

**KeAhorro** es una aplicación móvil nativa desarrollada con **React Native** y **Expo (SDK 54)** diseñada para proporcionar control financiero integral, privado y offline-first. Su núcleo contable está diseñado bajo principios matemáticos rigurosos para resolver las discrepancias típicas que los usuarios experimentan entre lo que registran en apps de gastos tradicionales y lo que realmente les cobra el banco en sus extractos y tarjetas de crédito.

### Pilares Fundamentales:
1. **Privacidad y Offline-First:** Toda la persistencia opera de forma local mediante **SQLite** (`expo-sqlite`). No requiere servidores externos para almacenar transacciones financieras sensibles.
2. **Motor Contable de Tarjetas de Crédito de Fase 2:** Cálculo exacto de 3 saldos financieros simultáneos (Deuda Total, Facturada y No Facturada), simulación de amortización de cuotas con tasa de interés mensual (% E.M.), e imputación de pagos.
3. **Conciliación Bancaria:** Mecanismo auditable para ajustar diferencias entre la deuda estimada por la app y la deuda real reportada por el banco (intereses, cuotas de manejo, seguros o cargos no clasificados).
4. **Experiencia de Usuario de Nivel Bancario:** Interfaces interactivas de alta gama (Billetera animada con mazo apilado, transiciones dinámicas, diseño oscuro elegante y gráficos claros).

---

## 2. Stack Tecnológico

| Capa | Tecnología | Versión / Detalle |
| :--- | :--- | :--- |
| **Framework Móvil** | React Native | `0.81.5` |
| **Plataforma / Runtime** | Expo SDK | `~54.0.37` |
| **Librería UI / React** | React | `19.1.0` |
| **Lenguaje** | TypeScript | `~5.9.2` (Modo Estricto) |
| **Base de Datos Local** | SQLite | `expo-sqlite ~16.0.10` |
| **Almacenamiento Clave-Valor** | Async Storage | `@react-native-async-storage/async-storage 2.2.0` |
| **Actualizaciones OTA** | Expo Updates | `expo-updates ~29.0.20` |
| **Iconografía** | Lucide Icons | `lucide-react-native ^1.35.0` |
| **Componentes Visuales** | Expo Linear Gradient | `expo-linear-gradient ~15.0.8` |
| **Notificaciones** | Expo Notifications | `expo-notifications ~0.32.17` |
| **Entorno Contenerizado** | Docker & Compose | `node:20-bookworm-slim` + Dev Container |
| **Compilación & CI/CD** | Expo EAS CLI | `eas-cli 27.x` |

---

## 3. Arquitectura del Software

El proyecto sigue una arquitectura modular en capas con separación estricta de responsabilidades:

```
gestion-gastos/
├── .devcontainer/             # Configuración para VS Code / Antigravity Dev Containers
├── assets/                    # Iconos adaptativos Android, splash screen e iconografía
├── src/
│   ├── components/            # Componentes visuales organizados por dominio
│   │   ├── accounts/          # Tarjetas y vistas de cuentas bancarias
│   │   ├── cards/             # Motor visual de tarjetas (Billetera animada, modales, cuotas)
│   │   ├── categories/        # Gestión y selección de categorías con colores
│   │   ├── common/            # Componentes genéricos (CustomIcon, Theme, botones)
│   │   └── transactions/      # Modales y filas de registro de ingresos/gastos/pagos
│   ├── context/               # Estado global reactivo
│   │   ├── FinancialContext.tsx   # Orquestador del estado financiero y llamadas a SQLite
│   │   └── AlertContext.tsx       # Modales de confirmación, alertas y diálogo nativo
│   ├── database/              # Capa de Persistencia Local
│   │   ├── database.ts        # Inicialización del schema y conexión SQLite
│   │   ├── migrations.ts      # Migraciones idempotentes con PRAGMA user_version (v1 -> v5)
│   │   ├── seedDemoData.ts    # Datos de demostración estructurados
│   │   └── repositories/      # Repositorios tipados para cada entidad (Cuentas, Tarjetas, TXs...)
│   ├── screens/               # Pantallas principales (Dashboard, Cards, Accounts, Settings, TXs)
│   ├── types/                 # Definiciones de TypeScript (finance.ts)
│   └── utils/                 # Servicios matemáticos, formateadores y reglas de emisores
├── Dockerfile                 # Contenedor Linux reproducible para desarrollo aislado
├── docker-compose.yml         # Orquestación del servicio local de desarrollo con puerto 8081
├── eas.json                   # Perfiles de compilación EAS (development, test/preview, production)
├── app.json                   # Metadatos oficiales Expo y configuración para Google Play
└── package.json               # Dependencias del proyecto
```

---

## 4. Persistencia y Migraciones SQLite (`PRAGMA user_version`)

El almacenamiento local se gestiona mediante SQLite con control estricto de esquema en [`src/database/migrations.ts`](file:///c:/Users/crist/Documentos/Cristian%20Mestra/Proyectos%20Personales/2026/App%20KeAhorro/gestion-gastos/src/database/migrations.ts).

### Esquema de Versiones:
* **Versión 1 (Base):** Cuentas bancarias (`accounts`), transacciones (`transactions`), categorías (`categories`) y presupuestos (`budgets`).
* **Versión 2 (Tarjetas de Crédito):** Entidad `credit_cards`, registro de compras a cuotas `card_purchases` y amortizaciones periódicas `card_installments`.
* **Versión 3 (Extractos y Ciclos):** `card_billing_cycles` y `card_statements` para modelar cortes de facturación.
* **Versión 4 (Conciliación Bancaria):** `card_reconciliations` y asignaciones de pagos (`payment_allocations`).
* **Versión 5 (Saldos de Apertura y Reconciliaciones No Capital):** Atributos `is_opening_balance`, categoría de diferencias (`category`), desglose de intereses y cuotas de manejo no capitalizadas.

### Idempotencia Garantizada:
Toda migración inspecciona `PRAGMA user_version`. Si la base de datos ya está en la última versión, la verificación toma menos de 2 milisegundos. Si faltan columnas debido a versiones previas, la migración ejecuta reconciliaciones mediante `PRAGMA table_info` antes de aplicar `ALTER TABLE ADD COLUMN`, evitando fallos por columnas duplicadas.

---

## 5. El Modelo Financiero de Tarjetas de Crédito (Fase 2)

A diferencia de otras apps que solo restan compras del límite de crédito, KeAhorro implementa la **Tríada de Consistencia Financiera**:

$$\text{Deuda Total Actual} = \text{Saldo Facturado Pendiente} + \text{Deuda No Facturada}$$

1. **Deuda Total Actual:** Suma de todo el capital adeudado en compras más cualquier saldo derivado de extractos anteriores (cargos, mora, cuotas de manejo).
2. **Saldo Facturado Pendiente (Extracto):** Cifra que el banco exige pagar en la fecha límite actual. Se reduce únicamente cuando el usuario realiza abonos dirigidos al extracto.
3. **Deuda No Facturada:** Compras realizadas después del día de corte o cuotas futuras de compras financiadas.
4. **Liberación de Cupo:** Solo los pagos imputados a **capital (principal)** aumentan el cupo disponible (`availableLimit`). Los pagos aplicados a intereses o comisiones reducen la deuda pero no liberan cupo.

---

## 6. Decisiones de Diseño UI Recientes: Billetera Animada

En la rama `test` se implementó el componente [`AnimatedWalletStack.tsx`](file:///c:/Users/crist/Documentos/Cristian%20Mestra/Proyectos%20Personales/2026/App%20KeAhorro/gestion-gastos/src/components/cards/AnimatedWalletStack.tsx) para la pantalla de tarjetas:

* **Mazo Apilado en Cascada (Card Stack):** En la zona inferior se presentan las demás tarjetas en profundidad perspectiva, con desplazamiento vertical negativo y escala decreciente.
* **Vuelo e Inclinación Elástica:** Al pulsar o hacer *swipe up* en cualquier tarjeta del mazo, esta asciende al puesto activo mediante un cálculo de resortes (`Animated.spring`) con damping calibrado, acompañada de una ligera rotación inicial que simula la extracción física de una tarjeta de la cartera.
* **Contador Numérico Dinámico (`AnimatedRollingNumber`):** Al cambiar de tarjeta, la cifra de saldo hace una transición suave desde el valor anterior hasta el nuevo utilizando interpolación cúbica `easeOutCubic`.
* **Resplandor Ambiental Reactivo (*Ambient Glow*):** El fondo superior proyecta un halo luminoso que adquiere los tonos cromáticos del gradiente de la tarjeta que pasa al frente.
* **Selector Billetera / Lista:** Permite al usuario alternar entre la experiencia fluida de mazo apilado y la vista clásica secuencial.
* **Depuración Visual (Último Cambio):** Se retiró de la vista principal el banner persistente *"Configurar saldo actual"* y el botón *"Apertura"*, dejando únicamente los botones esenciales (**Pagar**, **Extracto**, **Conciliar**). La configuración de saldo de apertura quedó restringida exclusivamente al modal de creación de tarjetas nuevas.

---

## 7. Estrategia de Ramas y Control de Versiones

El repositorio opera bajo una estrategia Git simplificada y orientada a lanzamientos seguros:

```
  (Desarrollo activo y pruebas)
        test ─────────────────────────────┐
         ▲                                │ (Merge tras validación)
         │                                ▼
        main ───────────────────────► production (Builds oficiales para Play Store)
```

1. **`main`:** Tronco histórico y de sincronización principal.
2. **`test`:** Rama activa de trabajo. En ella se prueban nuevas animaciones, ajustes de UI y cambios de base de datos. Genera paquetes **`.apk`** instalables directamente en dispositivos móviles mediante el perfil `test` de EAS.
3. **`production`:** Rama protegida de alta estabilidad. Solo recibe código validado desde `test`. Desde esta rama se compilan los paquetes **Android App Bundle (`.aab`)** firmados digitalmente para la Play Store.

---

## 8. Entorno Contenerizado con Docker

Para garantizar reproducibilidad sin depender del software local instalado en Windows, el proyecto cuenta con soporte completo de Docker:

* **`Dockerfile`:** Construido sobre `node:20-bookworm-slim` (Debian 12), con herramientas de compilación, Git y `eas-cli` instaladas dentro de la imagen.
* **`docker-compose.yml`:** Levanta el contenedor `keahorro-dev-container` mapeando el código fuente en tiempo real y aislando `/app/node_modules` en un volumen dedicado.
* **Flujo de Trabajo:**
  * Iniciar entorno: `docker compose up --build`
  * Ejecutar actualización EAS: `docker exec -e EXPO_TOKEN="<token>" keahorro-dev-container npx eas-cli update --branch preview`
  * Compilar APK de prueba: `docker exec -e EXPO_TOKEN="<token>" keahorro-dev-container npx eas-cli build --platform android --profile test`

---

## 9. Hoja de Ruta para Publicación en Google Play Store

### Configuración en `app.json` y `eas.json`:
* **Package Name:** `com.cristianmestra.gestiongastos`
* **Formato de Producción:** Android App Bundle (`.aab`) exigido por Google Play (`buildType: "app-bundle"` en `eas.json`).
* **Canales:** `preview` (para pruebas internas) y `production` (para la tienda oficial).

### Requisitos Comerciales y de Consola:
1. **Cuenta de Desarrollador:** Google Play Console (registro con pago de $25 USD).
2. **Material Gráfico de la Tienda:**
   * Icono de alta resolución: 512 × 512 px PNG.
   * Gráfico de funciones (*Feature Graphic*): 1024 × 500 px.
   * Mínimo 4 capturas de pantalla de la app en móvil.
3. **Pistas de Prueba:**
   * Cargar el `.aab` inicialmente en la **Pista de Prueba Interna (*Internal Testing*)** para validar la instalación directa desde la Play Store con testers autorizados.
   * Promover a **Producción** con un solo clic tras verificar estabilidad.
4. **Política de Privacidad:** URL pública requerida debido al uso de permisos locales de almacenamiento, notificaciones (`POST_NOTIFICATIONS`) y alarmas exactas (`SCHEDULE_EXACT_ALARM`).
