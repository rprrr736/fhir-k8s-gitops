const express = require("express");
const app = express();
const PORT = process.env.PORT || 3000;
const FHIR_BASE = process.env.FHIR_BASE || "https://hapi.fhir.org/baseR4";

app.use(express.json());

async function fhir(path, options = {}) {
  const res = await fetch(`${FHIR_BASE}${path}`, {
    ...options,
    headers: { Accept: "application/fhir+json", ...(options.headers || {}) },
    signal: AbortSignal.timeout(20000),
  });
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text };
  }
  return { status: res.status, body };
}

function summarize(p) {
  const n = p.name && p.name[0];
  return {
    id: p.id,
    name: n ? [(n.given || []).join(" "), n.family].filter(Boolean).join(" ") : null,
    gender: p.gender,
    birthDate: p.birthDate,
  };
}

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.get("/hello", (req, res) => {
  res.json({ message: "Hello from Kubernetes v5" });
});

app.get("/patients", async (req, res) => {
  const q = new URLSearchParams({ _count: "5" });
  if (req.query.name) q.set("name", req.query.name);
  try {
    const { status, body } = await fhir(`/Patient?${q}`);
    if (status !== 200) return res.status(status).json(body);
    res.json((body.entry || []).map((e) => summarize(e.resource)));
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

app.get("/patients/:id", async (req, res) => {
  try {
    const { status, body } = await fhir(`/Patient/${encodeURIComponent(req.params.id)}`);
    if (status !== 200) return res.status(status).json(body);
    res.json(summarize(body));
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

app.post("/patients", async (req, res) => {
  const { given, family, gender, birthDate } = req.body || {};
  if (!family) return res.status(400).json({ error: "family is required" });
  const resource = {
    resourceType: "Patient",
    name: [{ family, given: given ? [given] : [] }],
    gender,
    birthDate,
  };
  try {
    const { status, body } = await fhir("/Patient", {
      method: "POST",
      headers: { "Content-Type": "application/fhir+json" },
      body: JSON.stringify(resource),
    });
    if (status !== 201 && status !== 200) return res.status(status).json(body);
    res.status(201).json(summarize(body));
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

app.delete("/patients/:id", async (req, res) => {
  try {
    const { status, body } = await fhir(`/Patient/${encodeURIComponent(req.params.id)}`, {
      method: "DELETE",
    });
    if (status === 200 || status === 204) return res.json({ deleted: req.params.id });
    res.status(status).json(body);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

app.put("/patients/:id", async (req, res) => {
  const { given, family, gender, birthDate } = req.body || {};
  if (!family) return res.status(400).json({ error: "family is required" });
  const resource = {
    resourceType: "Patient",
    id: req.params.id,
    name: [{ family, given: given ? [given] : [] }],
    gender,
    birthDate,
  };
  try {
    const { status, body } = await fhir(`/Patient/${encodeURIComponent(req.params.id)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/fhir+json" },
      body: JSON.stringify(resource),
    });
    if (status !== 200 && status !== 201) return res.status(status).json(body);
    res.json(summarize(body));
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`API listening on port ${PORT}`);
});