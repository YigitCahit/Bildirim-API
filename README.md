# Bildirim API

Fastify + PostgreSQL + Redis/BullMQ ile Web Push bildirim servisi.

## Ozellikler

- API key korumali endpointler
- Subscription upsert/list/deactivate
- User ve subscription bazli hedefleme
- Idempotency (`Idempotency-Key`) destegi
- Asenkron teslimat (BullMQ worker)
- Basit health/readiness endpointleri

## Gereksinimler

- Node.js 20+
- PostgreSQL 14+
- Redis 6+

## Kurulum

```bash
npm install
cp .env.example .env
npm run migrate
```

## Calistirma

API:

```bash
npm run dev
```

Worker:

```bash
npm run worker
```

## Ornek Istekler

Subscription upsert:

```bash
curl -X POST http://localhost:3000/api/subscriptions/upsert \
  -H "Content-Type: application/json" \
  -H "x-api-key: dev-key-1" \
  -H "Idempotency-Key: sub-1" \
  -d '{
    "externalUserId":"u-123",
    "endpoint":"https://fcm.googleapis.com/fcm/send/abc",
    "keys":{"p256dh":"base64key","auth":"base64auth"}
  }'
```

Bildirim enqueue:

```bash
curl -X POST http://localhost:3000/api/notifications/enqueue \
  -H "Content-Type: application/json" \
  -H "x-api-key: dev-key-1" \
  -H "Idempotency-Key: notif-1" \
  -d '{
    "target":{"userId":"00000000-0000-0000-0000-000000000000"},
    "payload":{"title":"Merhaba","body":"Yeni bildiriminiz var"}
  }'
```

## Endpointler

- `GET /health`
- `GET /ready`
- `POST /api/subscriptions/upsert`
- `GET /api/subscriptions?userId=<uuid>&activeOnly=true`
- `DELETE /api/subscriptions/:id`
- `POST /api/notifications/enqueue`
- `GET /api/notifications/:id`
- `GET /api/users/:userId/notifications?limit=50`

## Notlar

- `Idempotency-Key` `subscription upsert` ve `notification enqueue` endpointlerinde desteklenir.
- 404/410 push hatalarinda subscription pasiflenir.
- Delivery attempt kayitlari veritabaninda tutulur; retention temizligi icin cron görevi eklenebilir.
