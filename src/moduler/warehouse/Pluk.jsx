/* src/moduler/warehouse/Pluk.jsx
 * Warehouse – plukordrer: opret, frigiv, pluk, afsend.
 *
 * ⚠ NODEN HEDDER `plukordrer` OG IKKE `ordrer`. `bookinger` er allerede en
 * ordre i dette hus — en transportopgave med etaper, køretøj og chauffør. En
 * plukordre siger hvad der skal UD AF LAGERET, ikke hvem der kører det
 * hvorhen. En 3PL der både opbevarer og kører, har begge dele.
 *
 * ⚠ FREMDRIFTEN ER UDLEDT AF BEVÆGELSERNE. Der står ikke et `plukketAntal` på
 * linjen; det ville drive fra bevægelserne ved den første pluk der ramte den
 * ene og ikke den anden — og så ville ordren se færdig ud mens varerne stod
 * på hylden.
 *
 * ⚠ ET PLUK FLYTTER, DET FJERNER IKKE. Varen går fra hylden til ordrens
 * afsendelsesplads. Først afsendelsen tager den ud af huset. Var pluk en ren
 * fjernelse, ville der være et hul mellem hylden og bilen hvor godset ikke
 * stod nogen steder — og det er dér det bliver væk.
 *
 * ⚠ "AFSEND" ER IKKE EN TILSTAND MAN SÆTTER. Knappen kalder en Cloud Function
 * der skriver afsendelsesbevægelserne OG tilstanden i én skrivning. Reglerne
 * afviser `afsendt` fra en klient.
 */
import { useState } from "react";
import { useListe } from "../../fleet/useListe.js";
import { useFleet } from "../../fleet/FleetContext.jsx";
import { num, dato, iDagIso, isoTilMs, msTilIso } from "../../fleet/format.js";
import { harPerm, PERM } from "../../fleet/permissions.js";
import {
  Kort, Tabel, Pille, Knap, Felt, Feltraekke, Formular, Formularsvar,
  Henter, Datatilstand, Ikon, KpiKort, KpiRaekke, MiniLinje,
} from "../../fleet/ui.jsx";
import { pladsnavn } from "../../fleet/unitbooking.js";
import {
  ORDRE_TILSTAND, ALLE_ORDRE_TILSTANDE, PRIORITET, ALLE_PRIORITETER,
  ENHED, maengdeFraTal, talFraMaengde,
  valideOrdre, ordreFremdrift, kanFortrydeFrigivelse, plukkoe,
  kanPlukkesFra, UDEN_BATCH, CARRIER_TYPE,
} from "../../fleet/warehouse.js";
import { skrivBevaegelse, afsendPlukordre } from "../../fleet/lager.js";
import { gem, nyId } from "../../fleet/skriv.js";
import { AUDIT } from "../../fleet/audit.js";
import {
  DEMO_VARER, DEMO_REOLPLADSER, DEMO_BEHOLDNING, DEMO_CARRIERS,
} from "../../fleet/demo-lager.js";
import { DEMO_KUNDER } from "../../fleet/demo-kunder.js";

const tomOrdre = () => ({
  kundeId: "", nummer: "", prioritet: "normal", tilstand: "kladde",
  afgangIso: iDagIso(), afsendCarrierId: "", note: "",
  linjer: [{ vareId: "", antal: "" }],
});

/* ---- Formularen --------------------------------------------------------- */

function Ordreformular({ ordre, kunder, varer, pladser, carriers, sti, paaGemt, paaLuk }) {
  const nyt = !ordre;
  const [f, saetF] = useState(() => (ordre
    ? {
        ...tomOrdre(), ...ordre,
        afgangIso: msTilIso(ordre.afgangMs),
        linjer: Object.values(ordre.linjer || {}).map((l) => ({
          vareId: l.vareId, antal: String(talFraMaengde(l.antal)),
        })),
      }
    : tomOrdre()));
  const [visAlle, saetVisAlle] = useState(false);
  const [gemmer, saetGemmer] = useState(false);
  const [svar, saetSvar] = useState(null);

  const saet = (felt) => (v) => { saetF((x) => ({ ...x, [felt]: v })); saetSvar(null); };
  const saetLinje = (i, felt) => (v) =>
    saetF((x) => ({
      ...x,
      linjer: x.linjer.map((l, j) => (j === i ? { ...l, [felt]: v } : l)),
    }));

  const linjer = f.linjer
    .filter((l) => l.vareId || l.antal !== "")
    .map((l, i) => [`l${i}`, {
      vareId: l.vareId,
      antal: l.antal === "" ? NaN : maengdeFraTal(l.antal),
    }]);

  const post = {
    kundeId: f.kundeId, nummer: f.nummer, prioritet: f.prioritet,
    tilstand: f.tilstand, afgangMs: isoTilMs(f.afgangIso),
    afsendCarrierId: f.afsendCarrierId, note: f.note || null,
    linjer: Object.fromEntries(linjer),
  };
  const fejl = valideOrdre(post, {
    kunder: kunder.map((k) => k.id),
    varer: varer.map((v) => v.id),
    carriers: carriers.map((c) => c.id),
  });
  const kanGemme = Object.keys(fejl).length === 0;
  const vis = (felt) => (visAlle ? fejl[felt] : null);

  const gemNu = async () => {
    saetVisAlle(true);
    if (!kanGemme) return;
    saetGemmer(true);
    const id = ordre?.id || nyId("po");
    const r = await gem({
      sti: sti(`plukordrer/${id}`),
      data: {
        ...post,
        oprettetAf: ordre?.oprettetAf ?? undefined,
        oprettetMs: ordre?.oprettetMs ?? Date.now(),
      },
      /* ⚠ FLET. `afsendtMs` sættes af serveren, og en hel skrivning herfra
         ville fjerne den igen på en ordre der allerede var afsendt. */
      flet: true,
      foer: ordre || null, objekt: "plukordrer", objektId: id,
      handling: nyt ? AUDIT.opret : AUDIT.aendre,
    });
    saetGemmer(false);
    saetSvar(r);
    if (r.ok) paaGemt();
  };

  return (
    <Kort titel={nyt ? "Ny plukordre" : `Redigér ${ordre.nummer}`}>
      <Formular onGem={gemNu} gemmer={gemmer} kanGemme={kanGemme}
                gemLabel={nyt ? "Opret ordre" : "Gem ændringer"}
                onAnnuller={paaLuk} svar={svar}>
        <Feltraekke>
          <Felt id="o-kunde" label="Kunde" kraevet vaerdi={f.kundeId} saet={saet("kundeId")}
                fejl={vis("kundeId")}
                valgmuligheder={[{ vaerdi: "", label: "— vælg —" },
                  ...kunder.map((k) => ({ vaerdi: k.id, label: k.navn || k.id }))]} />
          <Felt id="o-nr" label="Ordrenummer" kraevet vaerdi={f.nummer}
                saet={saet("nummer")} fejl={vis("nummer")}
                hint="Kundens eget nummer, fx SO-10458." />
          <Felt id="o-prio" label="Prioritet" kraevet vaerdi={f.prioritet}
                saet={saet("prioritet")} fejl={vis("prioritet")}
                valgmuligheder={ALLE_PRIORITETER.map((p) => ({
                  vaerdi: p, label: PRIORITET[p].label,
                }))} />
        </Feltraekke>

        <Feltraekke>
          <Felt id="o-afgang" label="Afgang" kraevet type="date" vaerdi={f.afgangIso}
                saet={saet("afgangIso")} fejl={vis("afgangMs")} />
          {/* ⚠ PÅKRÆVET, OG DET ER EN BEHOLDER. Et pluk flytter varen HEN et
              sted — og efter etape 12 ligger alt gods i en beholder, også det
              der venter på bilen. */}
          <Felt id="o-carrier" label="Afsendelsesbeholder" kraevet vaerdi={f.afsendCarrierId}
                saet={saet("afsendCarrierId")} fejl={vis("afsendCarrierId")}
                valgmuligheder={[{ vaerdi: "", label: "— vælg —" },
                  ...carriers.map((c) => ({
                    vaerdi: c.id,
                    label: `${c.id} · ${CARRIER_TYPE[c.type]?.label || c.type}${
                      c.pladsId ? ` · ${pladsnavn(pladser.find((p) => p.id === c.pladsId))}` : ""}`,
                  }))]}
                hint="Her ligger det plukkede, indtil bilen kommer." />
        </Feltraekke>

        <p className="fc-hint" style={{ marginTop: 4 }}><b>Linjer</b></p>
        {f.linjer.map((l, i) => (
          <Feltraekke key={i}>
            <Felt id={`o-vare-${i}`} label={`Vare ${i + 1}`} vaerdi={l.vareId}
                  saet={saetLinje(i, "vareId")}
                  valgmuligheder={[{ vaerdi: "", label: "— vælg —" },
                    ...varer.map((v) => ({
                      vaerdi: v.id, label: `${v.varenummer} · ${v.navn}`,
                    }))]} />
            <Felt id={`o-antal-${i}`} label="Mængde" type="number" step="any"
                  suffiks={ENHED[varer.find((v) => v.id === l.vareId)?.enhed]?.label}
                  vaerdi={l.antal} saet={saetLinje(i, "antal")} />
          </Feltraekke>
        ))}
        {vis("linjer") && (
          <p className="fc-svar fc-svar-fejl" role="alert">{fejl.linjer}</p>
        )}
        <div className="fc-formular-knapper" style={{ marginTop: 0 }}>
          <Knap type="button"
                onClick={() => saetF((x) => ({ ...x, linjer: [...x.linjer, { vareId: "", antal: "" }] }))}>
            Tilføj linje
          </Knap>
        </div>

        <Felt id="o-note" label="Note" vaerdi={f.note} saet={saet("note")} />
      </Formular>
    </Kort>
  );
}

/* ---- Plukning ----------------------------------------------------------- */

function Plukpanel({ ordre, fremdrift, varer, pladser, carriers, beholdning, paaPlukket }) {
  const [linje, saetLinje] = useState("");
  const [fraCarrierId, saetFra] = useState("");
  const [antal, saetAntal] = useState("");
  const [batch, saetBatch] = useState("");
  const [arbejder, saetArbejder] = useState(false);
  const [svar, saetSvar] = useState(null);

  const valgt = fremdrift.linjer.find((l) => l.id === linje) || null;
  const vare = varer.find((v) => v.id === valgt?.vareId) || null;

  /* ⚠ KUN BEHOLDERE DER FAKTISK HAR VAREN, og kun dem der står et sted der
     kan plukkes fra. Spærringen sidder på HYLDEN, ikke på beholderen — efter
     etape 12 slås den derfor op ét led længere ude. En karantæneplads står
     ikke på listen: varen dér er under mistanke, og serveren afviser den
     alligevel. */
  const muligeCarriers = !vare ? [] : beholdning
    .filter((b) => {
      if (b.vareId !== vare.id || (b.antal || 0) <= 0) return false;
      if (b.carrierId === ordre.afsendCarrierId) return false;
      const c = carriers.find((x) => x.id === b.carrierId);
      if (!c) return false;
      /* En beholder uden plads har ingen hylde at arve en spærring fra. */
      return !c.pladsId || kanPlukkesFra(pladser.find((p) => p.id === c.pladsId));
    })
    .map((b) => {
      const c = carriers.find((x) => x.id === b.carrierId);
      return { ...b, carrier: c, plads: pladser.find((p) => p.id === c?.pladsId) };
    });

  const valgteCarrier = muligeCarriers.find((m) => m.carrierId === fraCarrierId) || null;
  const skaleret = antal === "" ? NaN : maengdeFraTal(antal);
  const kanPlukke = valgt && vare && fraCarrierId && Number.isFinite(skaleret) &&
    skaleret > 0 && skaleret <= (valgteCarrier?.antal ?? 0);

  const pluk = async () => {
    if (!kanPlukke) return;
    saetArbejder(true);
    const r = await skrivBevaegelse({
      art: "pluk", vareId: vare.id, antal: skaleret,
      fraCarrierId, tilCarrierId: ordre.afsendCarrierId,
      batch: valgteCarrier?.batch && valgteCarrier.batch !== UDEN_BATCH
        ? valgteCarrier.batch : batch,
      reference: ordre.id,
    });
    saetArbejder(false);
    saetSvar(r);
    if (r.ok) { saetAntal(""); saetBatch(""); paaPlukket(); }
  };

  return (
    <div className="fc-grid" style={{ gap: 8 }}>
      <Feltraekke>
        <Felt id="p-linje" label="Linje" vaerdi={linje}
              saet={(v) => { saetLinje(v); saetFra(""); saetAntal(""); saetSvar(null); }}
              valgmuligheder={[{ vaerdi: "", label: "— vælg —" },
                ...fremdrift.linjer.filter((l) => l.mangler > 0).map((l) => {
                  const v = varer.find((x) => x.id === l.vareId);
                  return {
                    vaerdi: l.id,
                    label: `${v?.varenummer || l.vareId} · mangler ${
                      num(talFraMaengde(l.mangler), ENHED[v?.enhed]?.helTal ? 0 : 1)}`,
                  };
                })]} />
        <Felt id="p-fra" label="Tag fra" vaerdi={fraCarrierId}
              saet={(v) => { saetFra(v); saetSvar(null); }}
              valgmuligheder={[{ vaerdi: "", label: "— vælg —" },
                ...muligeCarriers.map((m) => ({
                  vaerdi: m.carrierId,
                  label: `${m.carrierId} · ${m.plads ? pladsnavn(m.plads) : "uden lokation"} · ${
                    num(talFraMaengde(m.antal), 0)}${
                    m.batch && m.batch !== UDEN_BATCH ? ` · ${m.batch}` : ""}`,
                }))]}
              hint={vare && !muligeCarriers.length
                ? "Varen ligger ingen steder der kan plukkes fra."
                : undefined} />
        <Felt id="p-antal" label="Mængde" type="number" step="any" vaerdi={antal}
              saet={(v) => { saetAntal(v); saetSvar(null); }}
              suffiks={ENHED[vare?.enhed]?.label}
              hint={valgteCarrier
                ? `Der ligger ${num(talFraMaengde(valgteCarrier.antal), 0)}`
                : undefined} />
      </Feltraekke>
      <div className="fc-formular-knapper" style={{ marginTop: 0 }}>
        <Knap variant="primaer" disabled={!kanPlukke || arbejder} onClick={pluk}>
          {arbejder ? "Plukker …" : "Registrér pluk"}
        </Knap>
      </div>
      <Formularsvar svar={svar} />
    </div>
  );
}

/* ---- Skærmen ------------------------------------------------------------ */

export default function Pluk() {
  const { path, bruger } = useFleet();
  const maaSkrive = harPerm(bruger?.perms, PERM.bevaegelserSkriv);

  const [ny, saetNy] = useState(false);
  const [redigerer, saetRedigerer] = useState(null);
  const [aaben, saetAaben] = useState(null);
  const [filter, saetFilter] = useState("");
  const [arbejder, saetArbejder] = useState(null);
  const [svar, saetSvar] = useState(null);

  const { data: ordrer, tilstand, genindlaes, henter } = useListe("plukordrer", {
    division: "alle", graense: 1000, demo: [],
    sorter: (a, b) => (a.afgangMs || 0) - (b.afgangMs || 0),
  });
  const { data: bevaegelser, genindlaes: genBev } = useListe("bevaegelser", {
    division: "alle", graense: 2000, demo: [],
  });
  const { data: beholdning, genindlaes: genBeh } = useListe("beholdning", {
    division: "alle", graense: 5000, demo: DEMO_BEHOLDNING,
  });
  const { data: varer } = useListe("varer", {
    division: "alle", graense: 2000, demo: DEMO_VARER,
    sorter: (a, b) => (a.varenummer || "").localeCompare(b.varenummer || "", "da"),
  });
  const { data: pladser } = useListe("reolpladser", {
    division: "alle", graense: 2000, demo: DEMO_REOLPLADSER,
    sorter: (a, b) => pladsnavn(a).localeCompare(pladsnavn(b), "da"),
  });
  /* ⚠ GODSET LIGGER I EN BEHOLDER (etape 12). Både plukket og
     afsendelsesstedet er beholdere; hylden er beholderens adresse. */
  const { data: carriers } = useListe("carriers", {
    division: "alle", graense: 2000, demo: DEMO_CARRIERS,
    sorter: (a, b) => (a.id || "").localeCompare(b.id || "", "da"),
  });
  const { data: kunder } = useListe("kunder", {
    division: "alle", graense: 500, demo: DEMO_KUNDER,
  });

  if (henter) return <Henter hvad="plukordrerne" />;

  const kundeNavn = (id) => kunder.find((k) => k.id === id)?.navn || id;
  const fremdriftFor = (o) => ordreFremdrift(o, bevaegelser);

  const koe = plukkoe(ordrer);
  const viste = ordrer.filter((o) => !filter || o.tilstand === filter);
  const ordre = ordrer.find((o) => o.id === aaben) || null;
  const fremdrift = ordre ? fremdriftFor(ordre) : null;

  const genindlaesAlt = () => { genindlaes(); genBev(); genBeh(); };

  const skift = async (o, til) => {
    saetArbejder(o.id);
    saetSvar(null);
    const r = await gem({
      sti: path(`plukordrer/${o.id}/tilstand`), data: til, flet: false,
      foer: { tilstand: o.tilstand }, objekt: "plukordrer", objektId: o.id,
      handling: AUDIT.tilstandsskift,
    });
    saetArbejder(null);
    saetSvar(r);
    if (r.ok) genindlaesAlt();
  };

  const afsend = async (o) => {
    saetArbejder(o.id);
    saetSvar(null);
    const r = await afsendPlukordre({ ordreId: o.id });
    saetArbejder(null);
    saetSvar(r);
    if (r.ok) genindlaesAlt();
  };

  return (
    <div className="fc-grid" style={{ gap: 16 }}>
      <KpiRaekke>
        <KpiKort label="I plukkø" vaerdi={num(koe.length)}
                 ikon={<Ikon navn="vogn" />} tone="ikon-5" rund
                 note={koe.length ? `næste: ${koe[0].nummer}` : "intet venter"} />
        <KpiKort label="Kladder"
                 vaerdi={num(ordrer.filter((o) => o.tilstand === "kladde").length)}
                 note="ikke frigivet til plukning" />
        <KpiKort label="Høj prioritet"
                 vaerdi={num(koe.filter((o) => o.prioritet === "hoej").length)}
                 note="skal ud først" />
        {/* ⚠ FORSINKEDE MÅ IKKE GEMMES VÆK. En ordre der skulle være afgået
            i går, er en kunde der venter. */}
        <KpiKort label="Over afgang"
                 vaerdi={num(koe.filter((o) => o.afgangMs < Date.now()).length)}
                 note="afgangen er passeret" />
      </KpiRaekke>

      <Datatilstand tilstand={tilstand} genprov={genindlaes} />

      {ny && (
        <Ordreformular kunder={kunder} varer={varer} pladser={pladser}
                       carriers={carriers} sti={path}
                       paaLuk={() => saetNy(false)}
                       paaGemt={() => { saetNy(false); genindlaesAlt(); }} />
      )}
      {redigerer && (
        <Ordreformular ordre={redigerer} kunder={kunder} varer={varer}
                       pladser={pladser} carriers={carriers} sti={path}
                       paaLuk={() => saetRedigerer(null)}
                       paaGemt={() => { saetRedigerer(null); genindlaesAlt(); }} />
      )}

      <Kort
        titel={`Plukordrer (${num(viste.length)})`}
        handling={
          <Knap variant="primaer"
                disabled={!maaSkrive || !varer.length || !pladser.length}
                onClick={() => saetNy(true)}
                title={!maaSkrive ? `Kræver ${PERM.bevaegelserSkriv} — reglerne afviser.`
                  : "Opret en plukordre."}>
            Ny plukordre
          </Knap>
        }
      >
        <div className="fc-filtre">
          <div className="fc-felt">
            <label htmlFor="of-tilstand">Tilstand</label>
            <select id="of-tilstand" value={filter}
                    onChange={(e) => saetFilter(e.target.value)}>
              <option value="">Alle tilstande</option>
              {ALLE_ORDRE_TILSTANDE.map((t) => (
                <option key={t} value={t}>{ORDRE_TILSTAND[t].label}</option>
              ))}
            </select>
          </div>
        </div>

        <Formularsvar svar={svar} />

        <Tabel
          kolonner={[
            { key: "nr", label: "Ordre", render: (o) => <b>{o.nummer}</b> },
            { key: "kunde", label: "Kunde",
              render: (o) => <span className="fc-hint">{kundeNavn(o.kundeId)}</span> },
            { key: "prio", label: "Prioritet", render: (o) => (
                <Pille tone={PRIORITET[o.prioritet]?.pill || "info"}>
                  {PRIORITET[o.prioritet]?.label || o.prioritet}
                </Pille>
              ) },
            { key: "afgang", label: "Afgang", render: (o) => (
                <>
                  {dato(o.afgangMs)}
                  {o.tilstand === "frigivet" && o.afgangMs < Date.now() && (
                    <> <Pille tone="bad">over tiden</Pille></>
                  )}
                </>
              ) },
            /* ⚠ UDLEDT AF BEVÆGELSERNE — se hovedet. */
            { key: "fremdrift", label: "Plukket", render: (o) => {
                const fd = fremdriftFor(o);
                return (
                  <span className="fc-med-ikon" style={{ gap: 8 }}>
                    <MiniLinje andel={fd.andel} />
                    <span className="fc-hint">
                      {num(talFraMaengde(fd.plukketIalt), 0)} / {num(talFraMaengde(fd.bestiltIalt), 0)}
                    </span>
                    {fd.harOverpluk && <Pille tone="bad">overpluk</Pille>}
                  </span>
                );
              } },
            { key: "tilstand", label: "Tilstand", render: (o) => (
                <Pille tone={ORDRE_TILSTAND[o.tilstand]?.pill || "info"}>
                  {ORDRE_TILSTAND[o.tilstand]?.label || o.tilstand}
                </Pille>
              ) },
            { key: "handling", label: "", render: (o) => {
                const fd = fremdriftFor(o);
                return (
                  <span className="fc-med-ikon" style={{ gap: 6, flexWrap: "wrap" }}>
                    <Knap onClick={() => saetAaben(o.id === aaben ? null : o.id)}>
                      {o.id === aaben ? "Luk" : "Åbn"}
                    </Knap>
                    {o.tilstand === "kladde" && (
                      <Knap variant="primaer" disabled={!maaSkrive || arbejder === o.id}
                            onClick={() => skift(o, "frigivet")}>Frigiv</Knap>
                    )}
                    {o.tilstand === "frigivet" && kanFortrydeFrigivelse(fd) && (
                      <Knap disabled={!maaSkrive || arbejder === o.id}
                            title="Intet er plukket endnu, så ordren kan trækkes tilbage."
                            onClick={() => skift(o, "kladde")}>Tilbage til kladde</Knap>
                    )}
                    {o.tilstand === "frigivet" && fd.plukketIalt > 0 && (
                      <Knap variant="primaer" disabled={!maaSkrive || arbejder === o.id}
                            title="Skriver afsendelsesbevægelser for det der er plukket, og lukker ordren."
                            onClick={() => afsend(o)}>
                        {arbejder === o.id ? "Afsender …" : "Afsend"}
                      </Knap>
                    )}
                    {["kladde", "frigivet"].includes(o.tilstand) && (
                      <Knap disabled={!maaSkrive} onClick={() => saetRedigerer(o)}>Redigér</Knap>
                    )}
                  </span>
                );
              } },
          ]}
          raekker={viste}
          erValgt={(o) => o.id === aaben}
          tom="Der er ingen plukordrer endnu."
        />

        <p className="fc-hint" style={{ marginTop: 10 }}>
          ⚠ <b>"Afsend" sætter ikke et felt.</b> Knappen kalder en funktion der
          skriver afsendelsesbevægelserne <b>og</b> tilstanden i én skrivning —
          reglerne afviser <b>afsendt</b> fra en klient. Ellers kunne en ordre
          meldes afsendt uden at en palle var rørt, mens lageret stadig stod
          med godset.
        </p>
      </Kort>

      {ordre && fremdrift && (
        <Kort titel={`${ordre.nummer} · ${kundeNavn(ordre.kundeId)}`}>
          <p className="fc-hint">
            Afgang {dato(ordre.afgangMs)} · det plukkede lægges i{" "}
            <b>{ordre.afsendCarrierId}</b>
            {ordre.note ? ` · ${ordre.note}` : ""}
          </p>

          <Tabel
            kolonner={[
              { key: "vare", label: "Vare", render: (l) => {
                  const v = varer.find((x) => x.id === l.vareId);
                  return <b>{v?.varenummer || l.vareId}</b>;
                } },
              { key: "navn", label: "Navn", render: (l) => (
                  <span className="fc-hint">
                    {varer.find((x) => x.id === l.vareId)?.navn || "—"}
                  </span>
                ) },
              { key: "bestilt", label: "Bestilt", num: true,
                render: (l) => num(talFraMaengde(l.antal), 0) },
              { key: "plukket", label: "Plukket", num: true,
                render: (l) => num(talFraMaengde(l.plukket), 0) },
              { key: "mangler", label: "Mangler", num: true, render: (l) => (
                  l.mangler > 0
                    ? <span className="fc-bad">{num(talFraMaengde(l.mangler), 0)}</span>
                    : <span className="fc-good">0</span>
                ) },
              /* ⚠ OVERPLUK KLIPPES IKKE VÆK. En scanner kan læse den samme
                 palle to gange, og det skal kunne ses. */
              { key: "over", label: "", render: (l) => (
                  l.overplukket > 0
                    ? <Pille tone="bad">+{num(talFraMaengde(l.overplukket), 0)} for meget</Pille>
                    : null
                ) },
            ]}
            raekker={fremdrift.linjer}
            tom="Ordren har ingen linjer."
          />

          {ordre.tilstand === "frigivet" ? (
            <div style={{ marginTop: 12 }}>
              <p className="fc-hint"><b>Registrér et pluk</b></p>
              <Plukpanel ordre={ordre} fremdrift={fremdrift} varer={varer}
                         pladser={pladser} carriers={carriers} beholdning={beholdning}
                         paaPlukket={genindlaesAlt} />
            </div>
          ) : (
            <p className="fc-hint" style={{ marginTop: 12 }}>
              {ordre.tilstand === "kladde"
                ? "Ordren er en kladde. Frigiv den, før der kan plukkes — så ved lageret at den er aftalt."
                : `Ordren er ${ORDRE_TILSTAND[ordre.tilstand]?.label.toLowerCase()} og kan ikke plukkes.`}
            </p>
          )}
        </Kort>
      )}
    </div>
  );
}
