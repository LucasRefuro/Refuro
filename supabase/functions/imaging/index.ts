// Werkplaats-imaging: een laptop automatisch installeren door een BESTAANDE
// golden image opnieuw uit te rollen via FOG Project.
//
// Belangrijk en eerlijk: deze functie installeert NIET zelf. Het echte imagen
// gebeurt tussen de FOG-server en de laptop over het lokale werkplaatsnetwerk
// (PXE-boot). Storvo doet alleen de administratie en schiet via de FOG-API een
// deploy-taak in; de laptop pakt die bij de volgende netwerkboot. De FOG-server
// (met de image-bibliotheek) draait los in de werkplaats en moet vanaf internet
// bereikbaar zijn (het veiligst via een VPN zoals Tailscale/WireGuard).
//
// De FOG-tokens zijn geheimen: ze staan in imaging_instellingen, een tabel met
// RLS aan en GEEN policies, dus alleen deze functie (service_role) komt erbij.
// Ze komen nooit terug naar de browser.
//
// Acties (POST { actie: ... }):
//   config      - de FOG-koppeling opslaan (url + tokens)
//   test        - verbinding testen (GET /fog/system/info)
//   images-sync - de image-bibliotheek uit FOG halen naar imaging_images
//   deploy      - een deploy-taak inschieten voor een toestel (host + image + taak)
//   status      - de actieve taken opvragen

import { admin, cors, fout, wieBelt } from "../_gedeeld/shopify.ts";

async function cfgVan(teamId: string) {
  const { data } = await admin.from("imaging_instellingen")
    .select("*").eq("team_id", teamId).maybeSingle();
  return data;
}
function fogHeaders(cfg: any) {
  // FOG toont de tokens al base64-gecodeerd; wij sturen ze letterlijk door.
  return {
    "fog-api-token": cfg.fog_api_token || "",
    "fog-user-token": cfg.fog_user_token || "",
    "Content-Type": "application/json",
  };
}
function fogBasis(cfg: any) {
  return String(cfg.fog_base_url || "").replace(/\/+$/, "");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return fout("Alleen POST", 405);

  const acc = await wieBelt(req);
  if (!acc) return fout("Niet ingelogd", 401);

  let lijf: any;
  try { lijf = await req.json(); } catch { return fout("Onleesbaar verzoek"); }
  const actie = String(lijf?.actie || "");

  // De koppeling opslaan. Lege tokens laten we weg zodat ze de bestaande niet
  // overschrijven (je hoeft ze niet elke keer opnieuw in te typen).
  if (actie === "config") {
    const rij: Record<string, unknown> = {
      team_id: acc.team_id,
      fog_base_url: String(lijf.fog_base_url || "").trim() || null,
      actief: !!lijf.actief,
      bijgewerkt_op: new Date().toISOString(),
    };
    if (lijf.fog_api_token) rij.fog_api_token = String(lijf.fog_api_token);
    if (lijf.fog_user_token) rij.fog_user_token = String(lijf.fog_user_token);
    const { error } = await admin.from("imaging_instellingen").upsert(rij);
    if (error) return fout("Opslaan mislukt: " + error.message, 500);
    return new Response(JSON.stringify({ ok: true }), { headers: cors });
  }

  const cfg = await cfgVan(acc.team_id);
  if (!cfg || !cfg.fog_base_url) {
    return fout("Er is nog geen FOG-server ingesteld. Dat doe je bij Instellingen, onder Imaging.", 409);
  }
  const base = fogBasis(cfg);
  const H = fogHeaders(cfg);

  try {
    if (actie === "test") {
      // /fog/system/info vraagt geen token; puur bereikbaarheid + versie.
      const r = await fetch(`${base}/fog/system/info`);
      const tekst = await r.text();
      if (r.ok) {
        await admin.from("imaging_instellingen")
          .update({ laatst_getest: new Date().toISOString() }).eq("team_id", acc.team_id);
      }
      return new Response(JSON.stringify({ ok: r.ok, status: r.status, info: tekst.slice(0, 400) }), { headers: cors });
    }

    if (actie === "images-sync") {
      const r = await fetch(`${base}/fog/image`, { headers: H });
      if (!r.ok) return fout("FOG gaf status " + r.status + " bij het ophalen van de images", 502);
      const data = await r.json().catch(() => ({}));
      const images = Array.isArray(data?.images) ? data.images : (Array.isArray(data) ? data : []);
      let aantal = 0;
      for (const im of images) {
        const fogId = Number(im.id);
        if (!fogId) continue;
        const veld = {
          team_id: acc.team_id,
          fog_image_id: fogId,
          naam: im.name || im.imageName || ("image " + fogId),
          besturingssysteem: im.osName || im.os || null,
        };
        const { data: best } = await admin.from("imaging_images")
          .select("id").eq("team_id", acc.team_id).eq("fog_image_id", fogId).maybeSingle();
        if (best) await admin.from("imaging_images").update(veld).eq("id", best.id);
        else await admin.from("imaging_images").insert(veld);
        aantal++;
      }
      return new Response(JSON.stringify({ ok: true, aantal }), { headers: cors });
    }

    if (actie === "deploy") {
      const hardwareId = String(lijf.hardware_id || "");
      const imageId = String(lijf.image_id || "");
      const mac = String(lijf.mac || "").trim();
      if (!hardwareId || !imageId || !mac) return fout("Toestel, image en MAC-adres zijn nodig");

      const { data: img } = await admin.from("imaging_images")
        .select("fog_image_id,naam").eq("id", imageId).eq("team_id", acc.team_id).maybeSingle();
      if (!img || !img.fog_image_id) return fout("Deze image is niet gevonden", 404);

      // 1. Bestaat er al een host op dit MAC-adres?
      const zoek = await fetch(`${base}/fog/host/search/${encodeURIComponent(mac)}`, { headers: H })
        .then((r) => r.json()).catch(() => ({}));
      let hostId = zoek?.hosts?.[0]?.id || (Array.isArray(zoek) ? zoek[0]?.id : null) || null;

      // 2. Zo niet: aanmaken. Zo wel: alleen de image bijwerken.
      if (!hostId) {
        const gemaakt = await fetch(`${base}/fog/host/create`, {
          method: "POST", headers: H,
          body: JSON.stringify({
            name: "STORVO-" + hardwareId.slice(0, 8),
            description: "Aangemaakt door Storvo",
            macs: [mac],
            imageID: String(img.fog_image_id),
            imagename: img.naam,
          }),
        }).then((r) => r.json()).catch(() => ({}));
        hostId = gemaakt?.id || null;
      } else {
        await fetch(`${base}/fog/host/${hostId}/edit`, {
          method: "PUT", headers: H,
          body: JSON.stringify({ imageID: String(img.fog_image_id) }),
        });
      }
      if (!hostId) return fout("De host kon niet worden aangemaakt in FOG", 502);

      // 3. Deploy-taak. taskTypeID 1 = Deploy, maar het id kan per installatie
      //    verschillen; daarom eerst opzoeken welk id "Deploy" heet.
      let deployId = "1";
      try {
        const tt = await fetch(`${base}/fog/tasktype`, { headers: H }).then((r) => r.json());
        const lijst = Array.isArray(tt?.tasktypes) ? tt.tasktypes : (Array.isArray(tt) ? tt : []);
        const dep = lijst.find((x: any) => /deploy/i.test(x?.name || ""));
        if (dep?.id) deployId = String(dep.id);
      } catch { /* val terug op "1" */ }

      const taak = await fetch(`${base}/fog/host/${hostId}/task`, {
        method: "POST", headers: H,
        body: JSON.stringify({ taskTypeID: deployId }),
      });
      const gelukt = taak.ok;

      // Per toestel één imaging_hosts-rij; status bijwerken.
      const rij = {
        team_id: acc.team_id, hardware_id: hardwareId, mac, fog_host_id: hostId,
        image_id: imageId, status: gelukt ? "ingeschoten" : "fout",
        bijgewerkt_op: new Date().toISOString(),
      };
      const { data: bestH } = await admin.from("imaging_hosts")
        .select("id").eq("hardware_id", hardwareId).eq("team_id", acc.team_id).maybeSingle();
      if (bestH) await admin.from("imaging_hosts").update(rij).eq("id", bestH.id);
      else await admin.from("imaging_hosts").insert(rij);

      if (!gelukt) return fout("De deploy-taak werd niet aangenomen door FOG (status " + taak.status + ")", 502);
      return new Response(JSON.stringify({ ok: true, fog_host_id: hostId }), { headers: cors });
    }

    if (actie === "status") {
      const r = await fetch(`${base}/fog/task/active`, { headers: H });
      const data = await r.json().catch(() => ({}));
      return new Response(JSON.stringify({ ok: r.ok, taken: data }), { headers: cors });
    }

    return fout("Onbekende actie");
  } catch (e) {
    return fout("Kon de FOG-server niet bereiken: " + (e as Error).message, 502);
  }
});
