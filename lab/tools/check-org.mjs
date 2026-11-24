// Checks that the lab's estate.json covers every Cairnmoor business service in the Enlightenment's organisation file,
// so the lab and the Cairnmoor views cannot drift apart. Usage, from lab/:
//   node tools/check-org.mjs <path to sbennito/harmonisation>/tools/vnc/content/org.mjs
// Services the lab does not run yet are listed with the guide that adds them, and are not an error.
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const LATER = { analytics: "guide 10 (databases)", corporate: "guide 14 (endpoints)" };
const file = process.argv[2];
if (!file) { console.error("Give the path to org.mjs."); process.exit(2); }
const { SERVICES } = await import(pathToFileURL(resolve(file)).href);
const estate = JSON.parse(readFileSync(new URL("../estate.json", import.meta.url), "utf8"));
const inLab = new Set(Object.values(estate.services).map((s) => s.org).filter(Boolean));
let bad = 0;
for (const s of SERVICES) {
  if (inLab.has(s.id)) {
    const stub = Object.values(estate.services).find((x) => x.org === s.id);
    if (stub.owner !== s.owner || stub.tier !== s.tier) { console.error(`${s.id}: owner or tier differs from org.mjs (${s.owner}, tier ${s.tier})`); bad++; }
  } else if (LATER[s.id]) console.log(`${s.name}: not in the lab yet, added in ${LATER[s.id]}`);
  else { console.error(`${s.name} (${s.id}) is in org.mjs but not in estate.json`); bad++; }
}
for (const id of inLab) if (!SERVICES.some((s) => s.id === id)) { console.error(`estate.json uses org "${id}", which org.mjs does not have`); bad++; }
if (bad) process.exit(1);
console.log("estate.json matches org.mjs.");
