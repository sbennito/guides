"""One stub for every Cairnmoor service in the lab.

Each container runs this file with SERVICE set to its name and reads lab/estate.json to learn what it answers
(routes), whom it calls on each request (calls) and what it does on its own (ticks: tills sending sales, a courier
collecting parcels, a brand sending a shipping notice). It writes one JSON log line per request served and per call
made, exposes Prometheus metrics at /metrics, and passes a W3C traceparent header along so later guides can join a
request across services. Standard library only, so the image builds the same on Intel and Apple Silicon.

The Cairnmoor clock: CLOCK_SPEED (default 24) Cairnmoor hours pass per real hour, so one Cairnmoor day takes an hour.
Traffic follows the day's curve, busiest from 7pm to 10pm; PEAK=1 is peak season. POST /_admin/fault changes how
this service behaves (extra latency, an error rate, or down), for the incident scenarios in later guides.
"""
import json
import os
import random
import secrets
import sys
import threading
import time
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

SERVICE = os.environ["SERVICE"]
ESTATE = json.load(open(os.environ.get("ESTATE", "/estate.json")))
ME = ESTATE["services"][SERVICE]
PORT = int(os.environ.get("PORT", "8000"))
CLOCK_SPEED = float(os.environ.get("CLOCK_SPEED", "24"))
PEAK = os.environ.get("PEAK", "0") == "1"
CURVE = ESTATE["clock"]["curve"]  # 24 weights, one per Cairnmoor hour, 0 to 1
PEAK_FACTOR = ESTATE["clock"]["peak_factor"]

fault = {"latency_ms": 0, "error_rate": 0.0, "down": False}
lock = threading.Lock()
counts = {}  # (route, status) -> count
buckets = (0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0)
hist = {}  # route -> [bucket counts..., +Inf, sum, count]
backlog = []  # calls a tick could not make, retried later (a shop whose link dropped keeps selling)


def cairnmoor_hour():
    return (time.time() * CLOCK_SPEED / 3600) % 24


def load():
    """How busy Cairnmoor is now, 0 to 1 (more in peak season)."""
    h = cairnmoor_hour()
    a, b = CURVE[int(h) % 24], CURVE[(int(h) + 1) % 24]
    w = a + (b - a) * (h - int(h))
    return w * (PEAK_FACTOR if PEAK else 1)


def log(**fields):
    fields = {"ts": time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime()) + f".{int(time.time() * 1000) % 1000:03d}Z",
              "service": SERVICE, **fields}
    sys.stdout.write(json.dumps(fields) + "\n")
    sys.stdout.flush()


def record(route, status, seconds):
    with lock:
        counts[(route, status)] = counts.get((route, status), 0) + 1
        h = hist.setdefault(route, [0] * (len(buckets) + 3))
        for i, b in enumerate(buckets):
            if seconds <= b:
                h[i] += 1
        h[len(buckets)] += 1
        h[-2] += seconds
        h[-1] += 1


def metrics():
    lines = ["# HELP cairnmoor_requests_total Requests this service answered.", "# TYPE cairnmoor_requests_total counter"]
    with lock:
        for (route, status), n in sorted(counts.items()):
            lines.append(f'cairnmoor_requests_total{{service="{SERVICE}",route="{route}",status="{status}"}} {n}')
        lines += ["# HELP cairnmoor_request_seconds Time to answer a request.", "# TYPE cairnmoor_request_seconds histogram"]
        for route, h in sorted(hist.items()):
            for i, b in enumerate(buckets):
                lines.append(f'cairnmoor_request_seconds_bucket{{service="{SERVICE}",route="{route}",le="{b}"}} {h[i]}')
            lines.append(f'cairnmoor_request_seconds_bucket{{service="{SERVICE}",route="{route}",le="+Inf"}} {h[len(buckets)]}')
            lines.append(f'cairnmoor_request_seconds_sum{{service="{SERVICE}",route="{route}"}} {h[-2]:.6f}')
            lines.append(f'cairnmoor_request_seconds_count{{service="{SERVICE}",route="{route}"}} {h[-1]}')
        lines += ["# HELP cairnmoor_backlog Calls waiting to be retried.", "# TYPE cairnmoor_backlog gauge",
                  f'cairnmoor_backlog{{service="{SERVICE}"}} {len(backlog)}',
                  "# HELP cairnmoor_load How busy Cairnmoor is on its clock, 0 to 1.", "# TYPE cairnmoor_load gauge",
                  f'cairnmoor_load{{service="{SERVICE}"}} {load():.3f}']
    return "\n".join(lines) + "\n"


def call(target, method, trace, parent, body=None):
    """Call another stub: target is "service/path". Returns the status code (0 when unreachable)."""
    svc, _, path = target.partition("/")
    span = secrets.token_hex(8)
    data = json.dumps(body or {"from": SERVICE}).encode() if method == "POST" else None
    req = urllib.request.Request(f"http://{svc}:{PORT}/{path}", data=data, method=method,
                                 headers={"traceparent": f"00-{trace}-{span}-01", "content-type": "application/json",
                                          "user-agent": f"cairnmoor-{SERVICE}"})
    start = time.time()
    try:
        with urllib.request.urlopen(req, timeout=5) as r:
            status = r.status
    except urllib.error.HTTPError as e:
        status = e.code
    except Exception:
        status = 0
    log(kind="call", target=svc, method=method, path="/" + path, status=status,
        ms=round((time.time() - start) * 1000), trace_id=trace, span_id=span, parent_id=parent)
    return status


def match(method, path):
    for r in ME.get("routes", []):
        if r["method"] == method and (path == r["path"] or (r["path"].endswith("*") and path.startswith(r["path"][:-1]))):
            return r
    return None


class Handler(BaseHTTPRequestHandler):
    server_version = "cairnmoor-stub"
    sys_version = ""

    def log_message(self, *args):  # the stub writes its own JSON lines
        pass

    def reply(self, status, body, ctype="application/json"):
        data = body.encode() if isinstance(body, str) else json.dumps(body).encode()
        self.send_response(status)
        self.send_header("content-type", ctype)
        self.send_header("content-length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def handle_any(self, method):
        path = self.path.split("?")[0]
        length = int(self.headers.get("content-length") or 0)
        raw = self.rfile.read(length) if length else b""
        if path == "/metrics":
            return self.reply(200, metrics(), "text/plain; version=0.0.4")
        if path == "/healthz":
            return self.reply(503 if fault["down"] else 200, {"service": SERVICE, "ok": not fault["down"]})
        if path == "/_admin/fault":
            if method == "POST":
                fault.update({k: v for k, v in json.loads(raw or b"{}").items() if k in fault})
                log(kind="admin", action="fault", fault=fault)
            return self.reply(200, fault)

        start = time.time()
        tp = self.headers.get("traceparent", "")
        parts = tp.split("-")
        trace = parts[1] if len(parts) == 4 else secrets.token_hex(16)
        parent = parts[2] if len(parts) == 4 else None
        span = secrets.token_hex(8)
        route = match(method, path)
        client = self.headers.get("x-forwarded-for", self.client_address[0])

        if fault["down"]:
            status = 503
        elif not route:
            status = 404
        else:
            time.sleep(max(0, random.gauss(route.get("latency_ms", 20), route.get("latency_ms", 20) / 4) + fault["latency_ms"]) / 1000)
            status = 200
            for c in route.get("calls", []):
                s = call(c["to"], c.get("method", "POST"), trace, span)
                if (s == 0 or s >= 500) and not c.get("optional"):
                    status = 502
                    break
            if status == 200 and random.random() < max(route.get("error_rate", 0), fault["error_rate"]):
                status = 500
        seconds = time.time() - start
        name = route["path"] if route else "unmatched"
        record(name, status, seconds)
        log(kind="request", method=method, path=path, route=name, status=status, ms=round(seconds * 1000),
            client=client, user_agent=self.headers.get("user-agent", ""), trace_id=trace, span_id=span, parent_id=parent)
        if route and route.get("html") and status == 200:
            return self.reply(200, route["html"], "text/html; charset=utf-8")
        return self.reply(status, {"service": SERVICE, "route": name, "status": status})

    def do_GET(self):
        self.handle_any("GET")

    def do_POST(self):
        self.handle_any("POST")


def ticker(tick):
    """Do something on our own, more often when Cairnmoor is busy (unless the tick is steady, like a heartbeat)."""
    per_min = tick["per_min"]
    while True:
        rate = per_min * (1 if tick.get("steady") else max(load(), 0.05))
        time.sleep(random.expovariate(rate / 60) if rate > 0 else 60)
        if fault["down"]:
            continue
        status = call(tick["to"], tick.get("method", "POST"), secrets.token_hex(16), None, {"from": SERVICE, "what": tick.get("what", "")})
        if (status == 0 or status >= 500) and tick.get("queue"):
            with lock:
                backlog.append(tick)


def retry_backlog():
    while True:
        time.sleep(10)
        with lock:
            pending, backlog[:] = backlog[:], []
        for i, tick in enumerate(pending):
            status = call(tick["to"], tick.get("method", "POST"), secrets.token_hex(16), None, {"from": SERVICE, "what": tick.get("what", ""), "replayed": True})
            if status == 0 or status >= 500:
                with lock:
                    backlog.extend(pending[i:])
                break


if __name__ == "__main__":
    for t in ME.get("ticks", []):
        threading.Thread(target=ticker, args=(t,), daemon=True).start()
    threading.Thread(target=retry_backlog, daemon=True).start()
    log(kind="start", tier=ME.get("tier"), owner=ME.get("owner"), port=PORT, clock_speed=CLOCK_SPEED, peak=PEAK)
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
