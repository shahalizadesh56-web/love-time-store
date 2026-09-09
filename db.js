import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

const file = process.env.DATABASE_FILE || './data/lovetime.db';
fs.mkdirSync(path.dirname(file), { recursive: true });
export const db = new Database(file);
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS products (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 name TEXT NOT NULL,
 category TEXT NOT NULL,
 price INTEGER NOT NULL,
 image TEXT,
 description TEXT,
 active INTEGER NOT NULL DEFAULT 1,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS orders (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 order_no TEXT UNIQUE NOT NULL,
 customer_name TEXT NOT NULL,
 phone TEXT NOT NULL,
 address TEXT NOT NULL,
 total INTEGER NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending',
 payment_authority TEXT,
 payment_ref TEXT,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS order_items (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 order_id INTEGER NOT NULL,
 product_id INTEGER NOT NULL,
 name TEXT NOT NULL,
 price INTEGER NOT NULL,
 quantity INTEGER NOT NULL,
 FOREIGN KEY(order_id) REFERENCES orders(id)
);
`);

const count = db.prepare('SELECT COUNT(*) AS c FROM products').get().c;
if (!count) {
 const insert = db.prepare('INSERT INTO products(name,category,price,image,description) VALUES (?,?,?,?,?)');
 const seed = [
  ['Black Élan','مردانه',2800000,'https://images.unsplash.com/photo-1594035910387-fea47794261f?auto=format&fit=crop&w=800&q=85','رایحه‌ای عمیق و شیک با پایه چوبی و مشک.'],
  ['Rose Élan','زنانه',3200000,'https://images.unsplash.com/photo-1541643600914-78b084683601?auto=format&fit=crop&w=800&q=85','رایحه‌ای ظریف، گل‌دار و ماندگار.'],
  ['Vanille Noire','یونیسکس',2500000,'https://images.unsplash.com/photo-1592945403244-b3fbafd7f539?auto=format&fit=crop&w=800&q=85','ترکیبی گرم و جذاب از وانیل و چوب.']
 ];
 const tx = db.transaction(() => seed.forEach(x => insert.run(...x)));
 tx();
}
