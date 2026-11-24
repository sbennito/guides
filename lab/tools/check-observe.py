"""Check that Prometheus reads every service in estate.json, and nothing else, so the dashboard covers the whole estate."""
import json, re, sys
from pathlib import Path
lab = Path(__file__).resolve().parent.parent
services = set(json.loads((lab / "estate.json").read_text())["services"])
config = (lab / "observe/prometheus/prometheus.yml").read_text()
job = config.split("job_name: cairnmoor", 1)[1].split("job_name:", 1)[0]
scraped = set(re.findall(r"- ([a-z0-9-]+):8000", job))
missing, extra = sorted(services - scraped), sorted(scraped - services)
if missing or extra:
    sys.exit(f"observe/prometheus/prometheus.yml is out of step with estate.json: missing {missing}, extra {extra}")
json.loads((lab / "observe/grafana/dashboards/cairnmoor.json").read_text())
print(f"ok: Prometheus reads all {len(services)} services")
