// Eenmalige/herhaalbare loader voor reparatie_marktprijzen. POST de gescrapete data
// (array van { merk, model, rijen:[{categorie,optie,kwaliteit,prijs_min,prijs_max}] }).
// Beveiligd met een token in de Authorization-header. Vervangt alle rijen van dezelfde
// bron. Bedoeld om vanaf een pc te draaien na een nieuwe scrape, niet vanuit de app.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

const TOKEN = "storvo-marktprijzen-7f3ac91be24d";

function norm(s: string) { return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); }

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("POST", { status: 405 });
  if (req.headers.get("authorization") !== "Bearer " + TOKEN) return new Response("nee", { status: 401 });

  let data: any;
  try { data = await req.json(); } catch { return new Response(JSON.stringify({ error: "onleesbaar" }), { status: 400 }); }
  if (!Array.isArray(data)) return new Response(JSON.stringify({ error: "verwacht een array" }), { status: 400 });

  const bron = "gsm-world";
  const rows: any[] = [];
  for (const m of data) {
    const model = String(m.model || "").trim();
    if (model.length < 2) continue;
    const mn = norm(model);
    for (const r of (m.rijen || [])) {
      const pmin = Number(r.prijs_min);
      if (!(pmin > 0)) continue;
      rows.push({
        bron, merk: String(m.merk || "Overig"), model, model_norm: mn,
        categorie: String(r.categorie || "Overig"), optie: String(r.optie || "").slice(0, 300),
        kwaliteit: String(r.kwaliteit || ""), prijs_min: pmin, prijs_max: Number(r.prijs_max || pmin),
      });
    }
  }

  await admin.from("reparatie_marktprijzen").delete().eq("bron", bron);
  let ingevoerd = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await admin.from("reparatie_marktprijzen").insert(rows.slice(i, i + 500));
    if (error) return new Response(JSON.stringify({ error: error.message, ingevoerd }), { status: 500 });
    ingevoerd += Math.min(500, rows.length - i);
  }
  return new Response(JSON.stringify({ ok: true, ingevoerd }), { headers: { "Content-Type": "application/json" } });
});
