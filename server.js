import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import crypto from 'node:crypto';
import { z } from 'zod';
import { db } from './db.js';

const app = express();

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.sendFile(new URL('./index.html', import.meta.url).pathname);
});

/* =========================
   ORDER VALIDATION
========================= */

const orderSchema = z.object({
  customer: z.object({
    name: z.string().trim().min(2),
    phone: z.string().trim().regex(/^09\d{9}$/),
    address: z.string().trim().min(8)
  }),
  items: z.array(
    z.object({
      productId: z.number().int().positive(),
      quantity: z.number().int().min(1).max(50)
    })
  ).min(1)
});

/* =========================
   ORDER NUMBER
========================= */

function makeOrderNo() {
  return 'LT-' + crypto.randomInt(10000000, 99999999);
}

/* =========================
   PRODUCTS
========================= */

app.get('/api/products', (req, res) => {
  try {
    const products = db.prepare(
      'SELECT * FROM products WHERE active=1 ORDER BY id DESC'
    ).all();

    res.json(products);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: 'خطا در دریافت محصولات.'
    });
  }
});

/* =========================
   CREATE ORDER
========================= */

app.post('/api/orders', (req, res) => {
  try {
    const parsed = orderSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        error: 'اطلاعات سفارش نامعتبر است.'
      });
    }

    const ids = parsed.data.items.map(item => item.productId);

    const placeholders = ids.map(() => '?').join(',');

    const products = db.prepare(
      `SELECT * FROM products
       WHERE active=1
       AND id IN (${placeholders})`
    ).all(...ids);

    if (products.length !== ids.length) {
      return res.status(400).json({
        error: 'یکی از محصولات موجود نیست.'
      });
    }

    const productMap = new Map(
      products.map(product => [product.id, product])
    );

    let total = 0;

    const normalizedItems = parsed.data.items.map(item => {
      const product = productMap.get(item.productId);

      if (!product) {
        throw new Error('Product not found');
      }

      total += Number(product.price) * item.quantity;

      return {
        productId: item.productId,
        quantity: item.quantity,
        product
      };
    });

    const orderNo = makeOrderNo();

    const createOrder = db.transaction(() => {
      const info = db.prepare(`
        INSERT INTO orders(
          order_no,
          customer_name,
          phone,
          address,
          total,
          status
        )
        VALUES(?,?,?,?,?,'pending')
      `).run(
        orderNo,
        parsed.data.customer.name,
        parsed.data.customer.phone,
        parsed.data.customer.address,
        total
      );

      const insertItem = db.prepare(`
        INSERT INTO order_items(
          order_id,
          product_id,
          name,
          price,
          quantity
        )
        VALUES(?,?,?,?,?)
      `);

      for (const item of normalizedItems) {
        insertItem.run(
          info.lastInsertRowid,
          item.product.id,
          item.product.name,
          item.product.price,
          item.quantity
        );
      }
    });

    createOrder();

    res.status(201).json({
      ok: true,
      orderNo,
      amount: total,
      payment: {
        mode: 'demo',
        message:
          'ساختار پرداخت آماده است؛ برای پرداخت واقعی credentials درگاه لازم است.'
      }
    });

  } catch (error) {
    console.error('CREATE ORDER ERROR:', error);

    res.status(500).json({
      error: 'خطا در ثبت سفارش. لطفاً دوباره تلاش کنید.'
    });
  }
});

/* =========================
   GET SINGLE ORDER
========================= */

app.get('/api/orders/:orderNo', (req, res) => {
  try {
    const order = db.prepare(
      'SELECT * FROM orders WHERE order_no=?'
    ).get(req.params.orderNo);

    if (!order) {
      return res.status(404).json({
        error: 'سفارش پیدا نشد.'
      });
    }

    const items = db.prepare(
      'SELECT * FROM order_items WHERE order_id=?'
    ).all(order.id);

    res.json({
      ...order,
      items
    });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: 'خطا در دریافت سفارش.'
    });
  }
});

/* =========================
   PAYMENT CALLBACK
========================= */

app.get('/api/payment/callback', (req, res) => {
  res.status(501).send(
    'Callback endpoint آماده است، اما provider واقعی هنوز پیکربندی نشده است.'
  );
});

/* =========================
   HEALTH CHECK
========================= */

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    service: 'LOVE TIME API'
  });
});

/* =========================
   ADMIN AUTH
========================= */

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';

function adminAuth(req, res, next) {
  if (!ADMIN_PASSWORD) {
    return res.status(503).json({
      error: 'ADMIN_PASSWORD تنظیم نشده است.'
    });
  }

  if (req.get('x-admin-password') !== ADMIN_PASSWORD) {
    return res.status(401).json({
      error: 'رمز مدیریت اشتباه است.'
    });
  }

  next();
}

/* =========================
   ADMIN PANEL
========================= */

app.get('/admin', (req, res) => {
  res.sendFile(
    new URL('./admin.html', import.meta.url).pathname
  );
});

/* =========================
   ADMIN ORDERS
========================= */

app.get('/api/admin/orders', adminAuth, (req, res) => {
  try {
    const orders = db.prepare(
      'SELECT * FROM orders ORDER BY id DESC'
    ).all();

    const itemStmt = db.prepare(
      `SELECT product_id,name,price,quantity
       FROM order_items
       WHERE order_id=?`
    );

    res.json(
      orders.map(order => ({
        ...order,
        items: itemStmt.all(order.id)
      }))
    );

  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: 'خطا در دریافت سفارش‌ها.'
    });
  }
});

/* =========================
   CHANGE ORDER STATUS
========================= */

app.patch('/api/admin/orders/:orderNo', adminAuth, (req, res) => {
  try {
    const allowed = [
      'pending',
      'confirmed',
      'shipped',
      'completed',
      'cancelled'
    ];

    if (!allowed.includes(req.body?.status)) {
      return res.status(400).json({
        error: 'وضعیت نامعتبر است.'
      });
    }

    const result = db.prepare(
      'UPDATE orders SET status=? WHERE order_no=?'
    ).run(
      req.body.status,
      req.params.orderNo
    );

    if (!result.changes) {
      return res.status(404).json({
        error: 'سفارش پیدا نشد.'
      });
    }

    res.json({
      ok: true
    });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: 'خطا در تغییر وضعیت سفارش.'
    });
  }
});

/* =========================
   START SERVER
========================= */

const PORT = Number(process.env.PORT || 3000);

app.listen(PORT, '0.0.0.0', () => {
  console.log(
    `LOVE TIME API running on port ${PORT}`
  );
});
