# INFORME TÉCNICO DE HOTFIX: MIGRACIONES RETROCOMPATIBLES E IDEMPOTENTES EN SQLITE

## 1. Causa Raíz del Problema

### El Fallo Observado
En un dispositivo real con una base de datos SQLite preexistente (instalada durante fases previas), al intentar ejecutar **"Configurar Saldo Actual"** (o cualquier inserción en `transactions`), la aplicación arrojaba:
```text
Call to function 'NativeDatabase.prepareAsync' has been rejected.
Caused by: table transactions has no column named card_installment_id
```

### Origen Mecánico del Error
1. **Fallo silencioso por orden de ejecución en DDL por lotes:**
   En `src/database/database.ts`, la función `initDatabase()` ejecutaba un único bloque SQL multi-instrucción (`db.execAsync(...)`) que contenía tanto los `CREATE TABLE IF NOT EXISTS` como los `CREATE INDEX IF NOT EXISTS`.
2. **`CREATE TABLE IF NOT EXISTS` no altera tablas existentes:**
   En una base de datos creada en Fase 1, la tabla `transactions` ya existía físicamente sin las columnas agregadas en fases posteriores (`card_installment_id`, `statement_id`, `principal_amount`, `interest_amount`, etc.).
3. **Fallo en creación de índice:**
   Dentro del mismo bloque SQL, la instrucción:
   ```sql
   CREATE INDEX IF NOT EXISTS idx_transactions_card_installment ON transactions (card_installment_id);
   ```
   fallaba con error fatal de SQLite (`no such column: card_installment_id`).
4. **Interrupción de migraciones:**
   Al fallar el bloque DDL inicial, la ejecución de `initDatabase()` se abortaba de inmediato, impidiendo que el motor alcanzara las instrucciones `ALTER TABLE ... ADD COLUMN` ubicadas al final del archivo. La base quedaba permanentemente desfasada.

---

## 2. Auditoría Completa de Tablas y Columnas

Se auditó el 100% de las entidades del libro mayor y repositorios contables:

| Tabla | Columnas Históricas | Columnas Añadidas en Fases Recientes |
| :--- | :--- | :--- |
| **`transactions`** | `id`, `account_id`, `card_id`, `type`, `amount`, `category_id`, `description`, `notes`, `date`, `to_account_id`, `card_purchase_id`, `created_at` | `card_installment_id` (TEXT)<br>`statement_id` (TEXT)<br>`principal_amount` (REAL DEFAULT 0)<br>`interest_amount` (REAL DEFAULT 0)<br>`gmf_amount` (REAL DEFAULT 0) |
| **`accounts`** | `id`, `name`, `type`, `bank_name`, `balance`, `initial_balance`, `currency`, `color`, `icon`, `is_archived`, `created_at` | `include_in_total` (INTEGER DEFAULT 1)<br>`has_gmf_4x1000` (INTEGER DEFAULT 0)<br>`interest_rate_monthly` (REAL DEFAULT 0)<br>`debt_limit` (REAL DEFAULT 0)<br>`due_date` (INTEGER) |
| **`credit_cards`** | `id`, `name`, `bank_name`, `card_brand`, `last_four_digits`, `credit_limit`, `available_limit`, `cut_off_day`, `payment_due_day`, `interest_rate_monthly`, `handling_fee`, `color_gradient_start`, `color_gradient_end`, `currency`, `is_archived`, `created_at` | `issuer_id` (TEXT DEFAULT 'generic')<br>`late_interest_rate_monthly` (REAL DEFAULT 0)<br>`positive_balance` (REAL DEFAULT 0) |
| **`categories`** | `id`, `name`, `type`, `icon`, `color`, `is_default` | `keywords` (TEXT) |
| **`card_statements`** | `id`, `card_id`, `billing_cycle_id`, `statement_date`, `due_date`, `opening_balance`, `purchases_total`, `advances_total`, `principal_total`, `current_interest`, `late_interest`, `handling_fee`, `taxes_and_fees`, `total_statement_balance`, `minimum_payment_original`, `statement_balance_paid`, `minimum_payment_paid`, `status`, `is_manual_snapshot`, `notes`, `created_at` | `collection_fee` (REAL DEFAULT 0)<br>`is_opening_balance` (INTEGER DEFAULT 0) |
| **`card_payment_allocations`** | `id`, `transaction_id`, `card_id`, `statement_id`, `total_payment`, `principal_applied`, `current_interest_applied`, `late_interest_applied`, `handling_fee_applied`, `taxes_and_fees_applied`, `credit_balance_applied`, `created_at` | `collection_fee_applied` (REAL DEFAULT 0)<br>`statement_applied` (REAL DEFAULT 0)<br>`unbilled_applied` (REAL DEFAULT 0)<br>`minimum_applied` (REAL DEFAULT 0) |
| **`card_reconciliations`** | `id`, `card_id`, `statement_id`, `reconciliation_date`, `app_calculated_debt`, `bank_reported_debt`, `difference_amount`, `adjustment_transaction_id`, `notes`, `created_at` | `difference_category` (TEXT DEFAULT 'unclassified')<br>`status` (TEXT DEFAULT 'applied')<br>`amount_paid` (REAL DEFAULT 0) |
| **`card_payment_reconciliation_allocations`** | *(Tabla nueva en Fase 2.2 Hotfix)* | `id`, `payment_allocation_id`, `reconciliation_id`, `category`, `amount_applied`, `created_at` |
| **`card_billing_cycles`** | `id`, `card_id`, `cycle_number`, `start_date`, `cut_off_date`, `payment_due_date`, `status`, `created_at` | Estructura completa creada si no existe |
| **`card_purchases`** | `id`, `card_id`, `description`, `category_id`, `amount`, `installments_total`, `installments_paid`, `monthly_installment_amount`, `interest_rate_monthly`, `first_installment_date`, `status`, `created_at` | Estructura completa creada si no existe |
| **`card_installments`** | `id`, `purchase_id`, `installment_number`, `due_date`, `principal_amount`, `interest_amount`, `total_amount`, `is_paid`, `paid_date` | Estructura completa creada si no existe |
| **`budgets`** | `id`, `category_id`, `monthly_limit`, `month_year`, `created_at` | Estructura completa creada si no existe |

---

## 3. Nueva Arquitectura de Migración

Se implementó el módulo [`src/database/migrations.ts`](file:///c:/Users/siste/Documents/+Cristian%20Mestra/+gestion_gatos/gestion-gastos/src/database/migrations.ts) con las siguientes garantías:

```
                  ┌────────────────────────────────────────────────────────┐
                  │                 INICIO: initDatabase()                 │
                  └────────────────────────────────────────────────────────┘
                                              │
                                              ▼
                  ┌────────────────────────────────────────────────────────┐
                  │ 1. PRAGMA user_version                                 │
                  │    Consulta la versión registrada (0 a 5).             │
                  └────────────────────────────────────────────────────────┘
                                              │
                                              ▼
                  ┌────────────────────────────────────────────────────────┐
                  │ 2. Migraciones Versionadas Graduales                   │
                  │    V1 -> V2 -> V3 -> V4 -> V5                          │
                  │    Agrega tablas y campos según el delta necesario.    │
                  └────────────────────────────────────────────────────────┘
                                              │
                                              ▼
                  ┌────────────────────────────────────────────────────────┐
                  │ 3. Reconciliador Exhaustivo (PRAGMA table_info)        │
                  │    Audita cada tabla contra REQUIRED_SCHEMA_COLUMNS.   │
                  │    Si falta alguna columna, ejecuta ALTER TABLE ADD.   │
                  └────────────────────────────────────────────────────────┘
                                              │
                                              ▼
                  ┌────────────────────────────────────────────────────────┐
                  │ 4. Creación Segura de Índices                          │
                  │    CREATE INDEX IF NOT EXISTS se ejecuta SOLO          │
                  │    cuando todas las columnas existen con certeza.      │
                  └────────────────────────────────────────────────────────┘
                                              │
                                              ▼
                  ┌────────────────────────────────────────────────────────┐
                  │ 5. PRAGMA user_version = 5                             │
                  │    Registra la versión final en la cabecera SQLite.    │
                  └────────────────────────────────────────────────────────┘
```

### Versionado de Esquema
- **`user_version = 0 / 1`**: Esquema base original (cuentas, tarjetas básicas, categorías, transacciones simples, presupuestos).
- **`user_version = 2`**: Campos de cuentas bancarias (`has_gmf_4x1000`, `include_in_total`, `debt_limit`, etc.) y palabras clave de categorías.
- **`user_version = 3`**: Motor de compras diferidas a cuotas (`card_purchases`, `card_installments`, `card_installment_id`, `statement_id`, `principal_amount`, `interest_amount`, etc.).
- **`user_version = 4`**: Motor de extractos, ciclos y asignaciones de pagos (`card_billing_cycles`, `card_statements`, `card_payment_allocations`, `is_opening_balance`, `collection_fee`).
- **`user_version = 5`**: Trazabilidad individual de conciliaciones (`card_payment_reconciliation_allocations`, `difference_category`, `status`, `amount_paid`).

### Idempotencia Garantizada
- Antes de ejecutar `ALTER TABLE`, se consulta `PRAGMA table_info(<nombre_tabla>)`.
- Si la columna ya existe, la instrucción se omite.
- Las migraciones pueden ejecutarse $N$ veces consecutivas sin errores ni duplicaciones.

---

## 4. Batería de Pruebas de Migración

Se implementó el archivo de pruebas [`tests/migrations.test.ts`](file:///c:/Users/siste/Documents/+Cristian%20Mestra/+gestion_gatos/gestion-gastos/tests/migrations.test.ts) ejecutado sobre SQLite real (`node:sqlite`):

1. **Test `M01`: Migración desde base antigua (Fase 1 Legacy)**:
   - Se crea una base de datos en memoria con el esquema primitivo de Fase 1 sin ninguna columna de tarjetas a cuotas ni extractos.
   - Se insertan cuentas, tarjetas y transacciones históricas.
   - Se ejecuta `initDatabase()`.
   - **Resultado**: Todas las columnas nuevas son creadas, los datos históricos permanecen 100% intactos y `user_version = 5`.
2. **Test `M02`: Test Funcional del Bug**:
   - Sobre una base antigua migrada, se ejecuta `StatementRepository.createOpeningBalanceSnapshot()`.
   - **Resultado**: La apertura de saldo se crea sin error, auditando la transacción con `principal_amount`, `interest_amount`, `statement_id` y `card_installment_id`. El error `NativeDatabase.prepareAsync: table transactions has no column named card_installment_id` queda **completamente eliminado**.
3. **Test `M03`: Migración desde versión intermedia (Fase 1.2 / user_version = 2)**:
   - Se migra una base con compras a cuotas hacia la versión 5.
   - **Resultado**: Migración exitosa de tablas de extractos, conciliaciones y trazabilidad.
4. **Test `M04`: Idempotencia Estricta**:
   - Se ejecuta la migración 3 veces consecutivas sobre la misma base de datos.
   - **Resultado**: Cero errores, esquema consistente y versión en 5.

---

## 5. Resultados de Verificación

```text
> npm test
▶ BATERÍA COMPLETA DE PRUEBAS — MOTOR FINANCIERO Y TARJETAS DE CRÉDITO (FASE 2 & FASE 2.1)
  ✔ 1. Pruebas Unitarias [UNIT] - Lógica y Matemática Pura (9 tests pass)
  ✔ 2. Batería de Tarjetas de Crédito [T01 a T30] en SQLite Real (30 tests pass)
  ✔ 3. Batería de Integridad Contable Fase 2.1 [T31 a T46] en SQLite Real (29 tests pass)
▶ BATERÍA DE MIGRACIONES RETROCOMPATIBLES E IDEMPOTENTES (SQLITE REAL)
  ✔ M01: Migración desde base antigua (Fase 1 Legacy sin card_installment_id) (pass)
  ✔ M02: Test Funcional del Bug — Configurar Saldo Actual en base migrada sin errores (pass)
  ✔ M03: Migración desde versión intermedia (Esquema Fase 1.2 / user_version = 2) (pass)
  ✔ M04: Idempotencia estricta — Múltiples ejecuciones consecutivas de migración no causan error (pass)

ℹ tests 72
ℹ suites 5
ℹ pass 72
ℹ fail 0
```

```text
> npx tsc --noEmit
Exit code 0 (0 errores de tipado)
```
