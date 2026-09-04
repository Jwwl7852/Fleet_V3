/* src/moduler/indkoeb/Bestillinger.jsx
 * Procure — Bestillinger. Procures PRIMÆRE procesarbejdsflade
 * (produktejer-review 2026-09-02).
 *
 * ⚠ DENNE SKÆRM ER TRE GAMLE SKÆRME, SAMLET — IKKE OMSKREVET. Indkøbsbehov,
 * Bestillinger og Godkendelse af indkøb var tre separate ruter man klikkede
 * sig igennem i rækkefølge. Al logik, alle Cloud Function-kald og al
 * validering er UÆNDRET og hentet direkte fra de tre filer — kun placeringen
 * er samlet til én arbejdsflade med tre sektioner, i samme rækkefølge som
 * processen selv: Behov → Kladder & leverandørforslag → Godkendelse.
 *
 * ⚠ GODKENDELSESREGLERNES ADMINISTRATIONS-UI ER FLYTTET UD (Trin 4,
 * samme review). De to regelkort ("Godkendelse over beløb", "Kræv
 * fakturagodkendelse") stod her sammen med KØEN af ordrer der venter — men
 * det er to forskellige spørgsmål: at SÆTTE politikken er administration,
 * at AFGØRE en konkret ordre er det daglige arbejde. Politikken bor nu i
 * Opsætning → Procure → Godkendelsesregler; køen og dens handlinger blev
 * her, fordi det ER det daglige arbejde. Reglerne LÆSES stadig herfra
 * (`godkendelsesregler`, read-only) — køen skal jo vide hvad den venter på.
 *
 * ⚠ DET STATISKE PROCESBÅND FRA Godkendelser.jsx ER IKKE MED. Det var en
 * ren illustration (fire ikoner, ingen links, intet klik) — Overblik viser
 * nu den samme pipeline som en RIGTIG, klikbar status, og at gentage en
 * illustration af det samme på arbejdsfladen ville være to visninger af én
 * ting, den ene uden funktion.
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { useListe } from "../../fleet/useListe.js";
import { usePost } from "../../fleet/usePost.js";
import { useFleet } from "../../fleet/FleetContext.jsx";
import { dato, klokke, kr, num } from "../../fleet/format.js";
import {
  Kort, Tom, Tabel, Pille, Henter, Datatilstand, Knap, Felt, Feltraekke,
  Formular, Formularsvar, KpiKort, KpiRaekke, Ikon, MiniLinje, Dialog, ModulNav,
} from "../../fleet/ui.jsx";
import { blokerer } from "../../fleet/datatilstand.js";
import { harPerm, PERM } from "../../fleet/permissions.js";
import {
  BEHOVKILDE, ALLE_BEHOVKILDER, BEHOVSTATUS, PRIORITET,
  kladdelinjer, grupperPaaLeverandoer, mailudkast, ordreSumOere,
  linjeListe, ORDRESTATUS, ventendeOrdrer, GODKENDELSESGRUND, kraeverGodkendelse,
  tilgaengeligeOrdreHandlinger, STANDARD_GODKENDELSESREGLER, ordreMailIndhold,
} from "../../fleet/procure.js";
import { SPROG, ALLE_SPROG, STANDARD_SPROG, erGyldigtSprog } from "../../fleet/sprog.js";
import { meldBehov, afvisBehov } from "../../fleet/behov.js";
import { opretBestilling } from "../../fleet/bestilling.js";
import { skiftOrdre, sendOrdreMail } from "../../fleet/godkendelse.js";
import { PROCURE_FANER } from "../../fleet/modulfaner.js";
import { DEMO_INDKOEBSBEHOV, DEMO_INDKOEBSORDRER, DEMO_GODKENDELSESREGLER } from "../../fleet/demo-procure.js";
import { DEMO_INDKOEBSLINJER, DEMO_LEVERANDOERER } from "../../fleet/demo-indkoeb.js";
import { DEMO_PERSONALE } from "../../fleet/demo-personale.js";

const IKON_FOR_KILDE = {
  snedkeri: "skruenoegle", lager: "kasse", kontor: "bygning", kontantkoeb: "seddel",
};
const TOM_BEHOV = { vare: "", kilde: "snedkeri", antal: "", enhed: "stk", prioritet: "", note: "" };

export default function Bestillinger() {
  const { bruger } = useFleet();
  const maaSkrive = harPerm(bruger?.perms, PERM.indkoebSkriv);
  const maaGodkende = harPerm(bruger?.perms, PERM.indkoebGodkend);
  const maaSende = harPerm(bruger?.perms, PERM.indkoebSkriv);

  /* ---- Behov ------------------------------------------------------- */
  const [valgtKilde, setValgtKilde] = useState("alle");
  const [postBehov, setPostBehov] = useState(TOM_BEHOV);
  const [svarBehov, setSvarBehov] = useState(null);
  const [gemmerBehov, setGemmerBehov] = useState(false);
  const [afviserBehov, setAfviserBehov] = useState(null);
  const [grundBehov, setGrundBehov] = useState("");

  /* ---- Bestillingskladder -------------------------------------------- */
  const [valgte, setValgte] = useState({});
  const [antal, setAntal] = useState({});
  const [svarBestil, setSvarBestil] = useState(null);
  const [gemmerBestil, setGemmerBestil] = useState(false);
  const [kopieret, setKopieret] = useState(null);

  /* ---- Godkendelse ---------------------------------------------------- */
  const [svarGodkend, setSvarGodkend] = useState(null);
  const [arbejderGodkend, setArbejderGodkend] = useState(false);
  const [afviserOrdre, setAfviserOrdre] = useState(null);
  const [grundOrdre, setGrundOrdre] = useState("");
  const [sender, setSender] = useState(null);

  /* ---- Data, hentet ÉN gang og delt af alle tre sektioner ------------- */
  const behov = useListe("indkoebsbehov", {
    ordnPaa: "oprettetMs", vindue: "alle", graense: 500, demo: DEMO_INDKOEBSBEHOV,
  });
  const ordrer = useListe("indkoebsordrer", {
    ordnPaa: "oprettetMs", vindue: "alle", graense: 300, demo: DEMO_INDKOEBSORDRER,
  });
  /* ⚠ HISTORIKKEN ER GRUNDLAGET FOR LEVERANDØRFORSLAGET. */
  const historik = useListe("indkoeb", {
    ordnPaa: "dato", vindueDage: 400, graense: 1000, demo: DEMO_INDKOEBSLINJER,
  });
  const lev = useListe("leverandoerer", {
    ordnPaa: "navn", vindue: "alle", graense: 500, demo: DEMO_LEVERANDOERER,
  });
  const folk = useListe("personale", { vindue: "alle", graense: 500, demo: DEMO_PERSONALE });
  const brugere = useListe("brugere", { vindue: "alle", graense: 200 });
  /* ⚠ NODEN ER SELV EN POST — der er ÉN politik pr. virksomhed. Kun LÆST her;
     ÆNDRET i Opsætning → Procure → Godkendelsesregler. */
  const regelPost = usePost(null, "godkendelsesregler", { demo: DEMO_GODKENDELSESREGLER });
  const regler = regelPost.post || STANDARD_GODKENDELSESREGLER;

  const henterNoget = behov.henter || ordrer.henter;
  if (henterNoget) return <Henter hvad="bestillinger" />;
  if (blokerer(behov.tilstand)) {
    return <Datatilstand tilstand={behov.tilstand} genprov={behov.genindlaes} />;
  }
  if (blokerer(ordrer.tilstand)) {
    return <Datatilstand tilstand={ordrer.tilstand} genprov={ordrer.genindlaes} />;
  }

  const levFor = (id) => lev.data.find((l) => l.id === id) || null;
  const levNavn = (id) => levFor(id)?.navn || id || "—";
  const navnFor = (id) => folk.data.find((p) => p.id === id)?.navn || id || "—";
  const brugerNavn = (uid) => {
    const b = brugere.data.find((x) => x.id === uid);
    return b?.navn || b?.email || uid || "—";
  };

  const genindlaesBehovOgOrdrer = () => { behov.genindlaes(); ordrer.genindlaes(); };

  /* ==================================================================
     BEHOV
     ================================================================== */
  const alleBehov = behov.data;
  const aabneBehov = alleBehov.filter((b) => b.status !== "bestilt" && b.status !== "afvist");
  const iKilden = (kk) => aabneBehov.filter((b) => b.kilde === kk);
  const visteBehov = valgtKilde === "alle" ? aabneBehov : iKilden(valgtKilde);

  const saetBehov = (felt) => (v) => setPostBehov((p) => ({ ...p, [felt]: v }));

  const gemBehov = async () => {
    setGemmerBehov(true);
    const r = await meldBehov({
      ...postBehov,
      antal: postBehov.antal === "" ? undefined : Number(postBehov.antal),
    });
    setSvarBehov(r);
    setGemmerBehov(false);
    if (r.ok) { setPostBehov(TOM_BEHOV); behov.genindlaes(); }
  };

  const afvisDetBehov = async () => {
    const r = await afvisBehov(afviserBehov?.id, grundBehov);
    setSvarBehov(r);
    if (r.ok) { setAfviserBehov(null); setGrundBehov(""); behov.genindlaes(); }
  };

  /* ==================================================================
     BESTILLINGSKLADDER & LEVERANDØRFORSLAG
     ================================================================== */
  const linjer = kladdelinjer(aabneBehov, historik.data);
  const grupper = grupperPaaLeverandoer(linjer);

  const antalFor = (l) => antal[l.behov.id] ?? l.behov.antal ?? null;
  const prisFor = (l) => l.forslag?.prisPrEnhedOere ?? null;
  const klar = (l) => Boolean(l.forslag) && Number.isInteger(prisFor(l))
    && Number.isFinite(antalFor(l)) && antalFor(l) > 0;
  const valgtIGruppe = (g) => g.linjer.filter((l) => valgte[l.behov.id]);
  const valgtIAlt = linjer.filter((l) => valgte[l.behov.id]);
  /* ⚠ "ANSLÅET" BETYDER NOGET. Prisen er den SENESTE vi betalte, ikke et
     tilbud — og linjer uden pris tæller ikke med, så summen er et minimum
     og ikke et facit. Det står i noten under tallet. */
  const anslaaetOere = valgtIAlt.reduce((s, l) => (
    Number.isInteger(prisFor(l)) && Number.isFinite(antalFor(l))
      ? s + prisFor(l) * antalFor(l) : s
  ), 0);
  const udenPris = valgtIAlt.filter((l) => !Number.isInteger(prisFor(l))).length;

  const bestil = async (g) => {
    setGemmerBestil(true);
    const r = await opretBestilling({
      leverandoerId: g.leverandoerId,
      linjer: valgtIGruppe(g).map((l) => ({
        behovId: l.behov.id,
        antal: antalFor(l) ?? undefined,
        prisPrEnhedOere: prisFor(l) ?? undefined,
      })),
    });
    setSvarBestil(r);
    setGemmerBestil(false);
    if (r.ok) { setValgte({}); genindlaesBehovOgOrdrer(); }
  };

  const kopier = (o, tekst) => {
    navigator.clipboard?.writeText(tekst);
    setKopieret(o.id);
  };

  const kladder = ordrer.data.filter((o) => o.status === "kladde");

  /* ==================================================================
     GODKENDELSE
     ================================================================== */
  const koe = ventendeOrdrer(ordrer.data, regler);
  const kontekst = { perms: bruger?.perms, regler, uid: bruger?.uid };
  const godkendtIAlt = ordrer.data.filter((o) => o.status === "godkendt");
  const automatisk = ordrer.data.filter((o) => o.godkendtAutomatisk === true);

  const skift = async (ordre, til, begrundelse) => {
    setArbejderGodkend(true);
    const r = await skiftOrdre({ ordreId: ordre.id, til, begrundelse });
    setSvarGodkend(r);
    setArbejderGodkend(false);
    setAfviserOrdre(null);
    setGrundOrdre("");
    if (r.ok) ordrer.genindlaes();
  };

  return (
    <div className="fc-grid" style={{ gap: 16 }}>
      <ModulNav punkter={PROCURE_FANER} />

      {/* ================= BEHOV ================= */}
      <Kort titel="Indkøbsbehov">
        <div className="fc-filtre" role="group" aria-label="Kilde">
          <Knap variant={valgtKilde === "alle" ? "primaer" : "sekundaer"}
                onClick={() => setValgtKilde("alle")}>
            Alle kilder {num(aabneBehov.length)}
          </Knap>
          {ALLE_BEHOVKILDER.map((kk) => (
            <Knap key={kk} variant={valgtKilde === kk ? "primaer" : "sekundaer"}
                  onClick={() => setValgtKilde(kk)}>
              {BEHOVKILDE[kk]} {num(iKilden(kk).length)}
            </Knap>
          ))}
        </div>
      </Kort>

      <div className="fc-grid"
           style={{ gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 16 }}>
        <div className="fc-grid" style={{ gap: 16 }}>
          {(valgtKilde === "alle" ? ALLE_BEHOVKILDER : [valgtKilde]).map((kk) => {
            const raekker = iKilden(kk);
            if (!raekker.length) return null;
            return (
              <Kort key={kk}
                    titel={<span className="fc-med-ikon">
                      <Ikon navn={IKON_FOR_KILDE[kk]} /> {BEHOVKILDE[kk]} ({num(raekker.length)})
                    </span>}>
                <Tabel
                  raekker={raekker}
                  kolonner={[
                    { key: "vare", label: "Vare", render: (r) => (
                        <>
                          <b>{r.vare}</b>
                          {r.varenummer && <div className="fc-hint">{r.varenummer}</div>}
                        </>
                      ) },
                    { key: "anmoder", label: "Anmoder", render: (r) => navnFor(r.anmoderId) },
                    { key: "tid", label: "Tidspunkt", render: (r) => (
                        <>{dato(r.oprettetMs)} <span className="fc-hint">{klokke(r.oprettetMs)}</span></>
                      ) },
                    { key: "prioritet", label: "Prioritet", render: (r) => (
                        r.prioritet
                          ? <Pille tone={r.prioritet === "hoej" ? "bad"
                              : r.prioritet === "mellem" ? "warn" : "ok"}>
                              {PRIORITET[r.prioritet]}
                            </Pille>
                          : <span className="fc-hint">—</span>
                      ) },
                    { key: "antal", label: "Antal", num: true, render: (r) => (
                        Number.isFinite(r.antal)
                          ? `${num(r.antal)} ${r.enhed || ""}`.trim()
                          : <span className="fc-hint" title="Antallet er ikke oplyst — det sættes ved bestilling.">—</span>
                      ) },
                    { key: "note", label: "Notat", render: (r) => r.note || <span className="fc-hint">—</span> },
                    { key: "status", label: "Status", render: (r) => (
                        <Pille tone={BEHOVSTATUS[r.status]?.tone || "info"}>
                          {BEHOVSTATUS[r.status]?.label || r.status}
                        </Pille>
                      ) },
                    { key: "handling", label: "", render: (r) => (
                        maaSkrive
                          ? <Knap onClick={() => { setAfviserBehov(r); setGrundBehov(""); }}>Afvis</Knap>
                          : null
                      ) },
                  ]}
                />
              </Kort>
            );
          })}
          {!visteBehov.length && (
            <Kort titel="Indbakke">
              <Tom>
                Ingen åbne behov{valgtKilde !== "alle" && ` fra ${BEHOVKILDE[valgtKilde]}`}.
                Et behov er en medarbejder der siger hvad han mangler — det
                bliver til en bestilling nedenfor.
              </Tom>
            </Kort>
          )}
        </div>

        <Kort titel="Rapportér behov">
          <p className="fc-hint" style={{ marginTop: 0 }}>
            Fortæl hvad du mangler — så klarer vi resten.
          </p>
          {!maaSkrive ? (
            <Tom>Du må ikke melde behov ind. Det kræver <code>indkoeb.skriv</code>.</Tom>
          ) : (
            <Formular onGem={gemBehov} gemmer={gemmerBehov} gemLabel="Send melding"
                      kanGemme={Boolean(postBehov.vare.trim())}>
              <Felt id="b-kilde" label="Vælg kilde" kraevet
                    vaerdi={postBehov.kilde} saet={saetBehov("kilde")}
                    valgmuligheder={ALLE_BEHOVKILDER.map((kk) => ({ vaerdi: kk, label: BEHOVKILDE[kk] }))} />
              <Felt id="b-vare" label="Vare" kraevet
                    vaerdi={postBehov.vare} saet={saetBehov("vare")}
                    hint="Skriv det du mangler — det behøver ikke være et varenummer." />
              <Feltraekke>
                <Felt id="b-antal" label="Antal" type="number"
                      vaerdi={postBehov.antal} saet={saetBehov("antal")}
                      hint="Valgfrit — sættes ved bestilling hvis du ikke ved det." />
                <Felt id="b-enhed" label="Enhed"
                      vaerdi={postBehov.enhed} saet={saetBehov("enhed")} />
              </Feltraekke>
              <Felt id="b-prioritet" label="Prioritet"
                    vaerdi={postBehov.prioritet} saet={saetBehov("prioritet")}
                    valgmuligheder={[{ vaerdi: "", label: "Ikke angivet" },
                      ...Object.entries(PRIORITET).map(([v, l]) => ({ vaerdi: v, label: l }))]} />
              <div className="fc-felt">
                <label htmlFor="b-note">Notat</label>
                <textarea id="b-note" rows={3} maxLength={250} value={postBehov.note}
                          onChange={(e) => saetBehov("note")(e.target.value)} />
                <p className="fc-hint" id="b-note-hint">
                  Valgfrit. {num(postBehov.note.length)} / 250 tegn.
                </p>
              </div>
              <p className="fc-hint">
                <b>Billede og taleoptagelse er ikke bygget endnu.</b> De kræver
                fillagring med sine egne adgangsregler pr. virksomhed. Skriv
                det i notatet indtil da.
              </p>
            </Formular>
          )}
          <Formularsvar svar={svarBehov} okTekst="Behovet er meldt ind." />
        </Kort>
      </div>

      {afviserBehov && (
        <Kort titel={`Afvis "${afviserBehov.vare}"`}>
          <div className="fc-felt">
            <label htmlFor="b-grund">Begrundelse *</label>
            <textarea id="b-grund" rows={2} maxLength={250} value={grundBehov}
                      onChange={(e) => setGrundBehov(e.target.value)} />
            <p className="fc-hint">Den der meldte ind, skal kunne se hvorfor.</p>
          </div>
          <div className="fc-med-ikon" style={{ gap: 8, marginTop: 8 }}>
            <Knap variant="primaer" onClick={afvisDetBehov} disabled={!grundBehov.trim()}>
              Afvis behovet
            </Knap>
            <Knap onClick={() => { setAfviserBehov(null); setGrundBehov(""); }}>Fortryd</Knap>
          </div>
        </Kort>
      )}

      {/* ================= BESTILLINGSKLADDER ================= */}
      <KpiRaekke>
        <KpiKort label="Åbne behov med forslag" vaerdi={num(linjer.filter((l) => l.forslag).length)}
                 note={`ud af ${num(linjer.length)} åbne behov i alt`}
                 ikon={<Ikon navn="kasse" />} tone="ikon-4" rund />
        <KpiKort label="Valgt til bestilling"
                 vaerdi={num(valgtIAlt.length)}
                 ikon={<Ikon navn="personer" />} tone="ikon-5" rund />
        <KpiKort label="Anslået beløb" vaerdi={kr(anslaaetOere)}
                 note={udenPris
                   ? `${num(udenPris)} uden kendt pris — beløbet er et minimum`
                   : "seneste kendte priser · ekskl. moms"}
                 ikon={<Ikon navn="seddel" />} tone="ikon-6" rund />
      </KpiRaekke>

      {grupper.map((g) => {
        const udenLev = g.leverandoerId === null;
        const valgt = valgtIGruppe(g);
        return (
          <Kort
            key={g.leverandoerId || "uden-leverandoer"}
            titel={udenLev
              ? `Leverandør mangler (${num(g.linjer.length)})`
              : `${levNavn(g.leverandoerId)} (${num(g.linjer.length)})`}
            handling={!udenLev && maaSkrive && (
              <Knap variant="primaer" disabled={!valgt.length || gemmerBestil}
                    onClick={() => bestil(g)}>
                Bestil valgte ({num(valgt.length)})
              </Knap>
            )}
          >
            {udenLev && (
              <p className="fc-hint" style={{ marginTop: 0 }}>
                Ingen har leveret de her varer før, så der er intet at foreslå.
                <b> Et gæt ville være værre end ingenting</b> — opret
                leverandøren under Leverandører og køb varen ind én gang, så
                kommer forslaget af sig selv næste gang.
              </p>
            )}
            <Tabel
              raekker={g.linjer}
              noegle={(l) => l.behov.id}
              tom="Ingen behov i gruppen."
              kolonner={[
                ...(udenLev ? [] : [{
                  key: "valg", label: "", bredde: 40, midt: true,
                  render: (l) => (
                    <input
                      type="checkbox" aria-label={`Vælg ${l.behov.vare}`}
                      checked={Boolean(valgte[l.behov.id])}
                      disabled={!maaSkrive || !klar(l)}
                      title={klar(l) ? undefined
                        : "Linjen mangler en oplysning — se kolonnen Status."}
                      onChange={(e) => setValgte((v) => ({ ...v, [l.behov.id]: e.target.checked }))}
                    />
                  ),
                }]),
                { key: "vare", label: "Vare", render: (l) => (
                    <>
                      <b>{l.behov.vare}</b>
                      <div className="fc-hint">{l.behov.varenummer || "uden varenummer"}</div>
                    </>
                  ) },
                { key: "forslag", label: "Foreslået leverandør", render: (l) => (l.forslag ? (
                    <>
                      {levNavn(l.forslag.leverandoerId)}
                      <div className="fc-hint">
                        {l.forslag.grundlag === "varenummer"
                          ? "Match på varenummer"
                          : "Match på varenavn — kontrollér at det er den rigtige vare"}
                        {l.forslag.sidstKoebtMs ? ` · sidst købt ${dato(l.forslag.sidstKoebtMs)}` : ""}
                      </div>
                    </>
                  ) : <span className="fc-hint">Ingen tidligere leverance</span>) },
                { key: "antal", label: "Antal", num: true, bredde: 130, render: (l) => (
                    <span className="fc-tal-ind">
                      <input
                        type="number" min="1" inputMode="numeric"
                        aria-label={`Antal for ${l.behov.vare}`}
                        value={antalFor(l) ?? ""}
                        disabled={!maaSkrive}
                        onChange={(e) => setAntal((a) => ({
                          ...a,
                          [l.behov.id]: e.target.value === "" ? null : Number(e.target.value),
                        }))}
                      />
                      <span className="fc-hint">{l.behov.enhed || "stk"}</span>
                    </span>
                  ) },
                { key: "pris", label: "Anslået", num: true, render: (l) => (Number.isInteger(prisFor(l)) ? (
                    <>
                      {Number.isFinite(antalFor(l)) ? kr(prisFor(l) * antalFor(l)) : "—"}
                      <div className="fc-hint">{kr(prisFor(l))} pr. {l.forslag?.enhed || l.behov.enhed || "stk"}</div>
                    </>
                  ) : <span className="fc-hint">Pris ikke kendt</span>) },
                { key: "status", label: "Status", render: (l) => {
                    if (!l.forslag) return <Pille tone="warn">Leverandør mangler</Pille>;
                    if (!Number.isFinite(antalFor(l)) || antalFor(l) <= 0) return <Pille tone="warn">Sæt et antal</Pille>;
                    if (!Number.isInteger(prisFor(l))) return <Pille tone="warn">Pris mangler</Pille>;
                    return <Pille tone="ok">Klar til bestilling</Pille>;
                  } },
              ]}
            />
          </Kort>
        );
      })}
      {!linjer.length && (
        <Kort titel="Bestillingskladder">
          <Tom>Ingen åbne behov at bestille. De kommer fra Indkøbsbehov ovenfor.</Tom>
        </Kort>
      )}
      <Formularsvar svar={svarBestil} okTekst="Bestillingen er oprettet som kladde." />

      <Kort titel={`E-mailudkast (${num(kladder.length)})`}>
        <p className="fc-hint" style={{ marginTop: 0 }}>
          Sådan kommer ordren til at se ud, når den er godkendt. <b>Systemet
          sender den ikke herfra</b> — når ordren er godkendt, sendes den
          rigtigt fra godkendelseskøen nedenfor.
        </p>
        {!kladder.length ? (
          <Tom>Ingen bestillinger i kladde. Vælg varer ovenfor og bestil dem — så står udkastet her.</Tom>
        ) : kladder.map((o) => {
          const udkast = mailudkast(o, { leverandoer: levFor(o.leverandoerId) });
          return (
            <div key={o.id} className="fc-udkast">
              <div className="fc-row" style={{ justifyContent: "space-between" }}>
                <b>{levNavn(o.leverandoerId)}</b>
                <span className="fc-med-ikon" style={{ gap: 8 }}>
                  <Pille tone={ORDRESTATUS[o.status]?.tone}>{ORDRESTATUS[o.status]?.label || o.status}</Pille>
                  <code>{o.nummer}</code>
                </span>
              </div>
              <p className="fc-hint">
                Til: {udkast.tilEmail || "leverandøren har ingen mailadresse i kartoteket"}
                {" · "}Emne: {udkast.emne}
                {" · "}{num(linjeListe(o).length)} linjer
                {" · "}{kr(ordreSumOere(o))} ekskl. moms
              </p>
              <pre className="fc-udkast-tekst">{udkast.brodtekst}</pre>
              <Knap onClick={() => kopier(o, udkast.brodtekst)}>
                {kopieret === o.id ? "Kopieret" : "Kopiér udkast"}
              </Knap>
            </div>
          );
        })}
      </Kort>

      {/* ================= GODKENDELSE ================= */}
      <KpiRaekke>
        <KpiKort label="Afventer godkendelse" vaerdi={num(koe.length)}
                 note={koe.length ? `ældste ventet siden ${dato(koe[0].ordre.oprettetMs)}` : "køen er tom"}
                 ikon={<Ikon navn="klokke" />} tone="ikon-3" rund />
        <KpiKort label="Beløb i kø" vaerdi={kr(koe.reduce((s, kk) => s + kk.sumOere, 0))}
                 note="ekskl. moms" ikon={<Ikon navn="seddel" />} tone="ikon-5" rund />
        <KpiKort label="Godkendt" vaerdi={num(godkendtIAlt.length)}
                 note={`${num(automatisk.length)} godkendt automatisk — uden at nogen kiggede`}
                 ikon={<Ikon navn="skjold" />} tone="ikon-6" rund />
      </KpiRaekke>

      <p className="fc-hint">
        Beløbsgrænse og krav om fakturagodkendelse sættes i{" "}
        <Link className="fc-a" to="/opsaetning/procure/godkendelsesregler">
          Opsætning → Procure → Godkendelsesregler
        </Link>. {regler.overBeloeb?.aktiv && Number.isInteger(regler.overBeloeb?.graenseOere)
          ? <>Indkøb til og med {kr(regler.overBeloeb.graenseOere)} godkendes automatisk.</>
          : "Godkendelse over beløb er slået fra — bestillinger går direkte videre."}
      </p>

      <Formularsvar svar={svarGodkend} okTekst="Gemt." />

      <Kort titel={`Afventer godkendelse (${num(koe.length)})`}>
        {!maaGodkende && (
          <p className="fc-hint fc-bad" style={{ marginTop: 0 }}>
            Du kan se køen, men ikke afgøre den. Det kræver{" "}
            <code>{PERM.indkoebGodkend}</code> — <b>at godkende er en anden
            handling end at bestille.</b>
          </p>
        )}
        <Tabel
          raekker={koe}
          noegle={(kk) => kk.ordre.id}
          tom={regler.overBeloeb?.aktiv
            ? "Ingen bestillinger venter på godkendelse."
            : "Godkendelse over beløb er slået fra — bestillinger går direkte videre."}
          kolonner={[
            { key: "ordre", label: "Ordre / varegruppe", render: (kk) => (
                <>
                  <b>{linjeListe(kk.ordre)[0]?.vare || "—"}</b>
                  {linjeListe(kk.ordre).length > 1 && (
                    <> <span className="fc-hint">+{num(linjeListe(kk.ordre).length - 1)}</span></>
                  )}
                  <div className="fc-hint"><code>{kk.ordre.nummer}</code></div>
                </>
              ) },
            { key: "lev", label: "Leverandør", render: (kk) => levNavn(kk.ordre.leverandoerId) },
            { key: "anmoder", label: "Anmoder", render: (kk) => (
                <>
                  {brugerNavn(kk.ordre.oprettetAf)}
                  {kk.ordre.oprettetAf === regler.overBeloeb?.godkenderUid && (
                    <div className="fc-hint">er selv godkender</div>
                  )}
                </>
              ) },
            { key: "beloeb", label: "Beløb", num: true, render: (kk) => kr(kk.sumOere) },
            { key: "dato", label: "Dato", render: (kk) => dato(kk.ordre.oprettetMs) },
            { key: "grund", label: "Status", render: (kk) => (
                <Pille tone={GODKENDELSESGRUND[kk.grund]?.tone || "info"}>
                  {GODKENDELSESGRUND[kk.grund]?.label || kk.grund}
                </Pille>
              ) },
            { key: "handling", label: "", render: (kk) => (
                <span className="fc-knapper">
                  {tilgaengeligeOrdreHandlinger(kk.ordre, kontekst).map((h) => (
                    <Knap
                      key={h.til}
                      variant={h.til === "godkendt" ? "primaer" : "sekundaer"}
                      disabled={!h.ok || arbejderGodkend}
                      title={h.ok ? undefined : h.aarsag}
                      onClick={() => (h.kraeverBegrundelse
                        ? setAfviserOrdre({ ordre: kk.ordre, til: h.til, label: h.label })
                        : skift(kk.ordre, h.til))}
                    >
                      {h.label}
                    </Knap>
                  ))}
                </span>
              ) },
          ]}
        />
      </Kort>

      <Kort titel={`Alle bestillinger (${num(ordrer.data.length)})`}>
        <Tabel
          raekker={ordrer.data}
          tom="Ingen bestillinger endnu."
          kolonner={[
            { key: "nummer", label: "Nummer", render: (o) => <code>{o.nummer}</code> },
            { key: "lev", label: "Leverandør", render: (o) => levNavn(o.leverandoerId) },
            { key: "sum", label: "Beløb", num: true, render: (o) => kr(ordreSumOere(o)) },
            { key: "status", label: "Tilstand", render: (o) => (
                <>
                  <Pille tone={ORDRESTATUS[o.status]?.tone}>{ORDRESTATUS[o.status]?.label || o.status}</Pille>
                  {o.godkendtAutomatisk && (
                    <div className="fc-hint">automatisk — under grænsen, ingen kiggede</div>
                  )}
                  {o.selvgodkendt && <div className="fc-hint">godkendt af den der bestilte</div>}
                </>
              ) },
            { key: "naeste", label: "Herfra kan den", render: (o) => {
                const h = tilgaengeligeOrdreHandlinger(o, kontekst);
                if (!h.length) return <span className="fc-hint">er afsluttet</span>;
                return (
                  <span className="fc-knapper">
                    {o.status === "godkendt" && (
                      <Knap variant="primaer" disabled={!maaSende || arbejderGodkend}
                            title={maaSende ? undefined : `Det kræver ${PERM.indkoebSkriv}.`}
                            onClick={() => setSender(o)}>
                        Send ordre
                      </Knap>
                    )}
                    {h.map((x) => (
                      <Knap key={x.til} disabled={!x.ok || arbejderGodkend} title={x.ok ? undefined : x.aarsag}
                            onClick={() => (x.kraeverBegrundelse
                              ? setAfviserOrdre({ ordre: o, til: x.til, label: x.label })
                              : skift(o, x.til))}>
                        {x.label}
                      </Knap>
                    ))}
                  </span>
                );
              } },
          ]}
        />
      </Kort>

      {afviserOrdre && (
        <Dialog titel={`${afviserOrdre.label} — ${afviserOrdre.ordre.nummer}`}
                under="Skriv hvorfor. Uden en grund er afvisningen en tavshed, og den samme bestilling bliver lagt igen i næste uge."
                onLuk={() => { setAfviserOrdre(null); setGrundOrdre(""); }}
                handling={
                  <Knap variant="primaer" disabled={!grundOrdre.trim() || arbejderGodkend}
                        onClick={() => skift(afviserOrdre.ordre, afviserOrdre.til, grundOrdre.trim())}>
                    {afviserOrdre.label}
                  </Knap>
                }>
          <MiniLinje label="Beløb" vaerdi={kr(ordreSumOere(afviserOrdre.ordre))} />
          <MiniLinje label="Grund til at den venter"
                     vaerdi={GODKENDELSESGRUND[kraeverGodkendelse(afviserOrdre.ordre, regler).grund]?.label || "—"} />
          <Felt id="grund-ordre" label="Begrundelse" kraevet vaerdi={grundOrdre} saet={setGrundOrdre}
                hint="Står på bestillingen — ikke i auditloggen. Fritekst hører ikke der." />
        </Dialog>
      )}

      {sender && (
        <SendOrdreDialog
          ordre={sender}
          leverandoer={levFor(sender.leverandoerId)}
          onLuk={() => setSender(null)}
          onSendt={() => { setSender(null); ordrer.genindlaes(); }}
        />
      )}
    </div>
  );
}

/**
 * Send ordre — SKIVE 4D, uændret fra Godkendelser.jsx.
 *
 * ⚠ FORHÅNDSVISNINGEN VISER, DEN ÆNDRER IKKE. `ordreMailIndhold()` er den
 * samme rene funktion serveren selv bygger af det server-hentede ordre.
 */
function SendOrdreDialog({ ordre, leverandoer, onLuk, onSendt }) {
  const [sprog, setSprog] = useState(
    erGyldigtSprog(leverandoer?.sprog) ? leverandoer.sprog : STANDARD_SPROG
  );
  const [arbejder, setArbejder] = useState(false);
  const [svar, setSvar] = useState(null);
  const [sendRequestId] = useState(() => (
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `srq-${Date.now()}-${Math.random().toString(36).slice(2)}`
  ));

  const indhold = ordreMailIndhold(ordre, { leverandoer, sprog });

  const send = async () => {
    setArbejder(true);
    setSvar(null);
    const r = await sendOrdreMail({ ordreId: ordre.id, sendRequestId, sprog });
    setArbejder(false);
    setSvar(r);
    if (r.ok) onSendt();
  };

  return (
    <Dialog titel={`Send ordre — ${ordre.nummer}`}
            under="Sendes via den delte mailtransport til den mailadresse leverandøren har i kartoteket."
            onLuk={onLuk}
            handling={
              <Knap variant="primaer" disabled={!indhold.tilEmail || arbejder} onClick={send}>
                Send ordre
              </Knap>
            }>
      {!indhold.tilEmail ? (
        <p className="fc-hint fc-bad" style={{ marginTop: 0 }}>
          Leverandøren har ingen mailadresse i kartoteket. Tilføj en under
          Leverandører, før ordren kan sendes.
        </p>
      ) : (
        <>
          <MiniLinje label="Til" vaerdi={indhold.tilEmail} />
          <MiniLinje label="Leverandør" vaerdi={leverandoer?.navn || "—"} />
          <Feltraekke>
            <Felt id="ordremail-sprog" label="Sprog" valgmuligheder={
              ALLE_SPROG.map((s) => ({ vaerdi: s, label: SPROG[s] }))
            } vaerdi={sprog} saet={setSprog} />
          </Feltraekke>
          <MiniLinje label="Emne" vaerdi={indhold.emne} />
          <p className="fc-hint" style={{ marginBottom: 4 }}>Brødtekst</p>
          <pre className="fc-udkast-tekst">{indhold.brodtekst}</pre>
        </>
      )}
      <Formularsvar svar={svar} okTekst="Ordren er accepteret til afsendelse." />
    </Dialog>
  );
}
