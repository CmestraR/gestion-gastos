# Registro de Migraciones de Base de Datos (Fase 1)

## Principio de Migración
La aplicación ya está en producción instalada en dispositivos reales. **ESTÁ PROHIBIDO realizar `DROP TABLE` o migraciones destructivas.**

---

## Migraciones Aplicadas en Fase 1

### 1. Índices de Rendimiento e Integridad
Se ejecutaron mediante `CREATE INDEX IF NOT EXISTS` dentro de `initDatabase` en `src/database/database.ts`:

```sql
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions (date);
CREATE INDEX IF NOT EXISTS idx_transactions_account ON transactions (account_id);
CREATE INDEX IF NOT EXISTS idx_transactions_to_account ON transactions (to_account_id);
CREATE INDEX IF NOT EXISTS idx_transactions_card ON transactions (card_id);
CREATE INDEX IF NOT EXISTS idx_card_purchases_card ON card_purchases (card_id);
CREATE INDEX IF NOT EXISTS idx_card_installments_purchase ON card_installments (purchase_id);
CREATE INDEX IF NOT EXISTS idx_card_installments_due_date ON card_installments (due_date);
```

### 2. Retrocompatibilidad Garantizada
- Todas las columnas previamente añadidas (`has_gmf_4x1000`, `interest_rate_monthly`, `debt_limit`, `due_date`, `gmf_amount`, `keywords`) mantienen sus bloques `try/catch` seguros con `ALTER TABLE ... ADD COLUMN`.
- Cero pérdida de datos para usuarios que actualicen vía OTA.
