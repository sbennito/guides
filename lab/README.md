# The Cairnmoor lab

A small, stubbed copy of Cairnmoor Outdoor, the made-up retailer the [guides](https://lgkm.org/guides/) watch. It runs
in Docker on one computer, on Intel or Apple Silicon. Nothing here describes a real company.

The lab grows one step per guide. This is **step 1** ([guide 0](https://lgkm.org/guides/see/overview/)): the estate
and its traffic. Later steps add the edge (firewall and network sensors) and the tools that collect, store and show
every signal.

## Run it

You need Docker with Compose and an internet connection the first time, to fetch the images.

```
docker compose up -d --build
```

- The shop's front door is http://localhost:18080 (only on your own machine). If that port is taken, pick another:
  `LAB_PORT=18081 docker compose up -d`.
- Watch everything: `docker compose logs -f`. One service: `docker compose logs -f orders`.
- Stop it: `docker compose down`.

Step 1 uses well under 1 GB of memory.

## What runs

| Container | Cairnmoor service (tier) | What it does |
| --- | --- | --- |
| `edge` | Front door | HAProxy on port 18080, routing shoppers, staff and partners to the services; logs every request |
| `orders` | Online orders (1) | Shop pages, basket and checkout; checkout calls accounts, fraud, payments and the warehouse |
| `search` | Search and product pages (2) | Search, product pages, stock levels |
| `accounts` | Customer accounts (2) | Sign-in and sessions (a stub until the identity guide brings Keycloak) |
| `stores` | Shops and tills (1) | Head office for the shops: sales, heartbeats, stock lookups |
| `shop-perth`, `shop-inverness`, `shop-york` | Shops and tills (1) | Three of the 14 shops: tills send sales and heartbeats; sales queue and replay if head office cannot be reached |
| `warehouse` | Warehouse and delivery (1) | Orders, returns, goods in; hands parcels to the couriers |
| `wholesale` | Wholesale portal (2) | Bulk orders from independent stores |
| `supply` | Buying and supply (2) | Shipping notices and order confirmations from brands and factories |
| `service` | Customer service (2) | Returns, refunds and chat |
| `payments`, `fraud`, `couriers` | Suppliers (stubs) | Card payments, fraud scoring, three couriers |
| `brands` | Suppliers (stub) | Brands, factories and wholesale stores sending notices and orders |
| `shoppers` | Customers | k6 playing shoppers on Cairnmoor's clock |

Corporate IT and reporting arrive with the guides that need them (endpoints and databases).

## The Cairnmoor clock

One Cairnmoor day passes every real hour (`CLOCK_SPEED=24`), so a short demo shows the whole daily curve: quiet
overnight, busiest from 7pm to 10pm. Set `PEAK=1` for peak season (two and a half times the traffic) and `SHOPPERS` for
the number of simulated shoppers (default 20). These and `LAB_PORT` can go in a `.env` file next to `compose.yaml`, or:

```
PEAK=1 docker compose up -d
```

## Signals each stub gives

- **Logs**: one JSON line per request answered and per call made, with a W3C trace id so a request can be followed
  across services.
- **Metrics**: Prometheus format at `/metrics` on port 8000 inside the lab network (requests, latency, backlog and the
  clock's load).
- **Health**: `/healthz`.

## Faults, for the incident scenarios

Every stub accepts a fault at `POST /_admin/fault` inside the lab network: extra latency, an error rate, or down.

```
docker compose exec couriers python -c "import urllib.request as u, json; u.urlopen(u.Request('http://localhost:8000/_admin/fault', json.dumps({'latency_ms': 2000}).encode(), method='POST'))"
```

That makes the couriers slow, so despatch backs up. Send `{"latency_ms": 0, "error_rate": 0, "down": false}` to clear it.
Later guides wrap the scenarios in a single command.

## Keeping the lab in step with Cairnmoor

`estate.json` follows the organisation in the Enlightenment (`tools/vnc/content/org.mjs` in sbennito/harmonisation).
Check it with `node tools/check-org.mjs <path to org.mjs>`.
