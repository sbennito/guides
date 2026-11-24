---
title: You cannot defend what you cannot see
summary: Where a visibility programme starts: the questions a board needs answered, the seven kinds of signal that answer them, where the blind spots usually are, and the lab this series builds.
eli5: Before you can look after a building you need a light in every room, and a list of the rooms that are still dark.
topic: architecture
lab: 1
---

## What a board needs to be assured of

When a board asks whether the organisation is secure, the honest answer is usually a different question: would we know? Three things sit underneath it.

- **What do we have?** Every system, account, supplier connection and piece of data that matters, with an owner.
- **What is happening on it?** Who is signing in, what is talking to what, what changed, what failed.
- **Would we notice if something went wrong?** Not in theory, but shown: an attack tried in a test, and seen.

Assurance is the third question answered with evidence. It is the last guide in this series because it can only check what the earlier guides have made visible, but it is the reason for all of them. I wrote about the order of things in the field note [Visibility before control](/notes/visibility-before-control/): see first, understand second, control third. This series is the first of those three.

## The seven kinds of signal

Almost everything a security or operations team looks at is one of seven kinds of signal. Each answers a different question, and each has free tools that collect it.

| Signal | The question it answers | Free tools this series uses |
| --- | --- | --- |
| Inventory | What exists, and who owns it | Nmap, NetBox, osquery |
| Logs | What happened, by whom, when | Fluent Bit, Loki, Wazuh |
| Metrics | How busy, how fast, how full | Prometheus, Grafana |
| Flows | Who talked to whom, and how much | Zeek, ntopng |
| Packets | Exactly what was said | Suricata, Wireshark |
| Traces | Where one request spent its time | OpenTelemetry, Tempo |
| Configuration | How things are set up now, and what drifted | Trivy, Prowler, Wazuh |

No single signal is enough. A log tells you a sign-in failed; a flow tells you the same address then talked to a database; an inventory tells you the database holds customer data and who owns it. Visibility is having all three, joined up, in front of the person who has to decide.

## Five layers to check against

The Enlightenment's [Visibility and control](/enlightenment/vnc/) page asks the same questions in five layers. They make a good checklist for each guide.

1. **Inventory**: what is there.
2. **Relationships**: what depends on what.
3. **State**: how it is configured and whether it is healthy.
4. **Activity**: what is happening on it.
5. **Context**: what it matters to, and who owns it.

## Where the blind spots usually are

In most organisations the gaps are in the same places. Each one has a guide in this series.

- Systems nobody owns, so nobody watches them (guide 1).
- What the internet can see of you that you cannot (guide 2).
- Logs that arrive with the wrong time, or are kept too briefly to answer a question three months later (guide 3).
- Traffic between internal systems, which a perimeter firewall never sees (guide 7).
- SaaS applications, which hold much of the data and send their logs somewhere else (guide 13).
- Operational technology such as warehouse sorters, which cannot run an agent (guide 16).
- Calls to AI services, which carry data out and act on your behalf (guide 18).
- The monitoring itself: an agent that quietly stopped sending looks exactly like a quiet system (guide 17).

## The organisation we will watch

Every guide looks at the same made-up organisation: **Cairnmoor Outdoor**, a retailer of outdoor clothing and kit with a website, 14 shops, a warehouse near Perth, about 90 brands it buys from and a dozen contract factories. It is the example behind the Enlightenment's [Cairnmoor views](/enlightenment/vnc/example/). Nothing about it describes a real company. I chose a retailer because everyone has shopped online, so the services need no explaining, and because its busiest weeks are also its riskiest ones. The same thinking applies to a hospital, a council or a manufacturer; only the services change.

## The lab

The lab is a small, stubbed copy of Cairnmoor that runs in Docker on one computer. Each Cairnmoor service is a light stub that answers requests, calls the services it depends on, writes logs and exposes metrics, so every guide has real signals to collect. Suppliers such as payments, couriers and brands are stubs too. A traffic generator plays shoppers on Cairnmoor's clock, busiest from 7pm to 10pm, and one Cairnmoor day passes every hour so a short demo shows a whole day.

The lab grows one step per guide. Step 1, built with this guide, is the estate and its traffic; later steps add the tools that watch it.

The lab has four zones. The estate is what we watch. The edge is the firewall and the sensors that read a copy of the traffic. Observe is where every signal is collected, stored and shown, with Grafana for operations and Wazuh as the SIEM. Test appears only in the assurance and deception guides, to check that an attack is seen.

{figure: lab-zones}

What you need: a computer with Docker and Compose, 16 GB of memory for the full lab (step 1 alone needs well under 1 GB), and an internet connection the first time, to fetch the images. Every image runs on Intel and on Apple Silicon.

```
git clone https://github.com/sbennito/guides
cd guides/lab
docker compose up -d --build
```

Then open http://localhost:8080 for the shop and watch the logs with `docker compose logs -f`. The lab's [README](https://github.com/sbennito/guides/tree/main/lab) lists what runs and how to stop it.

## How each guide is laid out

Each guide follows the same pattern, so you can skip to the part you need.

- **The question** it answers, and why it matters.
- **The tools**, all free or with a free tier, and where the paid line falls.
- **Build it**: the lab step, with what you should see when it works.
- **Seeing AI**: how AI services and agents show up at that layer. I assume every AI service is bought as SaaS.
- **AI in the way we work**: where AI drafts, explains or suggests, with a person deciding.
- **A decoy**: one tripwire to plant in what the guide just made visible.
- **Next**: what the Understand and Control series will add on top.

## The rest of the series

The [See series page](../) lists all nineteen guides that follow this one, one a week. The Understand and Control series come after it and reuse the same lab.
