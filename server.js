import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import crypto from 'node:crypto';
import { z } from 'zod';
import { db } from '../db.js';

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';

app.get('/', (req, res) => {
  res.sendFile(new URL('../فهرست.html', import.meta.url).pathname);
});

app.get('/admin', (req, res) => {
  res.sendFile(new URL('../admin.html', import.meta.url).pathname);
});

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    message: 'Love Time Store API is running'
  });
});

app.get('/api/products', async (req, res) => {
  try {
    const products = await db.all(`
      SELECT *
      FROM products
      WHERE active = 1
      ORDER BY id DESC
    `);

    res.json(products);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'خطا در دریافت محصولات' });
  }
});

app.get('/api/products/:id', async (req, res) => {
  try {
    const product = await db.get(
      `SELECT * FROM products WHERE id = ?`,
      [req.params.id]
    );

    if (!product) {
      return res.status(404).json({ error: 'محصول پیدا نشد' });
    }

    res.json(product);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'خطا در دریافت محصول' });
  }
});

const orderSchema = z.object({
  customer: z.object({
    name: z.string().min(2),
    phone: z.string().min(5),
    address: z.string().optional().default('')
  }),
  items: z.array(
    z.object({
      product_id: z.coerce.number(),
      quantity: z.coerce.number().int().positive()
    })
  ).min(1)
});

function createOrderNumber() {
  const date = new Date()
    .toISOString()
    .slice(0, 10)
    .replaceAll('-', '');

  const random = crypto.randomBytes(3).toString('hex').toUpperCase();

  return `LT-${date}-${random}`;
}

app.post('/api/orders', async (req, res) => {
  try {
    const data = orderSchema.parse(req.body);

    const orderNo = createOrderNumber();

    let total = 0;
    const orderItems = [];

    for (const item of data.items) {
      const product = await db.get(
        `SELECT * FROM products WHERE id = ? AND active = 1`,
        [item.product_id]
      );

      if (!product) {
        return res.status(400).json({
          error: `محصول با شناسه ${item.product_id} پیدا نشد`
        });
      }

      const price = Number(product.price || 0);
      const quantity = Number(item.quantity);

      total += price * quantity;

      orderItems.push({
        product_id: product.id,
        name: product.name,
        price,
        quantity
      });
    }

    await db.run(
      `
      INSERT INTO orders
      (order_no, customer_name, customer_phone, customer_address, total, status)
      VALUES (?, ?, ?, ?, ?, ?)
      `,
      [
        orderNo,
        data.customer.name,
        data.customer.phone,
        data.customer.address || '',
        total,
        'new'
      ]
    );

    for (const item of orderItems) {
      await db.run(
        `
        INSERT INTO order_items
        (order_no, product_id, product_name, price, quantity)
        VALUES (?, ?, ?, ?, ?)
        `,
        [
          orderNo,
          item.product_id,
          item.name,
          item.price,
          item.quantity
        ]
      );
    }

    res.status(201).json({
      ok: true,
      order_no: orderNo,
      total
    });
  } catch (error) {
    console.error(error);

    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'اطلاعات سفارش کامل یا صحیح نیست'
      });
    }

    res.status(500).json({
      error: 'ثبت سفارش با خطا مواجه شد'
    });
  }
});
