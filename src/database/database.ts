export interface AppDatabase {
  execAsync(source: string): Promise<void>;
  runAsync(source: string, params?: any[]): Promise<{ lastInsertRowId: number; changes: number }>;
  getAllAsync<T>(source: string, params?: any[]): Promise<T[]>;
  getFirstAsync<T>(source: string, params?: any[]): Promise<T | null>;
  withTransactionAsync<T>(action: () => Promise<T>): Promise<T>;
}

let dbInstance: AppDatabase | null = null;
let testDbInstance: AppDatabase | null = null;

/**
 * Permite inyectar un adaptador SQLite de pruebas (ej. motor SQLite en memoria)
 */
export function setTestDatabase(db: AppDatabase | null): void {
  testDbInstance = db;
}

export async function getDatabase(): Promise<AppDatabase> {
  if (testDbInstance) {
    return testDbInstance;
  }
  if (!dbInstance) {
    const SQLite = await import('expo-sqlite');
    dbInstance = (await SQLite.openDatabaseAsync('gestion_gastos.db')) as unknown as AppDatabase;
    await initDatabase(dbInstance);
  }
  return dbInstance;
}

import { runDatabaseMigrations } from './migrations.ts';

export async function initDatabase(db: AppDatabase): Promise<void> {
  // Configurar pragmas iniciales
  try {
    await db.execAsync(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;
    `);
  } catch (err) {
    // Si SQLite en memoria o ciertas plataformas no soportan WAL, continuar de forma segura
    try {
      await db.execAsync(`PRAGMA foreign_keys = ON;`);
    } catch (_) {}
  }

  // Ejecutar el motor de migraciones e integridad de esquema
  await runDatabaseMigrations(db);

  // Sembrar categorías por defecto y actualizar palabras clave
  await seedDefaultCategories(db);

  for (const cat of defaultCategoriesList) {
    if (cat.keywords && cat.keywords.length > 0) {
      try {
        await db.runAsync(
          'UPDATE categories SET keywords = ? WHERE id = ? AND (keywords IS NULL OR keywords = "" OR keywords = "[]")',
          [JSON.stringify(cat.keywords), cat.id]
        );
      } catch (_) {}
    }
  }
}

const defaultCategoriesList = [
  // Gastos con palabras clave para IA
  {
    id: 'cat-food',
    name: 'Alimentación & Restaurantes',
    type: 'expense',
    icon: 'Utensils',
    color: '#F97316',
    keywords: ['exito', 'jumbo', 'carulla', 'd1', 'ara', 'olimpica', 'restaurante', 'almuerzo', 'cena', 'comida', 'mercado', 'hamburguesa', 'pizza', 'domicilio', 'rappi', 'ifood', 'panaderia', 'cafe', 'starbucks', 'tostao'],
  },
    {
      id: 'cat-transport',
      name: 'Transporte & Gasolina',
      type: 'expense',
      icon: 'Car',
      color: '#3B82F6',
      keywords: ['uber', 'didi', 'cabify', 'gasolina', 'terpel', 'primax', 'brio', 'taxi', 'peaje', 'parqueadero', 'transmilenio', 'metro', 'pasaje', 'mantenimiento vehiculo', 'taller'],
    },
    {
      id: 'cat-housing',
      name: 'Vivienda & Servicios',
      type: 'expense',
      icon: 'Home',
      color: '#10B981',
      keywords: ['arriendo', 'alquiler', 'administracion', 'epm', 'enel', 'codensa', 'acueducto', 'gas', 'claro', 'movistar', 'tigo', 'etb', 'internet', 'luz', 'agua', 'energia'],
    },
    {
      id: 'cat-shopping',
      name: 'Compras & Ropa',
      type: 'expense',
      icon: 'ShoppingBag',
      color: '#EC4899',
      keywords: ['zara', 'falabella', 'mercadolibre', 'amazon', 'aliexpress', 'hm', 'ropa', 'zapatos', 'centro comercial', 'tenis', 'alkosto', 'ktronix', 'homecenter', 'tienda'],
    },
    {
      id: 'cat-entertainment',
      name: 'Ocio & Entretenimiento',
      type: 'expense',
      icon: 'Film',
      color: '#8B5CF6',
      keywords: ['cine', 'cinecolombia', 'cinemark', 'procinal', 'fiesta', 'bar', 'cerveza', 'concierto', 'discoteca', 'videojuegos', 'playstation', 'steam', 'viaje', 'hotel', 'boletas', 'tiquetes'],
    },
    {
      id: 'cat-health',
      name: 'Salud & Cuidado',
      type: 'expense',
      icon: 'HeartPulse',
      color: '#EF4444',
      keywords: ['drogueria', 'farmacia', 'cruz verde', 'farmatodo', 'medico', 'odontologia', 'cita medica', 'medicamentos', 'gimnasio', 'smart fit', 'eps', 'medicina prepagada'],
    },
    {
      id: 'cat-education',
      name: 'Educación & Cursos',
      type: 'expense',
      icon: 'GraduationCap',
      color: '#06B6D4',
      keywords: ['universidad', 'colegio', 'platzi', 'udemy', 'coursera', 'curso', 'matricula', 'libros', 'papeleria', 'ingles'],
    },
    {
      id: 'cat-subscriptions',
      name: 'Suscripciones & Streaming',
      type: 'expense',
      icon: 'Tv',
      color: '#6366F1',
      keywords: ['netflix', 'spotify', 'youtube', 'disney', 'amazon prime', 'max', 'hbo', 'chatgpt', 'icloud', 'google one', 'apple', 'crunchyroll'],
    },
    {
      id: 'cat-financial',
      name: 'Gastos Financieros & 4x1000',
      type: 'expense',
      icon: 'Percent',
      color: '#E11D48',
      keywords: ['cuota', 'intereses', 'manejo', 'comision', 'abono tarjeta', 'cuota prestamo', 'banco', 'gravamen', '4x1000', 'gmf', 'impuesto financiero'],
    },
    {
      id: 'cat-other-exp',
      name: 'Otros Gastos',
      type: 'expense',
      icon: 'MoreHorizontal',
      color: '#94A3B8',
      keywords: ['varios', 'miscelaneo', 'imprevisto', 'otro'],
    },

    // Ingresos
    {
      id: 'cat-salary',
      name: 'Salario / Sueldo',
      type: 'income',
      icon: 'Briefcase',
      color: '#10B981',
      keywords: ['nomina', 'sueldo', 'salario', 'pago quincena', 'quincena', 'empresa', 'prima', 'cesantias'],
    },
    {
      id: 'cat-freelance',
      name: 'Honorarios / Freelance',
      type: 'income',
      icon: 'Laptop',
      color: '#06B6D4',
      keywords: ['honorarios', 'freelance', 'proyecto', 'cliente', 'cuenta de cobro', 'asesoria', 'servicio'],
    },
    {
      id: 'cat-investment',
      name: 'Inversiones & Rendimientos',
      type: 'income',
      icon: 'TrendingUp',
      color: '#8B5CF6',
      keywords: ['rendimientos', 'intereses ganados', 'cdt', 'acciones', 'dividendos', 'cripto', 'trii', 'tyba', 'fiduciaria', 'cajita nu', 'bolsillo'],
    },
    {
      id: 'cat-gift',
      name: 'Regalos & Bonificaciones',
      type: 'income',
      icon: 'Gift',
      color: '#F59E0B',
      keywords: ['regalo', 'bono', 'bonificacion', 'premio', 'cumpleanos'],
    },
    {
      id: 'cat-other-inc',
      name: 'Otros Ingresos',
      type: 'income',
      icon: 'DollarSign',
      color: '#3B82F6',
      keywords: ['devolucion', 'reembolso', 'venta', 'ingreso extra'],
    },
  ];

async function seedDefaultCategories(db: AppDatabase): Promise<void> {
  const existing = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM categories');
  if (existing && existing.count > 0) return;

  for (const cat of defaultCategoriesList) {
    await db.runAsync(
      `INSERT INTO categories (id, name, type, icon, color, keywords, is_default) VALUES (?, ?, ?, ?, ?, ?, 1)`,
      [cat.id, cat.name, cat.type, cat.icon, cat.color, JSON.stringify(cat.keywords)]
    );
  }
}
