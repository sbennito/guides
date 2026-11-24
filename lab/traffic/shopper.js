// Shoppers on Cairnmoor's clock. Each virtual shopper browses, searches, sometimes signs in, buys, tracks a parcel
// or asks for a return, through the front door (HAProxy). How often depends on the Cairnmoor hour: busiest from 7pm
// to 10pm, quiet overnight, and 2.5 times busier when PEAK=1. Client addresses come from the documentation ranges
// (198.51.100.0/24 and 203.0.113.0/24), so the logs show many customers without using real addresses.
import http from "k6/http";
import { sleep } from "k6";

const estate = JSON.parse(open("/estate.json"));
const CURVE = estate.clock.curve;
const SPEED = Number(__ENV.CLOCK_SPEED || 24);
const PEAK = __ENV.PEAK === "1" ? estate.clock.peak_factor : 1;
const BASE = __ENV.BASE || "http://edge:8080";
const SHOPPERS = Number(__ENV.SHOPPERS || 20);

export const options = { scenarios: { shoppers: { executor: "constant-vus", vus: SHOPPERS, duration: "8760h" } }, discardResponseBodies: true };

function load() {
  const h = ((Date.now() / 1000) * SPEED / 3600) % 24;
  const a = CURVE[Math.floor(h) % 24], b = CURVE[(Math.floor(h) + 1) % 24];
  return (a + (b - a) * (h - Math.floor(h))) * PEAK;
}

const pick = (xs) => xs[Math.floor(Math.random() * xs.length)];
const TERMS = ["waterproof jacket", "walking boots", "two person tent", "down jacket", "base layer", "head torch", "rucksack 35l", "gaiters"];

export default function () {
  // Below full load, most shoppers stay away: the share who visit follows the clock.
  if (Math.random() > Math.min(load(), 1)) { sleep(5); return; }
  const ip = `${pick(["198.51.100", "203.0.113"])}.${1 + Math.floor(Math.random() * 254)}`;
  const params = { headers: { "X-Forwarded-For": ip, "User-Agent": pick(["Mozilla/5.0 (iPhone)", "Mozilla/5.0 (Windows NT 10.0)", "Mozilla/5.0 (Macintosh)", "Mozilla/5.0 (Android)"]) } };
  const think = () => sleep(1 + Math.random() * 3);

  http.get(`${BASE}/`, params); think();
  http.get(`${BASE}/search?q=${encodeURIComponent(pick(TERMS))}`, params); think();
  for (let i = 0; i < 1 + Math.floor(Math.random() * 3); i++) { http.get(`${BASE}/product/${1000 + Math.floor(Math.random() * 400)}`, params); think(); }
  if (Math.random() < 0.3) { http.post(`${BASE}/signin`, "{}", params); think(); }
  if (Math.random() < 0.4) {
    http.post(`${BASE}/basket`, "{}", params); think();
    if (Math.random() < 0.6) { http.post(`${BASE}/checkout`, "{}", params); think(); }
  }
  if (Math.random() < 0.1) { http.get(`${BASE}/track/${Math.floor(Math.random() * 1e6)}`, params); think(); }
  if (Math.random() < 0.05) { http.post(`${BASE}/help/chat`, "{}", params); think(); }
  if (Math.random() < 0.02) { http.post(`${BASE}/help/return`, "{}", params); }
}
