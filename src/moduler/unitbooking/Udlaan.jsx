/* src/moduler/unitbooking/Udlaan.jsx
 * Unitbooking – udlån. Den operationelle kerne: søg ledige i periode, reservér,
 * klargør, udlever, modtag retur.
 *
 * ⚠ SKÆRMEN SKRIVER IKKE. `kasseudlaan` er `.write: false`, og hver handling
 * går gennem `kasseudlaanskriv`. Det er ikke en rettighed der mangler —
 * lagermedarbejderen HAR `kasseudlaan.skriv`. Det er fordi handlingen ændrer
 * TO poster, perioden skal prøves mod de andre udlån, og to lagermænd kan
 * ramme samme sekund. Hele begrundelsen står i functions/index.js.
 *
 * ⚠ KONFLIKTTJEKKET HER AFGØR INGENTING. `konflikter()` bruges til at vise
 * hvad der er ledigt, så man ikke sender en booking man ved bliver afvist.
 * Serveren spørger igen, inde i sin transaktion, og det er DEN der gælder.
 * Fjernes serverens tjek, er det her dekoration — præcis som de fem
 * disponeringstjek.
 *
 * ⚠ "LEDIG I PERIODEN" ER IKKE "LEDIG NU". En kasse der er hos et museum i
 * dag, men hjemme igen inden perioden begynder, KAN reserveres. Prototypen
 * kunne kun svare på nuet, og derfor blev der ringet.
 *
 * ⚠ EN KNAP FOR ET ULOVLIGT SKIFT FINDES IKKE. Rækkens knapper kommer af
 * `UDLAAN_SKIFT` — samme tabel som serveren håndhæver. En knap der altid
 * bliver afvist, lærer brugeren at fejlbeskeder er støj.
 */
import { useState } from "react";
import { useListe } from "../../fleet/useListe.js";
import { useFleet } from "../../fleet/FleetContext.jsx";
import { num, dato, pct, iDagIso, isoTilMs, msTilIso } from "../../fleet/format.js";
import { harPerm, PERM } from "../../fleet/permissions.js";
import { blokerer } from "../../fleet/datatilstand.js";
import {
  Kort, Tabel, Pille, Knap, Felt, Feltraekke, Formular, Formularsvar,
  Henter, Datatilstand, Tom, Ikon, KpiKort, KpiRaekke,
} from "../../fleet/ui.jsx";
import {
  UDLAAN_TILSTAND, ALLE_UDLAAN_TILSTANDE, UDLAAN_SKIFT,
  KASSE_STATUS, pladsnavn, konflikter, ledigeKasser, valideUdlaan,
  undertyperFor, naesteSkift, kassebelaegning,
} from "../../fleet/unitbooking.js";
import { opretUdlaan, skiftUdlaan } from "../../fleet/udlaan.js";
import {
  DEMO_KASSER, DEMO_KASSETYPER, DEMO_KASSEUDLAAN,
} from "../../fleet/demo-unitbooking.js";
import { DEMO_REOLPLADSER } from "../../fleet/demo-lager.js";

const DAG = 86400000;

/** Etiketten på knappen for et skift. Verbet, ikke tilstanden. */
const SKIFTELABEL = {
  klargjort: "Klargør",
  udlaant: "Udlevér",
  returneret: "Modtag retur",
  annulleret: "Annullér",
  booket: "Fortryd klargøring",
};

/** Hvad skiftet gør ved kassen, i én sætning. Står på knappens title. */
const SKIFTEFORKLARING = {
  klargjort: "Kassen pakkes og sættes til klargjort. Den bliver stående på sin hylde.",
  udlaant: "Kassen forlader huset. Den mister sin reolplads — hylden bliver fri.",
  returneret: "Kassen er kommet hjem og sættes tilbage på sin hjemplads.",
  annulleret: "Reservationen falder bort. Kassen bliver ledig igen.",
  booket: "Klargøringen rulles tilbage. Reservationen består.",
};

/* ---- Reservationsformularen -------------------------------------------- */

function Reservationsformular({ kasse, fra, til, kunder, kundetilstand, paaGemt, paaLuk }) {
  const [f, saetF] = useState({ sagsnummer: "", kundeId: "", beskrivelse: "" });
  const [roert, saetRoert] = useState({});
  const [visAlle, saetVisAlle] = useState(false);
  const [gemmer, saetGemmer] = useState(false);
  const [svar, saetSvar] = useState(null);

  const saet = (felt) => (v) => {
    saetF((x) => ({ ...x, [felt]: v }));
    saetRoert((x) => ({ ...x, [felt]: true }));
    saetSvar(null);
  };

  /* ⚠ SAMME valideUdlaan() SOM SERVEREN. Filen er kopieret til
     functions/delt/, og en prøve fejler hvis de to ikke er identiske. Skærmen
     svarer hurtigt; serveren afgør. */
  const post = { ...f, kasseId: kasse.id, fra, til, tilstand: "booket" };
  const fejl = valideUdlaan(post, {});
  const vis = (felt) => (visAlle || roert[felt] ? fejl[felt] : null);
  const kanGemme = Object.keys(fejl).length === 0;

  const gemNu = async () => {
    saetVisAlle(true);
    if (!kanGemme) return;
    saetGemmer(true);
    const r = await opretUdlaan({
      kasseId: kasse.id, sagsnummer: f.sagsnummer,
      kundeId: f.kundeId || null, beskrivelse: f.beskrivelse || null,
      fra, til,
    });
    saetGemmer(false);
    saetSvar(r);
    if (r.ok) paaGemt();
  };

  return (
    <Kort titel={`Reservér ${kasse.id}`}>
      <p className="fc-hint">
        {dato(fra)} – {dato(til)}. Kassen bliver <b>ikke</b> flyttet — den står
        på sin hylde, indtil den bliver klargjort.
      </p>
      <Formular onGem={gemNu} gemmer={gemmer} kanGemme={kanGemme}
                gemLabel="Reservér kassen" onAnnuller={paaLuk} svar={svar}>
        <Feltraekke>
          {/* ⚠ DEN ENESTE NØGLE UD AF SYSTEMET. Uden sagsnummer kan kassen
              ikke findes igen når museet ringer. */}
          <Felt id="u-sag" label="Sagsnummer" kraevet vaerdi={f.sagsnummer}
                saet={saet("sagsnummer")} fejl={vis("sagsnummer")}
                hint="Museets eller sagens nummer. Fx 4260." />
          {kunder.length > 0 ? (
            <Felt id="u-kunde" label="Kunde" vaerdi={f.kundeId} saet={saet("kundeId")}
                  valgmuligheder={[{ vaerdi: "", label: "— ingen —" },
                    ...kunder.map((k) => ({ vaerdi: k.id, label: k.navn || k.id }))]}
                  hint="Valgfri. Kobler udlånet til kundekartoteket." />
          ) : blokerer(kundetilstand) ? (
            /* ⚠ IKKE FORTIET. Kunne kundekartoteket ikke læses, står det her
               — en tom rulleliste ville se ud som om der ingen kunder var.
               Udlånet kan sagtens oprettes uden; sagsnummeret er nøglen. */
            <p className="fc-hint">
              Kundekartoteket kan ikke læses herfra — feltet er udeladt.
              Sagsnummeret er nøglen, og udlånet kan oprettes uden.
            </p>
          ) : null}
        </Feltraekke>
        <Felt id="u-besk" label="Beskrivelse" vaerdi={f.beskrivelse}
              saet={saet("beskrivelse")} fejl={vis("beskrivelse")}
              hint="Fx udstillingens navn. Til jer selv." />
      </Formular>
    </Kort>
  );
}

/* ---- Skærmen ------------------------------------------------------------ */

export default function Udlaan() {
  const { bruger } = useFleet();
  const maaSkrive = harPerm(bruger?.perms, PERM.kasseudlaanSkriv);

  const [fraIso, saetFraIso] = useState(iDagIso);
  const [tilIso, saetTilIso] = useState(() => msTilIso(Date.now() + 14 * DAG));
  const [type, saetType] = useState("");
  const [undertype, saetUndertype] = useState("");
  const [soeger, saetSoeger] = useState(false);
  const [reserverer, saetReserverer] = useState(null);

  const [filter, saetFilter] = useState("");
  const [soeg, saetSoeg] = useState("");
  const [arbejder, saetArbejder] = useState(null);
  const [svar, saetSvar] = useState(null);

  const { data: udlaan, tilstand, genindlaes, henter } = useListe("kasseudlaan", {
    division: "alle", graense: 2000, demo: DEMO_KASSEUDLAAN,
    sorter: (a, b) => (b.fra || 0) - (a.fra || 0),
  });
  const { data: kasser } = useListe("kasser", {
    division: "alle", graense: 1000, demo: DEMO_KASSER,
    sorter: (a, b) => a.id.localeCompare(b.id, "da"),
  });
  const { data: pladser } = useListe("reolpladser", {
    division: "alle", graense: 500, demo: DEMO_REOLPLADSER,
  });
  const { data: typer } = useListe("kassetyper", {
    division: "alle", graense: 100, demo: DEMO_KASSETYPER,
  });
  /* ⚠ KUNDER KAN VÆRE UTILGÆNGELIGE, og det er ikke en fejl: `kunder` er sit
     eget modul, og en unitbooking-kunde behøver ikke have det. Feltet udelades
     i så fald — et påkrævet felt mod en node man ikke må læse, ville gøre
     skærmen ubrugelig for præcis den rolle der bruger den. */
  const { data: kunder, tilstand: kundetilstand } = useListe("kunder", {
    division: "alle", graense: 500, demo: [],
  });

  if (henter) return <Henter hvad="udlånene" />;

  const kasseMap = Object.fromEntries(kasser.map((k) => [k.id, k]));
  const pladsMap = Object.fromEntries(pladser.map((p) => [p.id, p]));

  const fra = isoTilMs(fraIso);
  const til = isoTilMs(tilIso);
  const periodeOk = Number.isFinite(fra) && Number.isFinite(til) && til >= fra;

  const ledige = periodeOk
    ? ledigeKasser(kasseMap, udlaan, {
      fra, til, type: type || null, undertype: undertype || null,
    })
    : [];

  /* ⚠ AFLEDT AF LISTEN SKÆRMEN HAR. Ingen af tallene er et aggregat, og et
     gemt tal ville drive fra listen. Se undtagelsen i CLAUDE.md. */
  const antal = (t) => udlaan.filter((u) => u.tilstand === t).length;
  const nu = Date.now();
  /* Undertyperne på den valgte type — ikke alle typers blandet sammen. */
  const soegUndertyper = undertyperFor(typer.find((t) => t.id === type));
  const forsinkede = udlaan.filter((u) => u.tilstand === "udlaant" && u.til < nu);
  /* ⚠ SAMME FUNKTION SOM KASSELISTEN BRUGER — se noten ved kortet. Skærmen
     henter kasselisten i forvejen til søgningen efter ledige. */
  const bel = kassebelaegning(kasser);

  const q = soeg.trim().toLowerCase();
  const viste = udlaan.filter((u) =>
    (!filter || u.tilstand === filter) &&
    (!q || (u.sagsnummer || "").toLowerCase().includes(q) ||
      (u.kasseId || "").toLowerCase().includes(q) ||
      (u.beskrivelse || "").toLowerCase().includes(q)));

  const skift = async (u, til2) => {
    saetArbejder(u.id);
    saetSvar(null);
    const r = await skiftUdlaan({ udlaanId: u.id, til: til2 });
    saetArbejder(null);
    saetSvar(r);
    if (r.ok) genindlaes();
  };

  return (
    <div className="fc-grid" style={{ gap: 16 }}>
      <KpiRaekke>
        <KpiKort label="Reserveret" vaerdi={num(antal("booket"))}
                 ikon={<Ikon navn="kasse" />} tone="ikon-5" rund
                 note="lovet væk, står stadig på hylden" />
        <KpiKort label="Klargjort" vaerdi={num(antal("klargjort"))} note="pakket, klar til afhentning" />
        <KpiKort label="Ude nu" vaerdi={num(antal("udlaant"))} note="hos kunden" />
        {/* ⚠ EN OVERSKREDET RETURDATO ER IKKE EN FEJL I SYSTEMET — den er en
            kasse der ikke er kommet hjem. Den skal stå der, ikke gemmes væk
            i en liste ingen åbner. */}
        <KpiKort label="Over tiden" vaerdi={num(forsinkede.length)}
                 note={forsinkede.length
                   ? forsinkede.map((u) => u.kasseId).slice(0, 3).join(", ")
                   : "alle er hjemme til tiden"} />
        {/* ⚠ NØJAGTIG SAMME TAL SOM PÅ KASSELISTEN, fordi det er den SAMME
            funktion. To skærme der begge sagde "belægningsgrad" og regnede
            hver sit, ville være beslutning 6 brudt — og forskellen ville se
            ud som et datahul frem for to regnestykker.
            ⚠ Og noten hører til tallet: nævneren er de BRUGBARE kasser, så
            procenten stiger hver gang en kasse går i stykker. */}
        <KpiKort label="Belægningsgrad" vaerdi={pct(bel.pct)}
                 note={bel.pct === null
                   ? "ingen brugbare kasser at regne på"
                   : `${num(bel.iBrug)} af ${num(bel.kanBruges)} brugbare` +
                     (bel.udeAfDrift ? ` · ${num(bel.udeAfDrift)} ude af drift` : "")} />
      </KpiRaekke>

      <Datatilstand tilstand={tilstand} genprov={genindlaes} />

      <Kort titel="Ledige kasser i en periode">
        <div className="fc-filtre">
          <div className="fc-felt">
            <label htmlFor="us-fra">Fra</label>
            <input id="us-fra" type="date" value={fraIso}
                   onChange={(e) => { saetFraIso(e.target.value); saetSoeger(false); }} />
          </div>
          <div className="fc-felt">
            <label htmlFor="us-til">Til</label>
            <input id="us-til" type="date" value={tilIso}
                   onChange={(e) => { saetTilIso(e.target.value); saetSoeger(false); }} />
          </div>
          <div className="fc-felt">
            <label htmlFor="us-type">Type</label>
            <select id="us-type" value={type}
                    onChange={(e) => {
                      saetType(e.target.value);
                      /* ⚠ ET TYPESKIFT RYDDER UNDERTYPEN. To typer kan have
                         hver sin undertype med samme nøgle — "std" findes både
                         på Alukasse og Klimakasse — og en efterladt værdi ville
                         søge efter en kombination der ikke findes. */
                      saetUndertype("");
                      saetSoeger(false);
                    }}>
              <option value="">Alle typer</option>
              {typer.map((t) => <option key={t.id} value={t.id}>{t.navn}</option>)}
            </select>
          </div>
          {/* Kun når en type er valgt, og kun hvis den HAR undertyper. */}
          {soegUndertyper.length > 0 && (
            <div className="fc-felt">
              <label htmlFor="us-undertype">Undertype</label>
              <select id="us-undertype" value={undertype}
                      onChange={(e) => { saetUndertype(e.target.value); saetSoeger(false); }}>
                <option value="">Alle undertyper</option>
                {soegUndertyper.map((u) => (
                  <option key={u.id} value={u.id}>{u.navn}</option>
                ))}
              </select>
            </div>
          )}
          <div className="fc-filtre-knapper">
            <Knap variant="primaer" disabled={!periodeOk}
                  onClick={() => { saetSoeger(true); saetReserverer(null); }}>
              Søg ledige
            </Knap>
          </div>
        </div>

        {!periodeOk ? (
          <p className="fc-svar fc-svar-fejl" role="alert">
            Slutdatoen ligger før startdatoen.
          </p>
        ) : !soeger ? (
          <p className="fc-hint">
            {/* ⚠ INKLUSIVE I BEGGE ENDER. En kasse der kommer retur den 5. og
                skal ud igen den 5., skal pakkes ud, tjekkes og pakkes om. */}
            Perioden tæller <b>begge dage med</b>. En kasse der kommer hjem
            samme dag som den skal ud igen, regnes som optaget.
          </p>
        ) : ledige.length === 0 ? (
          <Tom>
            Ingen kasser er fri i hele perioden. Prøv en anden type eller andre
            datoer — en kasse der er ude i dag, kan godt være hjemme inden den
            {" "}{dato(fra)}.
          </Tom>
        ) : (
          <Tabel
            kolonner={[
              { key: "id", label: "Kasse", render: (k) => <b>{k.id}</b> },
              { key: "type", label: "Type",
                render: (k) => typer.find((t) => t.id === k.type)?.navn || k.type },
              { key: "status", label: "Står nu", render: (k) => (
                  <>
                    <Pille tone={KASSE_STATUS[k.status]?.pill || "info"}>
                      {KASSE_STATUS[k.status]?.label || k.status}
                    </Pille>{" "}
                    {k.pladsId
                      ? <span className="fc-hint">{pladsnavn(pladsMap[k.pladsId])}</span>
                      : <span className="fc-neutral">— ude</span>}
                  </>
                ) },
              /* ⚠ DEN HER KOLONNE ER GRUNDEN TIL AT SØGNINGEN ER PERIODEBASERET.
                 En kasse kan være ude i dag og alligevel ledig i perioden. */
              { key: "andre", label: "Andre reservationer", render: (k) => {
                  const r = konflikter(udlaan, { kasseId: k.id, fra: 0, til: 9e15 })
                    .filter((u) => u.til >= nu);
                  return r.length
                    ? <span className="fc-hint">{r.length} · næste {dato(r[0].fra)}</span>
                    : <span className="fc-neutral">ingen</span>;
                } },
              { key: "handling", label: "", render: (k) => (
                  <Knap variant="primaer" disabled={!maaSkrive}
                        title={maaSkrive ? `Reservér ${k.id} i perioden.`
                          : `Kræver ${PERM.kasseudlaanSkriv} — serveren afviser.`}
                        onClick={() => saetReserverer(k)}>
                    Reservér
                  </Knap>
                ) },
            ]}
            raekker={ledige}
            tom="Ingen kasser er fri i perioden."
          />
        )}
      </Kort>

      {reserverer && (
        <Reservationsformular
          kasse={reserverer} fra={fra} til={til} kunder={kunder}
          kundetilstand={kundetilstand}
          paaLuk={() => saetReserverer(null)}
          paaGemt={() => { saetReserverer(null); saetSoeger(false); genindlaes(); }} />
      )}

      <Kort titel={`Udlån (${num(viste.length)} af ${num(udlaan.length)})`}>
        <div className="fc-filtre">
          <div className="fc-felt">
            <label htmlFor="uf-soeg">Søg</label>
            <input id="uf-soeg" type="search" value={soeg}
                   placeholder="Sagsnummer, kasse eller beskrivelse"
                   onChange={(e) => saetSoeg(e.target.value)} />
          </div>
          <div className="fc-felt">
            <label htmlFor="uf-tilstand">Tilstand</label>
            <select id="uf-tilstand" value={filter}
                    onChange={(e) => saetFilter(e.target.value)}>
              <option value="">Alle tilstande</option>
              {ALLE_UDLAAN_TILSTANDE.map((t) => (
                <option key={t} value={t}>{UDLAAN_TILSTAND[t].label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* ⚠ SERVERENS EGEN BESKED. Siger den at kassen er lovet væk på sag
            4260, er DET svaret — ikke "kunne ikke gemmes". */}
        <Formularsvar svar={svar} />

        <Tabel
          kolonner={[
            { key: "kasse", label: "Kasse", render: (u) => <b>{u.kasseId}</b> },
            { key: "sag", label: "Sag", render: (u) => u.sagsnummer },
            { key: "besk", label: "Beskrivelse", render: (u) => (
                <span className="fc-hint">{u.beskrivelse || "—"}</span>
              ) },
            { key: "periode", label: "Periode", render: (u) => (
                <>
                  {dato(u.fra)} – {dato(u.til)}
                  {u.tilstand === "udlaant" && u.til < nu && (
                    <> <Pille tone="bad">over tiden</Pille></>
                  )}
                </>
              ) },
            { key: "tilstand", label: "Tilstand", render: (u) => (
                <Pille tone={UDLAAN_TILSTAND[u.tilstand]?.pill || "info"}>
                  {UDLAAN_TILSTAND[u.tilstand]?.label || u.tilstand}
                </Pille>
              ) },
            /* ⚠ ÉN TYDELIG HANDLING PR. RÆKKE. Planchen: "Du ved altid, hvad
               der skal gøres nu." Før stod alle lovlige skift som ligeværdige
               knapper, og så er "Annullér" lige så fremtrædende som "Klargør"
               — på en skærm hvor det ene sker hver dag og det andet sjældent.
               Fremad-skridtet står her; undtagelserne står i kolonnen efter. */
            { key: "naeste", label: "Næste handling", render: (u) => {
                const t = naesteSkift(u.tilstand);
                if (!t) return <span className="fc-neutral">afsluttet</span>;
                return (
                  <Knap variant="primaer"
                        disabled={!maaSkrive || arbejder === u.id}
                        title={maaSkrive ? SKIFTEFORKLARING[t]
                          : `Kræver ${PERM.kasseudlaanSkriv} — serveren afviser.`}
                        onClick={() => skift(u, t)}>
                    {arbejder === u.id ? "…" : SKIFTELABEL[t] || t}
                  </Knap>
                );
              } },
            { key: "handling", label: "", render: (u) => {
                /* Undtagelserne: alt andet end skridtet fremad. */
                const muligheder = (UDLAAN_SKIFT[u.tilstand] || [])
                  .filter((t) => t !== naesteSkift(u.tilstand));
                if (!muligheder.length) return null;
                return (
                  <span className="fc-med-ikon" style={{ gap: 6 }}>
                    {muligheder.map((t) => (
                      <Knap key={t}
                            disabled={!maaSkrive || arbejder === u.id}
                            title={maaSkrive ? SKIFTEFORKLARING[t]
                              : `Kræver ${PERM.kasseudlaanSkriv} — serveren afviser.`}
                            onClick={() => skift(u, t)}>
                        {arbejder === u.id ? "…" : SKIFTELABEL[t] || t}
                      </Knap>
                    ))}
                  </span>
                );
              } },
          ]}
          raekker={viste}
          tom="Ingen udlån matcher filteret."
        />

        <p className="fc-hint" style={{ marginTop: 10 }}>
          ⚠ <b>Der er ingen genvej fra reserveret til udlånt.</b> Klargøringen
          er det ene sted hvor et menneske har kassen i hånden og kan se om den
          er hel. Springes den over, opdages en skade først hos museet — hvor
          den ikke kan afgøres.
        </p>
      </Kort>
    </div>
  );
}
