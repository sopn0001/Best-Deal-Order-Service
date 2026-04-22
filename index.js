const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');
const amqp = require('amqplib');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

const MONGO_URL   = process.env.MONGO_URL   || 'mongodb://localhost:27017';
const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://localhost';
const DB_NAME     = process.env.DB_NAME     || 'bestdeal';
const QUEUE       = 'orders';

let db, channel;

/** RabbitMQ in background so /health is available while the broker comes up (avoids init-container deadlocks). */
async function connectRabbitBackground() {
  let attempt = 0;
  while (true) {
    try {
      const conn = await amqp.connect(RABBITMQ_URL);
      channel = await conn.createChannel();
      await channel.assertQueue(QUEUE, { durable: true });
      console.log('Connected to RabbitMQ');
      return;
    } catch (e) {
      attempt += 1;
      console.log(`RabbitMQ not ready (${attempt}), retrying in 3s...`, e.message || e);
      await new Promise(r => setTimeout(r, 3000));
    }
  }
}

async function init() {
  const mongoClient = new MongoClient(MONGO_URL);
  await mongoClient.connect();
  db = mongoClient.db(DB_NAME);

  app.listen(3002, () => console.log('Order Service running on port 3002'));
  connectRabbitBackground();
}

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.get('/orders', async (_req, res) => {
  const orders = await db.collection('orders').find().sort({ created_at: -1 }).toArray();
  res.json(orders.map(o => ({ ...o, id: o._id.toString() })));
});

app.post('/orders', async (req, res) => {
  if (!channel) {
    return res.status(503).json({ error: 'Order queue unavailable' });
  }
  const order = { ...req.body, status: 'pending', created_at: new Date() };
  const result = await db.collection('orders').insertOne(order);
  const id = result.insertedId.toString();
  channel.sendToQueue(QUEUE, Buffer.from(JSON.stringify({ id, ...order })), { persistent: true });
  res.status(201).json({ id });
});

app.put('/orders/:id', async (req, res) => {
  await db.collection('orders').updateOne(
    { _id: new ObjectId(req.params.id) },
    { $set: { status: req.body.status } }
  );
  res.json({ updated: req.params.id });
});

init().catch((err) => {
  console.error(err);
  process.exit(1);
});
