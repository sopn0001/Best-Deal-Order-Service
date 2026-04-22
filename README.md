# Best Deal Store — Order Service

**Node.js** (Express) REST API for creating and listing orders. Persists to **MongoDB** and publishes new orders to **RabbitMQ** for the Makeline consumer. Listens on **port 3002**.

## What this service does

This service is the **system of record for new orders** from the storefront. When a customer checks out, the front end posts here; the API validates the payload, stores the order document in MongoDB, and **publishes a message** to RabbitMQ so processing is asynchronous and decoupled from the HTTP request. Listing orders answers “what has been submitted?” for simple dashboards. The **Makeline** worker consumes the queue and moves orders through fulfilment states, so this service focuses on **accepting** and **recording** orders, not on running the full pipeline in the request thread.

## HTTP API (base URL `http://<host>:3002`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Liveness; `{ "status": "ok" }`. |
| GET | `/orders` | List orders (newest first); each item includes `id`. |
| POST | `/orders` | Create order; body = storefront order JSON; **201** `{ "id" }`. **503** if RabbitMQ not connected yet. |
| PUT | `/orders/{id}` | Set `status` from JSON body `{ "status": "<value>" }`. |

## Stack

- Node 20, Express  
- `amqplib`, MongoDB driver

## Run locally

Set `MONGO_URL`, `DB_NAME`, and `RABBITMQ_URL`, then:

```bash
npm install
npm start
```

Health check: `GET /health`

## Docker

```bash
docker build -t best-deal-order-service .
```

