/* src/moduler/indkoeb/Godkendelser.jsx
 * Godkendelse af indkøb — trin 3 af fem (beslutning 78/82). Planche 2.
 *
 * ⚠ TO REGLER, HVER MED SIN KONTAKT, OG BEGGE KAN SLÅS FRA. Kunden bad
 * udtrykkeligt om det: en lille virksomhed hvor samme person bestiller og
 * godkender, får intet ud af et ekstra trin. At kunne slå reglen fra er en
 * FUNKTION og ikke et hul — det er forskellen på en regel og en spærring:
 * reglen er virksomhedens egen politik, ikke systemets.
 *
 * ⚠ MEN DEN SÆTTES AF EN ADMINISTRATOR, IKKE AF DEN DER BESTILLER.
 * `godkendelsesregelskriv` kræver `brugere.skriv`. Den der rammer loftet, må
 * ikke kunne hæve det — samme skelnen som beslutning 24 lavede på
 * auditudtrækket, og her koster den penge.
 *
 * ⚠ SKÆRMEN AFGØR INGENTING. Knapperne tegnes af
 * `tilgaengeligeOrdreHandlinger()`, og `ordrestatus` afviser med den SAMME
 * `kanSkifteIndkoebsordre()`. En knap uden en overgang er en pæn knap; en
 * overgang uden en knap er en vej ingen kan finde.
 */
import { useState } from "react";
import { useListe } from "../../fleet/useListe.js";
import { usePost } from "../../fleet/usePost.js";
import { useFleet } from "../../fleet/FleetContext.jsx";
import { dato, kr, num } from "../../fleet/format.js";
import {
  Kort, Tabel, Pille, Henter, Datatilstand, Knap, Felt, Feltraekke,
  Formularsvar, KpiKort, KpiRaekke, Ikon, MiniLinje, Dialog,
} from "../../fleet/ui.jsx";
import { blokerer } from "../../fleet/datatilstand.js";
import { harPerm, PERM } from "../../fleet/permissions.js";
import {
  ORDRESTATUS, GODKENDELSESGRUND, ventendeOrdrer, kraeverGodkendelse,
  ordreSumOere, linjeListe, tilgaengeligeOrdreHandlinger,
  STANDARD_GODKENDELSESREGLER,
} from "../../fleet/procure.js";
import { skiftOrdre, gemGodkendelsesregler } from "../../fleet/godkendelse.js";
import { DEMO_INDKOEBSORDRER, DEMO_GODKENDELSESREGLER } from "../../fleet/demo-procure.js";
import { DEMO_LEVERANDOERER } from "../../fleet/demo-indkoeb.js";

/* Procesbåndet på planchen. Rækkefølgen ER processen — se nav.js. */
const TRIN = [
  { key: "behov", ikon: "vogn", label: "Behov", under: "Et behov oprettes" },
  { key: "bestilling", ikon: "kasse", label: "Bestilling", under: "Indkøbet bestilles" },
  { key: "godkendt", ikon: "skjold", label: "Godkendt", under: "Indkøbet godkendes" },
  { key: "sendt", ikon: "afspil", label: "Sendt", under: "Ordren sendes til leverandør" },
];

export default function Godkendelser() {
  const { bruger } = useFleet();
  const maaGodkende = harPerm(bruger?.perms, PERM.indkoebGodkend);
  /* ⚠ REGLEN SÆTTES AF EN ADMINISTRATOR. Se noten i toppen. */
  const maaSaetteRegler = harPerm(bruger?.perms, PERM.brugereSkriv);

  const [svar, setSvar] = useState(null);
  const [arbejder, setArbejder] = useState(false);
  const [afviser, setAfviser] = useState(null);
  const [grund, setGrund] = useState("");
  const [udkast, setUdkast] = useState(null);

  const ordrer = useListe("indkoebsordrer", {
    ordnPaa: "oprettetMs", vindue: "alle", graense: 300, demo: DEMO_INDKOEBSORDRER,
  });
  const lev = useListe("leverandoerer", {
    ordnPaa: "navn", vindue: "alle", graense: 500, demo: DEMO_LEVERANDOERER,
  });
  /* ⚠ NODEN ER SELV EN POST — der er ÉN politik pr. virksomhed. Se usePost. */
  const regelPost = usePost(null, "godkendelsesregler", {
    demo: DEMO_GODKENDELSESREGLER,
  });
  /* ⚠ MANGLER NODEN, GÆLDER STANDARDEN — og standarden er INGEN godkendelse.
     Faldt vi tilbage på "godkendelse påkrævet", ville hver eksisterende kunde
     få en kø han ikke havde bedt om, første gang funktionen blev udrullet. */
  const regler = regelPost.post || STANDARD_GODKENDELSESREGLER;
  const brugere = useListe("brugere", { vindue: "alle", graense: 200 });

  if (ordrer.henter) return <Henter hvad="godkendelser" />;
  if (blokerer(ordrer.tilstand)) {
    return <Datatilstand tilstand={ordrer.tilstand} genprov={ordrer.genindlaes} />;
  }

  const levNavn = (id) => lev.data.find((l) => l.id === id)?.navn || id || "—";
  const brugerNavn = (uid) => {
    const b = brugere.data.find((x) => x.id === uid);
    return b?.navn || b?.email || uid || "—";
  };

  const koe = ventendeOrdrer(ordrer.data, regler);
  const kontekst = { perms: bruger?.perms, regler, uid: bruger?.uid };

  const godkendtIAlt = ordrer.data.filter((o) => o.status === "godkendt");
  const automatisk = ordrer.data.filter((o) => o.godkendtAutomatisk === true);

  const skift = async (ordre, til, begrundelse) => {
    setArbejder(true);
    const r = await skiftOrdre({ ordreId: ordre.id, til, begrundelse });
    setSvar(r);
    setArbejder(false);
    setAfviser(null);
    setGrund("");
    if (r.ok) ordrer.genindlaes();
  };

  const gemRegler = async () => {
    setArbejder(true);
    const r = await gemGodkendelsesregler(udkast);
    setSvar(r);
    setArbejder(false);
    if (r.ok) {
      setUdkast(null);
      regelPost.genindlaes();
    }
  };

  /* Formularen arbejder i KRONER; noden bærer øre. Oversættelsen sker ét sted. */
  const nuvaerende = udkast || {
    overBeloeb: {
      aktiv: Boolean(regler.overBeloeb?.aktiv),
      graenseOere: regler.overBeloeb?.graenseOere ?? null,
      godkenderUid: regler.overBeloeb?.godkenderUid || "",
    },
    fakturagodkendelse: {
      aktiv: Boolean(regler.fakturagodkendelse?.aktiv),
      godkenderUid: regler.fakturagodkendelse?.godkenderUid || "",
    },
  };
  const saet = (gren, felt, vaerdi) => setUdkast({
    ...nuvaerende, [gren]: { ...nuvaerende[gren], [felt]: vaerdi },
  });

  const brugervalg = [
    { vaerdi: "", label: "Vælg godkender…" },
    ...brugere.data.map((b) => ({ vaerdi: b.id, label: b.navn || b.email || b.id })),
  ];

  return (
    <div className="fc-grid" style={{ gap: 16 }}>
      <Datatilstand tilstand={ordrer.tilstand} genprov={ordrer.genindlaes} />

      <KpiRaekke>
        <KpiKort
          label="Afventer godkendelse" vaerdi={num(koe.length)}
          note={koe.length ? `ældste ventet siden ${dato(koe[0].ordre.oprettetMs)}` : "køen er tom"}
          ikon={<Ikon navn="klokke" />} tone="ikon-3" rund
        />
        <KpiKort
          label="Beløb i kø"
          vaerdi={kr(koe.reduce((s, k) => s + k.sumOere, 0))}
          note="ekskl. moms"
          ikon={<Ikon navn="seddel" />} tone="ikon-5" rund
        />
        <KpiKort
          label="Godkendt" vaerdi={num(godkendtIAlt.length)}
          /* ⚠ TALLET DELES OP. "Godkendt" uden den her note ville lade et
             automatisk godkendt indkøb tælle som et nogen har set på. */
          note={`${num(automatisk.length)} godkendt automatisk — uden at nogen kiggede`}
          ikon={<Ikon navn="skjold" />} tone="ikon-6" rund
        />
      </KpiRaekke>

      {/* ---- De to regler ---------------------------------------------- */}
      <div className="fc-regelraekke">
        <Kort titel="Godkendelse over beløb"
              handling={<Kontakt aktiv={nuvaerende.overBeloeb.aktiv}
                                 disabled={!maaSaetteRegler}
                                 label="Godkendelse over beløb"
                                 saet={(v) => saet("overBeloeb", "aktiv", v)} />}>
          <p className="fc-hint" style={{ marginTop: 0 }}>
            Kræver godkendelse, når et indkøb <b>overstiger</b> det angivne beløb.
          </p>
          <Feltraekke>
            <Felt id="graense" label="Beløbsgrænse" type="number" suffiks="kr."
                  disabled={!maaSaetteRegler || !nuvaerende.overBeloeb.aktiv}
                  vaerdi={Number.isInteger(nuvaerende.overBeloeb.graenseOere)
                    ? nuvaerende.overBeloeb.graenseOere / 100 : ""}
                  saet={(v) => saet("overBeloeb", "graenseOere",
                    /* ⚠ TOM STRENG ER IKKE NUL. `Number("")` er 0, og en grænse
                       på 0 kr. betyder at ALT skal godkendes — det stik
                       modsatte af "feltet er ikke udfyldt". */
                    v === "" ? null : Math.round(Number(v) * 100))} />
            <Felt id="godkender" label="Godkender" valgmuligheder={brugervalg}
                  disabled={!maaSaetteRegler || !nuvaerende.overBeloeb.aktiv}
                  vaerdi={nuvaerende.overBeloeb.godkenderUid}
                  saet={(v) => saet("overBeloeb", "godkenderUid", v)} />
          </Feltraekke>
          <p className="fc-hint">
            {nuvaerende.overBeloeb.aktiv && Number.isInteger(nuvaerende.overBeloeb.graenseOere)
              ? <>Indkøb til og med {kr(nuvaerende.overBeloeb.graenseOere)} godkendes automatisk.</>
              : "Reglen er slået fra — alle bestillinger går direkte videre."}
          </p>
        </Kort>

        {/* ⚠ GEMT, IKKE HÅNDHÆVET — OG DET STÅR PÅ SKÆRMEN.
            `fakturaer/` er `.write: false`, og der findes ingen funktion der
            skriver den. En kontakt man kunne slå til, ville love noget
            systemet ikke holder — og et løfte man opdager er tomt, er værre
            end en funktion der siger den mangler. Samme mønster som
            filuploaden på Indkøbsbehov. */}
        <Kort titel="Kræv fakturagodkendelse"
              handling={<Kontakt aktiv={false} disabled label="Kræv fakturagodkendelse"
                                 saet={() => {}} />}>
          <p className="fc-hint" style={{ marginTop: 0 }}>
            Kræver godkendelse af fakturaer før betaling.
          </p>
          <p className="fc-hint">
            <b>Reglen er ikke bygget endnu.</b> <code>fakturaer/</code> er{" "}
            <b>.write: false</b>, og der findes ingen funktion der skriver den —
            det er trin 4 i processen og hører i sin egen etape. Kontakten står
            derfor låst: <b>en regel der kan slås til uden at nogen håndhæver
            den, er et løfte systemet ikke holder.</b>
          </p>
        </Kort>

        <Kort titel="Kan slås fra">
          <p className="fc-hint" style={{ marginTop: 0 }}>
            Godkendelsen kan slås fra, hvis virksomheden er lille, eller hvis
            samme person både bestiller og godkender. Så går bestillingen
            direkte videre uden et ekstra trin.
          </p>
          {/* ⚠ DEN UDPEGEDE GODKENDER MÅ GODKENDE SINE EGNE INDKØB, og det er
              en truffet beslutning frem for et hul: reglen navngiver ÉN
              person, og krævede vi derudover to par øjne, kunne hans egne
              ordrer aldrig godkendes. En fire-øjne-regel der ikke kan
              opfyldes, er værre end en selvgodkendelse man kan se — derfor
              markeres den i køen. */}
          <p className="fc-hint">
            Godkenderen kan godkende sine <b>egne</b> bestillinger. Reglen
            udpeger én person, og krævede vi to par øjne, ville hans egne
            ordrer aldrig kunne godkendes. <b>Det markeres i stedet</b>, så det
            kan ses hvem der gjorde hvad.
          </p>
          {!maaSaetteRegler && (
            <p className="fc-hint fc-bad">
              Du kan se reglerne, men ikke ændre dem. Det kræver{" "}
              <code>{PERM.brugereSkriv}</code>: <b>den der rammer loftet, må ikke
              kunne hæve det.</b>
            </p>
          )}
          {maaSaetteRegler && udkast && (
            <Knap variant="primaer" disabled={arbejder} onClick={gemRegler}>
              Gem reglerne
            </Knap>
          )}
        </Kort>
      </div>

      {/* ---- Procesbåndet ---------------------------------------------- */}
      <Kort titel="Indkøbsproces">
        <ol className="fc-proces">
          {TRIN.map((t, i) => (
            <li key={t.key} className="fc-proces-trin">
              <span className={`fc-proces-ikon${i === 0 ? " fc-proces-naa" : ""}`}>
                <Ikon navn={t.ikon} />
              </span>
              <span className="fc-proces-tekst">
                <b>{t.label}</b>
                <span className="fc-hint">{t.under}</span>
              </span>
            </li>
          ))}
        </ol>
      </Kort>

      <Formularsvar svar={svar} okTekst="Gemt." />

      {/* ---- Køen ------------------------------------------------------ */}
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
          noegle={(k) => k.ordre.id}
          tom={regler.overBeloeb?.aktiv
            ? "Ingen bestillinger venter på godkendelse."
            : "Godkendelse over beløb er slået fra — bestillinger går direkte videre."}
          kolonner={[
            {
              key: "ordre", label: "Ordre / varegruppe",
              render: (k) => (
                <>
                  <b>{linjeListe(k.ordre)[0]?.vare || "—"}</b>
                  {linjeListe(k.ordre).length > 1 && (
                    <> <span className="fc-hint">+{num(linjeListe(k.ordre).length - 1)}</span></>
                  )}
                  <div className="fc-hint"><code>{k.ordre.nummer}</code></div>
                </>
              ),
            },
            { key: "lev", label: "Leverandør", render: (k) => levNavn(k.ordre.leverandoerId) },
            {
              key: "anmoder", label: "Anmoder",
              render: (k) => (
                <>
                  {brugerNavn(k.ordre.oprettetAf)}
                  {/* ⚠ SELVGODKENDELSE SIGES FØR DEN SKER, ikke bagefter. Den
                      der trykker, skal kunne se at han godkender sit eget. */}
                  {k.ordre.oprettetAf === regler.overBeloeb?.godkenderUid && (
                    <div className="fc-hint">er selv godkender</div>
                  )}
                </>
              ),
            },
            { key: "beloeb", label: "Beløb", num: true, render: (k) => kr(k.sumOere) },
            { key: "dato", label: "Dato", render: (k) => dato(k.ordre.oprettetMs) },
            {
              key: "grund", label: "Status",
              render: (k) => (
                <Pille tone={GODKENDELSESGRUND[k.grund]?.tone || "info"}>
                  {GODKENDELSESGRUND[k.grund]?.label || k.grund}
                </Pille>
              ),
            },
            {
              key: "handling", label: "",
              render: (k) => (
                <span className="fc-knapper">
                  {tilgaengeligeOrdreHandlinger(k.ordre, kontekst).map((h) => (
                    <Knap
                      key={h.til}
                      variant={h.til === "godkendt" ? "primaer" : "sekundaer"}
                      disabled={!h.ok || arbejder}
                      /* ⚠ EN GRÅ KNAP MED SIN GRUND, ikke en knap der
                         forsvinder. En knap der er væk, efterlader
                         spørgsmålet "hvorfor kan jeg ikke det her?". */
                      title={h.ok ? undefined : h.aarsag}
                      onClick={() => (h.kraeverBegrundelse
                        ? setAfviser({ ordre: k.ordre, til: h.til, label: h.label })
                        : skift(k.ordre, h.til))}
                    >
                      {h.label}
                    </Knap>
                  ))}
                </span>
              ),
            },
          ]}
        />
      </Kort>

      {/* ---- Alle bestillinger, så tilstanden kan følges ---------------- */}
      <Kort titel={`Alle bestillinger (${num(ordrer.data.length)})`}>
        <Tabel
          raekker={ordrer.data}
          tom="Ingen bestillinger endnu."
          kolonner={[
            { key: "nummer", label: "Nummer", render: (o) => <code>{o.nummer}</code> },
            { key: "lev", label: "Leverandør", render: (o) => levNavn(o.leverandoerId) },
            { key: "sum", label: "Beløb", num: true, render: (o) => kr(ordreSumOere(o)) },
            {
              key: "status", label: "Tilstand",
              render: (o) => (
                <>
                  <Pille tone={ORDRESTATUS[o.status]?.tone}>
                    {ORDRESTATUS[o.status]?.label || o.status}
                  </Pille>
                  {/* ⚠ "GODKENDT AUTOMATISK" ER IKKE "GODKENDT". Uden den her
                      linje ser et indkøb ingen har set på, ud som et nogen
                      sagde god for — og flaget er hele grunden til at feltet
                      findes. */}
                  {o.godkendtAutomatisk && (
                    <div className="fc-hint">
                      automatisk — under grænsen, ingen kiggede
                    </div>
                  )}
                  {o.selvgodkendt && (
                    <div className="fc-hint">godkendt af den der bestilte</div>
                  )}
                </>
              ),
            },
            {
              key: "naeste", label: "Herfra kan den",
              render: (o) => {
                const h = tilgaengeligeOrdreHandlinger(o, kontekst);
                if (!h.length) return <span className="fc-hint">er afsluttet</span>;
                return (
                  <span className="fc-knapper">
                    {h.map((x) => (
                      <Knap key={x.til} disabled={!x.ok || arbejder} title={x.ok ? undefined : x.aarsag}
                            onClick={() => (x.kraeverBegrundelse
                              ? setAfviser({ ordre: o, til: x.til, label: x.label })
                              : skift(o, x.til))}>
                        {x.label}
                      </Knap>
                    ))}
                  </span>
                );
              },
            },
          ]}
        />
      </Kort>

      {/* ---- Begrundelsen ---------------------------------------------- */}
      {afviser && (
        <Dialog titel={`${afviser.label} — ${afviser.ordre.nummer}`}
                under="Skriv hvorfor. Uden en grund er afvisningen en tavshed, og den samme bestilling bliver lagt igen i næste uge."
                onLuk={() => { setAfviser(null); setGrund(""); }}
                handling={
                  <Knap variant="primaer" disabled={!grund.trim() || arbejder}
                        onClick={() => skift(afviser.ordre, afviser.til, grund.trim())}>
                    {afviser.label}
                  </Knap>
                }>
          <MiniLinje label="Beløb" vaerdi={kr(ordreSumOere(afviser.ordre))} />
          <MiniLinje label="Grund til at den venter"
                     vaerdi={GODKENDELSESGRUND[kraeverGodkendelse(afviser.ordre, regler).grund]?.label
                       || "—"} />
          <Felt id="grund" label="Begrundelse" kraevet vaerdi={grund} saet={setGrund}
                hint="Står på bestillingen — ikke i auditloggen. Fritekst hører ikke der." />
        </Dialog>
      )}
    </div>
  );
}

/**
 * Planchens kontakt.
 *
 * ⚠ EN RIGTIG CHECKBOX INDENI. Et `<div>` med en `onClick` er ikke en kontakt
 * for den der bruger tastatur eller skærmlæser — den kan ikke nås med Tab, har
 * ingen tilstand at læse op, og reagerer ikke på mellemrumstasten.
 */
function Kontakt({ aktiv, saet, label, disabled }) {
  return (
    <label className={`fc-kontakt${aktiv ? " fc-kontakt-til" : ""}`}>
      <input type="checkbox" checked={aktiv} disabled={disabled}
             aria-label={label} onChange={(e) => saet(e.target.checked)} />
      <span className="fc-kontakt-spor" aria-hidden="true" />
    </label>
  );
}
