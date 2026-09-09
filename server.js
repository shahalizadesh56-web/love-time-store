import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import crypto from 'node:crypto';
import { z } from 'zod';
import { db } from './db.js';

const app = express();
app.use(cors());
app.use(express.json());


app.get('/', (req, res) => res.sendFile(new URL('./index.html', import.meta.url).pathname));

const orderSchema = z.object({
  customer: z.object({
    name: z.string().min(2),
    phone: z.string().regex(/^09\\d{9}$/),
    address: z.string().min(8)
  }),
  items: z.array(z.object({
    productId: z.number().int().positive(),
    quantity: z.number().int().min(1).max(50)
  })).min(1)
});

function makeOrderNo() {
  return 'LT-' + crypto.randomInt(10000000, 99999999);
}

app.get('/api/products', (req, res) => {
  res.json(db.prepare('SELECT * FROM products WHERE active=1 ORDER BY id DESC').all());
});

app.post('/api/orders', (req, res) => {
  const parsed = orderSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({error:'اطلاعات سفارش نامعتبر است.'});

  const ids = parsed.data.items.map(x => x.productId);
  const placeholders = ids.map(() => '?').join(',');
  const products = db.prepare(`SELECT * FROM products WHERE active=1 AND id IN (${placeholders})`).all(...ids);
  if (products.length !== ids.length) return res.status(400).json({error:'یکی از محصولات موجود نیست.'});

  const map = new Map(products.map(p => [p.id, p]));
  let total = 0;
  const normalized = parsed.data.items.map(i => {
    const p = map.get(i.productId);
    total += p.price * i.quantity;
    return { ...i, product: p };
  });

  const orderNo = makeOrderNo();
  const create = db.transaction(() => {
    const info = db.prepare(`
      INSERT INTO orders(order_no,customer_name,phone,address,total,status)
      VALUES(?,?,?,?,?,'pending')
    `).run(orderNo, parsed.data.customer.name, parsed.data.customer.phone, parsed.data.customer.address, total);

    const insertItem = db.prepare(`
      INSERT INTO order_items(order_id,product_id,name,price,quantity) VALUES(?,?,?,?,?)
    `);
    for (const x of normalized) insertItem.run(info.lastInsertRowid, x.product.id, x.product.name, x.product.price, x.quantity);
  });
  create();

  // این بخش عمداً دمو است. درگاه واقعی باید در همین نقطه با API رسمی provider فراخوانی شود.
  res.status(201).json({
    orderNo,
    amount: total,
    payment: {
      mode: 'demo',
      message: 'ساختار پرداخت آماده است؛ برای پرداخت واقعی credentials درگاه لازم است.'
    }
  });
});

app.get('/api/orders/:orderNo', (req,res) => {
  const order = db.prepare('SELECT * FROM orders WHERE order_no=?').get(req.params.orderNo);
  if (!order) return res.status(404).json({error:'سفارش پیدا نشد.'});
  const items = db.prepare('SELECT * FROM order_items WHERE order_id=?').all(order.id);
  res.json({...order,items});
});

/*
  Payment flow for a real gateway:
  1) POST /api/orders
  2) Server requests payment authority from provider.
  3) Redirect customer to provider URL.
  4) Provider calls /api/payment/callback.
  5) Server verifies authority + amount with provider.
  6) Only after successful verification: status='paid' and payment_ref saved.
*/
app.get('/api/payment/callback', (req,res) => {
  res.status(501).send('Callback endpoint آماده است، اما provider واقعی هنوز پیکربندی نشده است.');
});

app.get('/api/health', (req,res) => res.json({ok:true,service:'LOVE TIME API'}));

const PORT = Number(process.env.PORT || 3000);
app.listen(PORT, '0.0.0.0', () => {
  console.log(`LOVE TIME API running on port ${PORT}`);
});
