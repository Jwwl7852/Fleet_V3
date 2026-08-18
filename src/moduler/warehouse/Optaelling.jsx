/* src/moduler/warehouse/Optaelling.jsx
 * Warehouse – optælling (cycle count) og afvigelser.
 *
 * ⚠ SKÆRMEN SENDER IKKE FORVENTNINGEN MED. Serveren læser saldoen i det
 * øjeblik der tælles og regner selv forskellen. Sendte skærmen den, ville
 * afvigelsen være forskellen mellem hvad brugeren TROEDE der stod og hvad han
 * talte — og så måler den ingenting.
 *
 * Derfor viser formularen heller ikke det forventede tal, før der er talt.
 * Står svaret på skærmen, tæller man efter det.
 *
 * ⚠ EN AFVIGELSE SKAL HAVE EN ÅRSAG, og årsagen er en allowliste. Fritekst
 * kan ikke summeres: "svind", "Svind?" og "vist nok stjålet" ville være tre
 * kategorier af det samme problem.
 *
 * ⚠ MEN EN STOR AFVIGELSE BLOKERER IKKE. Krævede vi godkendelse over en
 * grænse, ville den der finder det største hul, være den der ikke kan lukke
 * sin optælling — og så bliver der talt mindre, ikke mere.
 *
 * ⚠ EN NEGATIV SALDO ER ALTID FORFALDEN. Den er beviset på at en bevægelse
 * mangler, og fejlen vokser indtil nogen går ud og kigger.
 */
import { useState } from "react";
import { useListe } from "../../fleet/useListe.js";
import { useFleet } from "../../fleet/FleetContext.jsx";
import { num, pct, dato, datoTid } from "../../fleet/format.js";
import { harPerm, PERM } from "../../fleet/permissions.js";
import {
  Kort, Tabel, Pille, Knap, Felt, Feltraekke, Formularsvar,
  Henter, Datatilstand, Ikon, KpiKort, KpiRaekke,
} from "../../fleet/ui.jsx";
import { pladsnavn } from "../../fleet/unitbooking.js";
import {
  AFVIGELSESAARSAG, ALLE_AFVIGELSESAARSAGER, ENHED,
  MAENGDE_SKALA, maengdeFraTal, talFraMaengde,
  noejagtighed, MINDSTE_OPTAELLINGER, afvigelserPrAarsag,
  forfaldneOptaellinger, OPTAELLINGSINTERVAL_DAGE, UDEN_BATCH,
} from "../../fleet/warehouse.js";
import { skrivOptaelling } from "../../fleet/lager.js";
import {
  DEMO_VARER, DEMO_REOLPLADSER, DEMO_BEHOLDNING, DEMO_CARRIERS,
} from "../../fleet/demo-lager.js";

export default function Optaelling() {
  const { bruger } = useFleet();
  const maaSkrive = harPerm(bruger?.perms, PERM.bevaegelserSkriv);

  const [valgt, saetValgt] = useState(null);
  const [taelt, saetTaelt] = useState("");
  const [aarsag, saetAarsag] = useState("");
  const [note, saetNote] = useState("");
  const [arbejder, saetArbejder] = useState(false);
  const [svar, saetSvar] = useState(null);
  const [resultat, saetResultat] = useState(null);

  const { data: optaellinger, tilstand, genindlaes, henter } = useListe("optaellinger", {
    division: "alle", graense: 2000, demo: [],
    sorter: (a, b) => (b.tidspunktMs || 0) - (a.tidspunktMs || 0),
  });
  const { data: beholdning, genindlaes: genBeh } = useListe("beholdning", {
    division: "alle", graense: 5000, demo: DEMO_BEHOLDNING,
  });
  const { data: varer } = useListe("varer", {
    division: "alle", graense: 2000, demo: DEMO_VARER,
  });
  const { data: pladser } = useListe("reolpladser", {
    division: "alle", graense: 2000, demo: DEMO_REOLPLADSER,
  });
  /* ⚠ DER TÆLLES I EN BEHOLDER, IKKE PÅ EN HYLDE (etape 12). Hylden vises
     stadig — den er beholderens adresse, og den der skal ud og tælle, skal
     vide hvor han går hen. */
  const { data: carriers } = useListe("carriers", {
    division: "alle", graense: 2000, demo: DEMO_CARRIERS,
  });

  if (henter) return <Henter hvad="optællingerne" />;

  const vareMap = Object.fromEntries(varer.map((v) => [v.id, v]));
  const pladsMap = Object.fromEntries(pladser.map((p) => [p.id, p]));
  const carrierMap = Object.fromEntries(carriers.map((c) => [c.id, c]));

  /* Beholderen OG hvor den står. Uden hylden ved den der skal tælle, ikke
     hvor han går hen; uden beholderen ved han ikke hvad han skal åbne. */
  const hvor = (carrierId) => {
    const c = carrierMap[carrierId];
    if (!c) return carrierId || "—";
    return `${c.id} · ${c.pladsId ? pladsnavn(pladsMap[c.pladsId]) : "uden lokation"}`;
  };

  const nu = Date.now();
  const forfaldne = forfaldneOptaellinger(beholdning, optaellinger, nu);
  const negative = beholdning.filter((b) => (b.antal || 0) < 0);
  const noej = noejagtighed(optaellinger);
  const aarsager = afvigelserPrAarsag(optaellinger);
  const afvigende = optaellinger.filter((o) => (o.afvigelse || 0) !== 0);

  const vare = valgt ? vareMap[valgt.vareId] : null;
  const skaleret = taelt === "" ? NaN : maengdeFraTal(taelt);
  const kraeverAarsag = valgt && Number.isFinite(skaleret) && skaleret !== (valgt.antal || 0);
  const kanTaelle = valgt && Number.isFinite(skaleret) && skaleret >= 0 &&
    (!kraeverAarsag || ALLE_AFVIGELSESAARSAGER.includes(aarsag)) &&
    (!ENHED[vare?.enhed]?.helTal || skaleret % MAENGDE_SKALA === 0);

  const luk = () => {
    saetValgt(null); saetTaelt(""); saetAarsag(""); saetNote("");
    saetSvar(null); saetResultat(null);
  };

  const taelOp = async () => {
    if (!kanTaelle) return;
    saetArbejder(true);
    const r = await skrivOptaelling({
      carrierId: valgt.carrierId, vareId: valgt.vareId,
      batch: valgt.batch && valgt.batch !== UDEN_BATCH ? valgt.batch : null,
      taeltAntal: skaleret, aarsag: kraeverAarsag ? aarsag : null, note,
    });
    saetArbejder(false);
    saetSvar(r);
    if (r.ok) {
      /* ⚠ RESULTATET VISES FØRST NU. Se hovedet: står forventningen på
         skærmen inden man tæller, tæller man efter den. */
      saetResultat(r.data);
      saetTaelt(""); saetAarsag(""); saetNote("");
      genindlaes(); genBeh();
    }
  };

  const linje = (b) => {
    const v = vareMap[b.vareId];
    return `${v?.varenummer || b.vareId} · ${hvor(b.carrierId)}${
      b.batch && b.batch !== UDEN_BATCH ? ` · ${b.batch}` : ""}`;
  };

  return (
    <div className="fc-grid" style={{ gap: 16 }}>
      <KpiRaekke>
        {/* ⚠ null UNDER MINDSTE_OPTAELLINGER — og teksten siger hvorfor. To
            optællinger og to hundrede ser ens ud som en procent, og så skiftes
            der arbejdsgang på grundlag af én uenighed. */}
        <KpiKort label="Lagernøjagtighed"
                 vaerdi={noej == null ? "—" : pct(noej * 100, 1)}
                 ikon={<Ikon navn="skjold" />} tone="ikon-5" rund
                 note={noej == null
                   ? `for lidt grundlag — ${num(optaellinger.length)} af ${MINDSTE_OPTAELLINGER} optællinger`
                   : `${num(optaellinger.length)} optællinger`} />
        <KpiKort label="Forfaldne" vaerdi={num(forfaldne.length)}
                 note={`ikke talt i ${OPTAELLINGSINTERVAL_DAGE} dage`} />
        <KpiKort label="Negative saldi" vaerdi={num(negative.length)}
                 note={negative.length
                   ? "tæl dem først — der mangler en bevægelse"
                   : "beholdningen er hel"} />
        <KpiKort label="Afvigelser" vaerdi={num(afvigende.length)}
                 note={aarsager.length
                   ? `størst: ${AFVIGELSESAARSAG[aarsager[0].aarsag]?.label}`
                   : "ingen afvigelser registreret"} />
      </KpiRaekke>

      <Datatilstand tilstand={tilstand} genprov={genindlaes} />

      {valgt && (
        <Kort titel={`Tæl ${linje(valgt)}`}>
          {/* ⚠ DET FORVENTEDE TAL STÅR IKKE HER. Se hovedet. */}
          <p className="fc-hint">
            Gå ud og tæl, og skriv hvad der <b>ligger i beholderen</b>. Det
            forventede tal vises først bagefter — står det her, tæller man
            efter det frem for efter varerne.
          </p>

          <Feltraekke>
            <Felt id="t-antal" label="Talt" kraevet type="number" step="any"
                  suffiks={ENHED[vare?.enhed]?.label} vaerdi={taelt}
                  saet={(v) => { saetTaelt(v); saetSvar(null); saetResultat(null); }}
                  hint={ENHED[vare?.enhed]?.helTal ? "Kan ikke deles." : undefined} />
            {kraeverAarsag && (
              <Felt id="t-aarsag" label="Årsag til afvigelsen" kraevet vaerdi={aarsag}
                    saet={saetAarsag}
                    valgmuligheder={[{ vaerdi: "", label: "— vælg —" },
                      ...ALLE_AFVIGELSESAARSAGER.map((a) => ({
                        vaerdi: a, label: AFVIGELSESAARSAG[a].label,
                      }))]}
                    hint="En ærlig 'Ukendt' er bedre end en gætteværdi." />
            )}
            <Felt id="t-note" label="Note" vaerdi={note} saet={saetNote} />
          </Feltraekke>

          {kraeverAarsag && (
            <p className="fc-hint">
              ⚠ Tallet er ikke det systemet ventede. Optællingen bliver
              registreret alligevel — <b>hylden er sandheden</b> — men
              afvigelsen står som sin egen post der ikke kan slettes.
            </p>
          )}

          <div className="fc-formular-knapper">
            <Knap variant="primaer" disabled={!kanTaelle || !maaSkrive || arbejder}
                  onClick={taelOp}
                  title={maaSkrive ? undefined
                    : `Kræver ${PERM.bevaegelserSkriv} — reglerne afviser.`}>
              {arbejder ? "Registrerer …" : "Registrér optælling"}
            </Knap>
            <Knap onClick={luk} disabled={arbejder}>Luk</Knap>
          </div>

          <Formularsvar svar={svar} />

          {resultat && (
            <p className={`fc-svar ${resultat.afvigelse === 0 ? "fc-svar-ok" : "fc-svar-fejl"}`}
               role="status">
              {resultat.afvigelse === 0
                ? `Optalt ${num(talFraMaengde(resultat.taeltAntal), 0)} — det passer med systemet.`
                : `Systemet ventede ${num(talFraMaengde(resultat.forventet), 0)}, du talte ${
                    num(talFraMaengde(resultat.taeltAntal), 0)}. Afvigelse ${
                    resultat.afvigelse > 0 ? "+" : ""}${num(talFraMaengde(resultat.afvigelse), 0)}. ` +
                  `Beholdningen er rettet til det talte.`}
            </p>
          )}
        </Kort>
      )}

      <Kort titel={`Skal tælles (${num(forfaldne.length)})`}>
        <Tabel
          kolonner={[
            { key: "vare", label: "Vare", render: (b) => (
                <b>{vareMap[b.vareId]?.varenummer || b.vareId}</b>
              ) },
            { key: "plads", label: "Lokation",
              render: (b) => hvor(b.carrierId) },
            { key: "batch", label: "Batch", render: (b) => (
                b.batch && b.batch !== UDEN_BATCH
                  ? <span className="fc-hint">{b.batch}</span>
                  : <span className="fc-neutral">—</span>
              ) },
            { key: "antal", label: "Systemet siger", num: true, render: (b) => (
                <span className={b.negativ ? "fc-bad" : undefined}>
                  {num(talFraMaengde(b.antal), 0)}
                </span>
              ) },
            { key: "senest", label: "Sidst talt", render: (b) => (
                b.senestOptaltMs
                  ? <span className="fc-hint">{dato(b.senestOptaltMs)}</span>
                  : <span className="fc-neutral">aldrig</span>
              ) },
            { key: "hvorfor", label: "", render: (b) => (
                b.negativ
                  ? <Pille tone="bad">negativ — der mangler en bevægelse</Pille>
                  : <Pille tone="warn">forfalden</Pille>
              ) },
            { key: "handling", label: "", render: (b) => (
                <Knap variant="primaer" disabled={!maaSkrive}
                      onClick={() => { luk(); saetValgt(b); }}>
                  Tæl
                </Knap>
              ) },
          ]}
          raekker={forfaldne}
          tom="Alt er talt inden for intervallet, og ingen saldo er negativ."
        />
      </Kort>

      {aarsager.length > 0 && (
        <Kort titel="Afvigelser fordelt på årsag">
          <Tabel
            kolonner={[
              { key: "aarsag", label: "Årsag", render: (a) => (
                  <Pille tone={AFVIGELSESAARSAG[a.aarsag]?.tone || "info"}>
                    {AFVIGELSESAARSAG[a.aarsag]?.label || a.aarsag}
                  </Pille>
                ) },
              { key: "antal", label: "Optællinger", num: true,
                render: (a) => num(a.antal) },
              /* ⚠ SUMMEN BÆRER FORTEGN. Fundet og svind må ikke udligne
                 hinanden i ANTAL, men i mængde er det netop forskellen der
                 er interessant. */
              { key: "sum", label: "Mængde i alt", num: true, render: (a) => (
                  <span className={a.sum < 0 ? "fc-bad" : "fc-good"}>
                    {a.sum > 0 ? "+" : ""}{num(talFraMaengde(a.sum), 0)}
                  </span>
                ) },
            ]}
            raekker={aarsager}
            noegle={(a) => a.aarsag}
            tom="Ingen afvigelser."
          />
          <p className="fc-hint" style={{ marginTop: 10 }}>
            ⚠ <b>"Ukendt" er en gyldig årsag.</b> Tvinges folk til at vælge en
            de ikke kender, vælger de en tilfældig — og så er statistikken
            værre end ingen. En ærlig ukendt kan tælles for sig og undersøges.
          </p>
        </Kort>
      )}

      <Kort titel={`Optællinger (${num(optaellinger.length)})`}>
        <Tabel
          kolonner={[
            { key: "tid", label: "Tidspunkt",
              render: (o) => <span className="fc-hint">{datoTid(o.tidspunktMs)}</span> },
            { key: "vare", label: "Vare",
              render: (o) => <b>{vareMap[o.vareId]?.varenummer || o.vareId}</b> },
            { key: "plads", label: "Lokation",
              render: (o) => hvor(o.carrierId) },
            { key: "forventet", label: "Forventet", num: true,
              render: (o) => num(talFraMaengde(o.forventet), 0) },
            { key: "taelt", label: "Talt", num: true,
              render: (o) => num(talFraMaengde(o.taeltAntal), 0) },
            { key: "afvigelse", label: "Afvigelse", num: true, render: (o) => (
                o.afvigelse === 0
                  ? <span className="fc-good">0</span>
                  : <span className="fc-bad">
                      {o.afvigelse > 0 ? "+" : ""}{num(talFraMaengde(o.afvigelse), 0)}
                    </span>
              ) },
            { key: "aarsag", label: "Årsag", render: (o) => (
                o.aarsag
                  ? <Pille tone={AFVIGELSESAARSAG[o.aarsag]?.tone || "info"}>
                      {AFVIGELSESAARSAG[o.aarsag]?.label || o.aarsag}
                    </Pille>
                  : <span className="fc-neutral">—</span>
              ) },
            { key: "note", label: "Note", render: (o) => (
                <span className="fc-hint">{o.note || "—"}</span>
              ) },
          ]}
          raekker={optaellinger}
          tom="Der er ikke talt endnu."
        />
        <p className="fc-hint" style={{ marginTop: 10 }}>
          ⚠ <b>En optælling kan ikke rettes bagefter.</b> Den er en måling, ikke
          en holdning — noden er <b>.write: false</b> for enhver klient. Kunne
          afvigelsen redigeres, ville optællingen være vejen til at <b>skjule</b>
          {" "}et svind frem for vejen til at finde det. Er der talt forkert,
          tælles der igen, og begge målinger står.
        </p>
      </Kort>
    </div>
  );
}
