/* src/moduler/opsaetning/Brugere.jsx
 * Brugere & roller
 *
 * ⚠ DER ER INGEN MOCKUP FOR DEN HER SKÆRM, og den er ikke bygget på gæt.
 * Alt hvad den viser, står allerede i permissions.js, dev-brugere.js og
 * firebase.rules.json. Den viser det — den opfinder det ikke.
 *
 * ---------------------------------------------------------------------------
 * ⚠ KUNDEN KAN NU REDIGERE SINE ROLLER — BESLUTNING 31b
 *
 * Her stod at spørgsmålet var besvaret med beslutning 31: rollerne var faste,
 * og `roller/` var fjernet fra regelfilen. Kunden har bedt om det modsatte, og
 * beslutningen er truffet igen med åbne øjne. Begge afsnit står i
 * BESLUTNINGER.md, fordi det første er det eneste sted der står HVAD DER GÅR
 * GALT uden det.
 *
 * De to farer er håndteret, ikke forsvundet:
 *
 *  1. AT LÅSE SIG SELV UDE. `brugere.skriv` kan ikke fjernes fra den SIDSTE
 *     rolle der har den, og heller ikke fra ens EGEN. Editoren viser
 *     spærringen FØR man trykker — men den ligger på SERVEREN. `laaserUde()`
 *     er den samme funktion begge steder; en kontrol der kun fandtes her,
 *     ville være en pæn knap, og den pæne knap ville koste kunden adgangen til
 *     sit eget system.
 *
 *  2. TO HÅNDHÆVELSESPUNKTER. `roller/` er en KILDE, aldrig et
 *     håndhævelsespunkt: reglerne læser den ALDRIG, og adgang afgøres
 *     udelukkende af `auth.token.perms`. Noden siger hvad der bliver mintet
 *     næste gang.
 *
 * ⚠ OG SKÆRMEN LÆSER NODEN, IKKE KONSTANTEN. Viste den `ROLLE_PERMS`, ville
 * den stå med standarden mens brugerne gik rundt med noget andet i deres
 * tokens — og begge tal ville se rigtige ud.
 *
 * De to øvrige åbne spørgsmål står: hvordan inviteres en bruger, og hvem
 * spærrer et login.
 *
 * ---------------------------------------------------------------------------
 * ⚠ EN KLIENT KAN STADIG IKKE LISTE BRUGERE. Firebase Auth har ingen
 * listUsers på klientsiden, og det ændrer sig ikke.
 *
 * Listen her kommer derfor fra et INDEKS — tenants/<id>/brugere — som den
 * Cloud Function der opretter brugeren, skriver i samme kald. Indekset er
 * ikke sandheden; Auth er sandheden. Men det er det eneste en klient kan
 * læse, og de to skrives sammen.
 *
 * Alternativet var at lade funktionen liste ALLE konti og filtrere på tenant.
 * Det skanner hver eneste kundes brugere ved hvert opslag, og en filtrering
 * man selv skriver, er en filtrering man kan komme til at glemme. Et indeks
 * pr. tenant kan ikke lække på tværs, fordi det ligger UNDER tenanten.
 *
 * Indekset bærer hverken claims eller adgangskode. Claims står i tokenet,
 * hvor de hører hjemme — lå de også her, kunne de to drive fra hinanden, og
 * indekset ville være det man kiggede på.
 *
 * ⚠ DE TRE HANDLINGER ER FUNKTIONER, ikke skrivninger. createUser,
 * setCustomUserClaims og updateUser findes ikke på klientsiden. Tenanten
 * tages af KALDERENS token — en admin hos kunde A der selv måtte oplyse den,
 * kunne oprette en administrator hos kunde B.
 *
 * ---------------------------------------------------------------------------
 * BESLUTNING 28: PERMS KOMMER FRA TOKENET. En klient kan ikke ændre sit eget
 * token, og derfor ændrer INTET på denne skærm noget af sig selv — hverken
 * rolleskiftet eller rolleeditoren. Begge kalder en Cloud Function, som minter
 * claims om og kalder revokeRefreshTokens. Uden det sidste beholder brugeren
 * sin gamle adgang indtil tokenet udløber af sig selv, og det er den værste
 * fejltilstand: den ser ud som om den lykkedes.
 *
 * ⚠ EN ROLLEÆNDRING RAMMER HVER BRUGER MED ROLLEN. Svaret bærer hvor mange
 * der blev fornyet — en ændring der lykkedes for otte ud af ni, er ikke en
 * ændring der lykkedes, og skærmen siger det.
 *
 * MEDARBEJDERE UDEN LOGIN hører under Bemanding → Medarbejdere. `personId` er
 * hvem noget HANDLER om; `uid` er hvem der GJORDE noget (beslutning 18). En
 * chauffør har måske aldrig et login.
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { useListe } from "../../fleet/useListe.js";
import { harModul } from "../../fleet/moduler.js";
import { DASHBOARDS, SAMLET as SAMLET_NOEGLE } from "../../fleet/dashboards.js";
import {
  opretBruger, skiftRolle, spaerLogin, nytLoesen, valideNyBruger, BRUGERSVAR,
  skrivRolle, permsForTenant, valideRolleperms, laaserUde, NOEGLEPERM,
  skrivDashboardvisning, synligeDashboards, skjulerAlt
} from "../../fleet/brugere.js";
import { useFleet } from "../../fleet/FleetContext.jsx";
import {
  ALLE_ROLLER, ROLLE_LABEL, ALLE_PERMS, PERM,
  permsFraRolle, rolleHarPerm, harPerm, permsFraStreng
} from "../../fleet/permissions.js";
import { num } from "../../fleet/format.js";
import {
  Kort, Tabel, Pille, Gitter, MiniLinje, Knap, Tom, KpiKort, KpiRaekke, Ikon,
  Datatilstand, Felt, Feltraekke, Formular, Formularsvar, Raekke
} from "../../fleet/ui.jsx";

/**
 * De permissions der er værd at sammenligne rollerne på.
 *
 * ⚠ IKKE ALLE 31. En matrix med 31 kolonner kan ikke læses, og en matrix man
 * ikke kan læse, bliver ikke læst. De her ni er dem hvor rollerne FAKTISK
 * adskiller sig — resten har enten alle eller kun admin, og det siger
 * kolonnen "af N permissions" allerede.
 */
const MATRIX = [
  { perm: PERM.bookingOpret, label: "Opret booking" },
  { perm: PERM.bookingForeslaa, label: "Foreslå" },
  { perm: PERM.bookingGodkend, label: "Godkend" },
  { perm: PERM.bookingSensitiveLaes, label: "Se følgebil & adresse" },
  { perm: PERM.bookingVaerdiLaes, label: "Se godsets værdi" },
  { perm: PERM.koeretoejerSensitiveLaes, label: "Se hvor bilerne er" },
  { perm: PERM.fravaerSensitiveLaes, label: "Se fraværsårsag" },
  { perm: PERM.personaleSensitiveLaes, label: "Se CPR" },
  { perm: PERM.auditLaes, label: "Læs auditlog" },
];

/**
 * Opret et login.
 *
 * ⚠ INGEN TENANT I FORMULAREN. Funktionen tager den fra kalderens token, og
 * et felt der ser ud til at betyde noget men ignoreres, er værre end intet
 * felt. Se noten i brugere.js.
 *
 * ⚠ INGEN PERMS-LISTE. Man vælger en ROLLE; permissionerne udledes af
 * presettet. Kunne man vælge dem enkeltvis, kunne en admin give sig selv
 * noget der ikke findes i noget preset — og rollegennemgangen ville ikke
 * længere beskrive virkeligheden.
 */
function Opretformular({ kode, paaLuk, paaOprettet }) {
  const [f, saetF] = useState({ navn: "", email: "", rolle: "chauffoer" });
  const [roert, saetRoert] = useState({});
  const [visAlle, saetVisAlle] = useState(false);
  const [gemmer, saetGemmer] = useState(false);
  const [svar, saetSvar] = useState(null);

  const saet = (felt) => (v) => {
    saetF((x) => ({ ...x, [felt]: v }));
    saetRoert((x) => ({ ...x, [felt]: true }));
    saetSvar(null);
  };

  const fejl = valideNyBruger({ ...f, kode });
  const vis = (felt) => (visAlle || roert[felt] ? fejl[felt] : null);
  const kanGemme = Object.keys(fejl).length === 0;

  const gemNu = async () => {
    saetVisAlle(true);
    if (!kanGemme) return;
    saetGemmer(true);
    const r = await opretBruger({ ...f, kode });
    saetGemmer(false);
    if (r.ok) paaOprettet(kode);
    else saetSvar({ ok: false, art: r.art, besked: r.besked });
  };

  const valgt = ROLLE_LABEL[f.rolle];

  return (
    <div style={{ marginBottom: 18 }}>
      <Formular onGem={gemNu} gemmer={gemmer} kanGemme={kanGemme}
                gemLabel="Opret login" onAnnuller={paaLuk} svar={svar}>
        <Feltraekke>
          <Felt id="br-navn" label="Navn" kraevet vaerdi={f.navn} saet={saet("navn")}
                fejl={vis("navn")} />
          <Felt id="br-mail" label="E-mail" kraevet type="email" vaerdi={f.email}
                saet={saet("email")} fejl={vis("email")}
                hint="Bliver brugerens login. Adressen kan ikke bruges hos to virksomheder." />
          <Felt id="br-rolle" label="Rolle" kraevet vaerdi={f.rolle} saet={saet("rolle")}
                fejl={vis("rolle")}
                valgmuligheder={ALLE_ROLLER.map((r) => ({
                  vaerdi: r, label: ROLLE_LABEL[r]?.label || r
                }))} />
        </Feltraekke>

        {/* Rollens begrundelse står under valget — så man ser hvad man giver
            væk, mens man vælger, og ikke først bagefter. */}
        {valgt && (
          <p className="fc-hint" style={{ marginTop: -4 }}>
            <b>{valgt.hvad}</b> {valgt.hvorfor}{" "}
            <span className="fc-neutral">
              ({num(permsFraRolle(f.rolle).length)} af {num(ALLE_PERMS.length)} permissions)
            </span>
          </p>
        )}

        <Felt id="br-kode" label="Adgangskode" vaerdi={kode} readOnly
              hint="Genereret. Vises kun én gang efter oprettelsen — Firebase gemmer kun et hash." />
      </Formular>
    </div>
  );
}

export default function Brugere() {
  const { bruger, tenantId, tenant, moduler } = useFleet();
  /* ⚠ STRENGEN OM TIL EN LISTE. `bruger.perms` er claim-strengen |a|b|c|, og
     `.length` paa den er TEGNANTALLET — kortet skrev "688 permissions i dit
     token" om en administrator der har 41. harPerm() taaler begge former, saa
     adgangstjekkene var rigtige hele tiden; det var kun taellingen der loej.
     Se permsFraStreng() i permissions.js. */
  const mineP = permsFraStreng(bruger?.perms);
  const maaAdministrere = harPerm(mineP, PERM.brugereSkriv);

  const [opretter, setOpretter] = useState(false);
  const [nyKode, setNyKode] = useState("");
  const [vistKode, setVistKode] = useState("");
  /* uid'et på den række der er en handling i gang på — så knappen kan
     deaktiveres uden at hele tabellen fryser. */
  const [arbejder, setArbejder] = useState(null);
  const [svar, setSvar] = useState(null);
  /* Hvilken rolle der redigeres, eller null. */
  const [redigerer, setRedigerer] = useState(null);

  /* Brugerindekset. ⚠ IKKE Auth — se noten på kortet. */
  const {
    data: brugere, tilstand: brugerTilstand, genindlaes: genindlaesBrugere
  } = useListe("brugere", {
    graense: 200,
    /* Ingen division: et login hører til en virksomhed, ikke en afdeling. */
    sorter: (a, b) => (a.navn || "").localeCompare(b.navn || "", "da"),
    demo: []
  });

  /* ⚠ TENANTENS EGNE ROLLEDEFINITIONER — BESLUTNING 31b.
     Skærmen læste ROLLE_PERMS, altså standarden. Har kunden redigeret sin
     disponentrolle, ville skærmen have vist noget andet end det brugerne
     faktisk har i deres tokens — og det er den slags forskel ingen opdager,
     fordi begge tal ser rigtige ud.

     ⚠ NODEN ER EN KILDE, IKKE ET HÅNDHÆVELSESPUNKT. Den siger hvad der
     bliver mintet næste gang; adgang afgøres af tokenet. Reglerne læser den
     aldrig. Se beslutning 31b.

     vindue:"alle": en rolle har hverken et tidspunkt
     eller en afdeling. */
  const {
    data: rolleraekker, genindlaes: genindlaesRoller
  } = useListe("roller", { vindue: "alle", demo: [] });

  /* useListe giver en LISTE med id pr. post; permsForTenant() vil have et
     opslag. Oversættelsen står ét sted. */
  const rolleNode = Object.fromEntries(
    (rolleraekker || []).map((r) => [r.id, { perms: r.perms || [] }]));

  /* ⚠ EN VISNING, IKKE EN ADGANG. `kpi/` er læsbar for enhver i tenanten,
     så en afkrydsning her SKJULER et dashboard — den spærrer det ikke.
     Skærmen skriver det, så ingen slår Økonomi fra for en chauffør og TROR
     at tallene er utilgængelige. Se dashboardvisning.js. */
  const {
    data: visningsraekker, genindlaes: genindlaesVisning
  } = useListe("dashboardvisning", { vindue: "alle", demo: [] });
  const visningPr = Object.fromEntries(
    (visningsraekker || []).map((r) => {
      const { id, ...rest } = r;
      return [id, rest];
    }));

  /* Hvilken bruger der redigeres visning for, eller null. */
  const [visningFor, setVisningFor] = useState(null);

  const efterHandling = (r) => {
    setArbejder(null);
    setSvar(r.ok ? { ok: true } : { ok: false, art: r.art, besked: r.besked });
    /* ⚠ OGSÅ VED `forsvundet`. Kontoen var slettet uden om systemet, og
       funktionen har netop fjernet den døde række — men den står stadig på
       skærmen indtil listen hentes igen. Uden det ville næste klik ramme
       samme række og få samme besked, og brugeren ville tro beskeden løj. */
    if (r.ok || r.art === BRUGERSVAR.forsvundet) genindlaesBrugere();
  };

  const skiftRollePaa = async (r, rolle) => {
    setArbejder(r.id);
    setSvar(null);
    efterHandling(await skiftRolle({ uid: r.id, rolle }));
  };

  const skiftSpaerring = async (r) => {
    setArbejder(r.id);
    setSvar(null);
    efterHandling(await spaerLogin({ uid: r.id, spaerret: !r.spaerret }));
  };

  /* ⚠ EFFEKTIVE PERMISSIONS, ikke standarden. `egen` siger om kunden har
     redigeret rollen — en rolle uden egen definition er ikke det samme som
     en rolle der er redigeret til at ligne standarden, og forskellen er
     værd at kunne se på skærmen. */
  const roller = ALLE_ROLLER.map((r) => ({
    id: r,
    ...ROLLE_LABEL[r],
    perms: permsForTenant(r, rolleNode),
    standard: permsFraRolle(r),
    egen: Array.isArray(rolleNode[r]?.perms),
  }));

  return (
    <div className="fc-grid" style={{ gap: 16 }}>
      <KpiRaekke>
        <KpiKort label="Roller" vaerdi={num(ALLE_ROLLER.length)}
                 ikon={<Ikon navn="skjold" />} tone="ikon-5" rund
                 note={roller.some((r) => r.egen)
                   ? `${num(roller.filter((r) => r.egen).length)} redigeret af jer`
                   : "navnene er faste — indholdet kan redigeres"} />
        <KpiKort label="Permissions i kataloget" vaerdi={num(ALLE_PERMS.length)}
                 ikon={<Ikon navn="dokument" />} tone="ikon-4" rund
                 note="hver svarer til en regel" />
        <KpiKort label="Din rolle" vaerdi={ROLLE_LABEL[bruger?.rolle]?.label || bruger?.rolle || "—"}
                 ikon={<Ikon navn="personer" />} tone="ikon-6" rund
                 note={`${num(mineP.length)} permissions i dit token`} />
        <KpiKort label="Medarbejdere uden login" vaerdi="Workforce"
                 ikon={<Ikon navn="bygning" />} tone="ikon-2" rund
                 note="personId, ikke uid" til="/opsaetning/medarbejdere" />
      </KpiRaekke>

      {/* ⚠ LISTEN KOMMER FRA ET INDEKS, IKKE FRA AUTH. Firebase Auth har
          stadig ingen listUsers på klientsiden — det ændrer sig ikke. Men
          funktionen der opretter brugeren, skriver samtidig en post i
          tenants/<id>/brugere, og DEN kan en klient læse. Indekset er ikke
          sandheden; Auth er sandheden. De skrives i samme kald. */}
      <Kort
        titel={`Brugere med login (${num(brugere.length)})`}
        handling={
          <Knap variant="primaer" disabled={!maaAdministrere}
                onClick={() => { setOpretter(true); setNyKode(nytLoesen()); setSvar(null); }}
                title={maaAdministrere
                  ? "Opret et login til en medarbejder."
                  : `Kræver ${PERM.brugereSkriv}, som kun admin har — funktionen afviser.`}>
            Opret bruger
          </Knap>
        }
      >
        <Datatilstand tilstand={brugerTilstand} genprov={genindlaesBrugere} />

        {opretter && (
          <Opretformular
            kode={nyKode}
            paaLuk={() => { setOpretter(false); setNyKode(""); }}
            paaOprettet={(kode) => {
              setOpretter(false);
              setVistKode(kode);
              genindlaesBrugere();
            }}
          />
        )}

        {/* ⚠ LØSENET VISES ÉN GANG. Firebase gemmer kun et hash, og der er
            ingen mailafsendelse endnu — så administratoren skal give det
            videre selv. En "send invitation"-knap der ikke sendte noget,
            ville være værre. */}
        {vistKode && (
          <div className="fc-empty fc-empty-info" style={{ padding: "16px 20px" }}>
            <p><b>Brugeren er oprettet. Adgangskoden vises kun nu:</b></p>
            <p><code style={{ fontSize: 16, letterSpacing: ".04em" }}>{vistKode}</code></p>
            <p className="fc-hint" style={{ marginTop: 8 }}>
              Den kan ikke hentes frem igen — Firebase gemmer kun et hash. Giv den
              til brugeren, og bed hende skifte den. Hvordan en bruger <b>skal</b>{" "}
              inviteres, står stadig åbent i projektets spørgsmålsliste.
            </p>
            <Knap onClick={() => setVistKode("")}>Jeg har noteret den</Knap>
          </div>
        )}

        <Tabel
          kolonner={[
            { key: "navn", label: "Navn", render: (r) => <b>{r.navn}</b> },
            { key: "email", label: "E-mail" },
            { key: "rolle", label: "Rolle", render: (r) => (
                maaAdministrere && r.id !== bruger?.uid ? (
                  <select value={r.rolle} disabled={arbejder === r.id}
                          onChange={(e) => skiftRollePaa(r, e.target.value)}>
                    {ALLE_ROLLER.map((v) => (
                      <option key={v} value={v}>{ROLLE_LABEL[v]?.label || v}</option>
                    ))}
                  </select>
                ) : (ROLLE_LABEL[r.rolle]?.label || r.rolle)
              ) },
            { key: "spaerret", label: "Login", render: (r) => (
                r.spaerret
                  ? <Pille tone="bad">Spærret</Pille>
                  : <Pille tone="ok">Aktivt</Pille>
              ) },
            { key: "dashboards", label: "Dashboards", render: (r) => {
              /* ⚠ TALLET, IKKE EN LISTE. Syv navne i en celle kan ikke
                 læses; tallet siger om nogen har rørt indstillingen. */
              const synlige = synligeDashboards(
                visningPr[r.id], (m) => harModul(moduler, m)).length;
              const alle = synligeDashboards(null, (m) => harModul(moduler, m)).length;
              return (
                <Knap disabled={!maaAdministrere}
                      onClick={() => setVisningFor(visningFor === r.id ? null : r.id)}
                      title="Hvilke dashboards brugeren får vist. Ikke en adgang — se noten.">
                  {num(synlige)} af {num(alle)}
                </Knap>
              );
            } },
            { key: "handling", label: "", render: (r) => (
                /* ⚠ MAN KAN IKKE SPÆRRE SIG SELV. Funktionen afviser det, og
                   knappen skjules — den sidste administrator der gjorde det,
                   ville have låst hele virksomheden ude. */
                r.id === bruger?.uid ? <span className="fc-neutral">dig selv</span> : (
                  <Knap disabled={!maaAdministrere || arbejder === r.id}
                        onClick={() => skiftSpaerring(r)}
                        title={r.spaerret
                          ? "Åbn loginnet igen."
                          : "Spær loginnet. Personen bliver stående i Medarbejdere."}>
                    {arbejder === r.id ? "…" : r.spaerret ? "Åbn login" : "Spær login"}
                  </Knap>
                )
              ) },
          ]}
          raekker={brugere}
          tom={
            brugerTilstand?.art === "ok"
              ? "Ingen brugere med login endnu. Opret den første ovenfor."
              : "Brugerlisten kunne ikke hentes."
          }
        />

        <Formularsvar svar={svar} />

        <p className="fc-hint" style={{ marginTop: 12 }}>
          Listen er et <b>indeks</b>, skrevet af den funktion der oprettede
          brugeren — ikke Auth selv. Auth er sandheden; de to skrives i samme
          kald. Indekset bærer <b>hverken claims eller adgangskode</b>: claims
          står i tokenet, hvor de hører hjemme, og lå de også her, kunne de to
          drive fra hinanden.
        </p>
        <p className="fc-hint" style={{ marginTop: 8 }}>
          ⚠ <b>Et rolleskift fornyer tokenet.</b> Funktionen kalder{" "}
          <code>revokeRefreshTokens</code>; uden det beholder brugeren sin gamle
          adgang indtil tokenet udløber af sig selv — og så er nedgraderingen en
          pæn knap frem for en spærring.
        </p>
        <p className="fc-hint" style={{ marginTop: 8 }}>
          <b>Et login er ikke en person.</b> Spærrer du loginnet, bliver
          medarbejderen stående under{" "}
          <Link className="fc-a" to="/opsaetning/medarbejdere">Medarbejdere</Link> —
          der hænger indberetninger og reservationer på hende, og en post fra
          sidste år skal stadig kunne opløses til et navn.
        </p>
        {visningFor && (
          <Visningspanel
            key={visningFor}
            uid={visningFor}
            navn={brugere.find((b) => b.id === visningFor)?.navn || visningFor}
            visning={visningPr[visningFor]}
            harModulFn={(m) => harModul(moduler, m)}
            paaLuk={() => setVisningFor(null)}
            paaGemt={() => { genindlaesVisning(); setVisningFor(null); }}
          />
        )}
      </Kort>

      <Kort
        titel="Rollerne"
        handling={maaAdministrere
          ? <Knap onClick={() => setRedigerer(redigerer ? null : "admin")}>
              {redigerer ? "Luk redigering" : "Redigér en rolle"}
            </Knap>
          : null}
      >
        <p className="fc-hint" style={{ marginBottom: 12 }}>
          ⚠ <b>Rollernes NAVNE er faste — indholdet kan I redigere.</b>{" "}
          Beslutning 31 gjorde begge dele faste; <b>31b</b> omgjorde det halve.
          Man tildeler stadig blandt de syv, og en ottende er en ændring i
          koden — men hvad en rolle <i>betyder</i>, kan sættes her.
        </p>
        <p className="fc-hint" style={{ marginBottom: 12 }}>
          ⚠ <b>To ting kan ikke lade sig gøre</b>, og det er den beskyttelse
          beslutning 31 blev truffet for: <code>{NOEGLEPERM}</code> kan ikke
          fjernes fra den <b>sidste</b> rolle der har den, og heller ikke fra{" "}
          <b>din egen</b>. En vognmand der fjernede den fra sin adminrolle,
          havde lukket sig ude af sit eget system — og adgangen til at rette
          det var selv en permission. Spærringen ligger på <b>serveren</b>,
          ikke her.
        </p>
        <p className="fc-hint" style={{ marginBottom: 12 }}>
          En ændring rammer <b>hver bruger med rollen</b>: claims mintes om og
          tokens tilbagekaldes med det samme. Uden det ville den gamle adgang
          virke indtil tokenet udløb af sig selv — og det ser ud som om det
          lykkedes.
        </p>

        {redigerer && (
          <Rolleeditor
            rolle={redigerer}
            saetRolle={setRedigerer}
            roller={roller}
            rolleNode={rolleNode}
            egenRolle={bruger?.rolle || null}
            paaGemt={() => { genindlaesRoller(); genindlaesBrugere(); }}
          />
        )}
        <Tabel
          kolonner={[
            { key: "label", label: "Rolle", render: (r) => (
                <div className="fc-tolinje">
                  <b>{r.label}</b>
                  <span>{r.hvad}</span>
                </div>
              ) },
            { key: "antal", label: "Permissions", num: true,
              render: (r) => `${num(r.perms.length)} af ${num(ALLE_PERMS.length)}` },
            { key: "hvorfor", label: "Hvorfor", bredde: "38%",
              render: (r) => <span className="fc-hint">{r.hvorfor}</span> },
            { key: "egen", label: "Definition", render: (r) => (
                /* ⚠ 'Standard' er ikke det samme som 'redigeret til at ligne
                   standarden'. Har kunden gemt rollen, står den som jeres —
                   også hvis indholdet er det samme. Forskellen betyder noget
                   den dag vi ændrer en standard: en gemt rolle følger ikke
                   med. */
                r.egen
                  ? <Pille tone="info">Jeres</Pille>
                  : <span className="fc-neutral">Standard</span>
              ) },
            { key: "din", label: "", render: (r) => (
                r.id === bruger?.rolle ? <Pille tone="ok">Din rolle</Pille> : null
              ) },
          ]}
          raekker={roller}
          noegle={(r) => r.id}
          tom="Ingen roller i kataloget."
        />
      </Kort>

      <Kort titel="Hvad de enkelte roller kan se og gøre">
        <p className="fc-hint" style={{ marginBottom: 12 }}>
          De ni rettigheder hvor rollerne <b>faktisk</b> adskiller sig. En matrix med
          alle {num(ALLE_PERMS.length)} kolonner kan ikke læses, og en matrix man
          ikke kan læse, bliver ikke læst — resten har enten alle roller eller kun
          administratoren, og det står i kolonnen ovenfor.
        </p>
        <Tabel
          kolonner={[
            { key: "label", label: "Kan", bredde: "26%", render: (r) => <b>{r.label}</b> },
            ...ALLE_ROLLER.map((rolle) => ({
              key: rolle,
              label: ROLLE_LABEL[rolle]?.label || rolle,
              midt: true,
              render: (r) => (
                rolleHarPerm(rolle, r.perm)
                  ? <span className="fc-good" title="Ja">●</span>
                  /* Tom frem for et kryds: fraværet af en rettighed er det
                     normale, og et rødt kryds ville læse som en fejl. */
                  : <span className="fc-neutral" title="Nej">–</span>
              )
            })),
          ]}
          raekker={MATRIX}
          noegle={(r) => r.perm}
          tom="Ingen rettigheder at sammenligne."
        />
        <p className="fc-hint" style={{ marginTop: 12 }}>
          To rækker er værd at læse sammen: <b>disponenten</b> må foreslå men ikke
          godkende (beslutning 5 — man godkender ikke sit eget forslag), og{" "}
          <b>koordinatoren</b> er den eneste driftsrolle der ser godsets værdi:
          den der godkender, skal kunne se hvad der står på spil.
        </p>
        <p className="fc-hint" style={{ marginTop: 8 }}>
          Ingen driftsrolle ser <b>fraværsårsagen</b>. Disponeringen har brug for at
          vide at nogen er utilgængelig — ikke hvorfor. Sygdom er en
          helbredsoplysning (GDPR art. 9), og den ligger i{" "}
          <code>sensitive/fravaer</code>, en søskendenode med sin egen læseregel.
        </p>
      </Kort>

      <Gitter kolonner="repeat(auto-fit, minmax(300px, 1fr))">
        <Kort titel="Dit token">
          <MiniLinje label="Tenant" vaerdi={<code>{tenantId}</code>} />
          <MiniLinje label="Virksomhed" vaerdi={tenant?.navn || "—"} />
          <MiniLinje label="Rolle" vaerdi={ROLLE_LABEL[bruger?.rolle]?.label || bruger?.rolle || "—"} />
          <MiniLinje label="E-mail" vaerdi={bruger?.email || "—"} />
          <MiniLinje label="Permissions" vaerdi={num(mineP.length)} />
          <p className="fc-hint" style={{ marginTop: 10 }}>
            ⚠ <b>Perms kommer fra tokenets claims.</b> En klient kan ikke ændre sit
            eget token, og derfor kan intet på denne skærm ændre hvad nogen{" "}
            <b>må</b> — kun hvad brugerfladen tegner. Det er ikke et forbud der
            gælder i produktion; det er en <b>umulighed</b> der gælder overalt hvor
            der er en server. Beslutning 28.
          </p>
          <p className="fc-hint" style={{ marginTop: 8 }}>
            I dev skifter man <b>session</b>, ikke visning: brugervælgeren logger ud
            og ind som en anden seedet DEV-bruger, så adgangen skifter fordi{" "}
            <b>tokenet</b> skifter.
          </p>
        </Kort>

        <Kort titel="Dine permissions">
          {!mineP.length ? (
            <Tom>Dit token har ingen permissions. Serveren afviser alt.</Tom>
          ) : (
            <ul className="fc-permliste">
              {ALLE_PERMS.filter((p) => harPerm(mineP, p)).map((p) => (
                <li key={p}><code>{p}</code></li>
              ))}
            </ul>
          )}
          <p className="fc-hint" style={{ marginTop: 10 }}>
            Listen er hvad <b>serveren</b> vil acceptere fra dig — ikke hvad
            brugerfladen viser. Hver permission svarer til en <code>.write</code>
            {" "}eller <code>.read</code> i <code>firebase.rules.json</code>. En
            kontrol der kun findes i frontend, er ikke adgangskontrol.
          </p>
        </Kort>

        <Kort titel="Det der ikke er besvaret endnu">
          <p className="fc-hint">
            To af de tre åbne spørgsmål i projektets spørgsmålsliste står stadig
            åbne, og begge handler om <b>at skrive</b>:
          </p>
          <ul className="fc-liste">
            <li>Hvordan inviteres en ny bruger — mail med link, eller opretter I den?</li>
            <li>Hvem spærrer loginnet når en medarbejder holder op?</li>
          </ul>
          <p className="fc-hint" style={{ marginTop: 10 }}>
            Det tredje — <b>kan en kunde ændre en rolles indhold</b> — er besvaret:
            nej. Se beslutning 31. Svaret var i øvrigt allerede håndhævet i
            reglerne, det var bare ikke skrevet ned.
          </p>
          <p className="fc-hint" style={{ marginTop: 8 }}>
            Det sidste ligger fast uanset svar: <b>personen slettes aldrig</b>. Der
            hænger reservationer, indberetninger og bookinger på{" "}
            <code>personId</code>, og reglerne afviser en sletning med{" "}
            <code>newData.exists()</code>. Kun loginnet spærres — se{" "}
            <Link className="fc-a" to="/opsaetning/medarbejdere">Medarbejdere</Link>.
          </p>
        </Kort>
      </Gitter>
    </div>
  );
}

/* ---- Rolleeditoren ---------------------------------------------------- */

/**
 * Sæt hvad en rolle indeholder. BESLUTNING 31b.
 *
 * ⚠ SPÆRRINGEN VISES FØR MAN TRYKKER, IKKE BAGEFTER.
 * laaserUde() er den SAMME funktion serveren afviser med — den ligger i
 * permissions.js, som står i DELTE_FILER. Skærmen svarer hurtigt; serveren
 * afgør. Fandtes kontrollen kun her, var den en pæn knap, og den pæne knap
 * ville koste kunden adgangen til sit eget system.
 *
 * ⚠ OG DEN FORKLARER HVORFOR. En grå knap uden en sætning er en gåde: man
 * ved ikke om man mangler en rettighed, om noget er i stykker, eller om det
 * man prøver på er forbudt med vilje.
 */
function Rolleeditor({ rolle, saetRolle, roller, rolleNode, egenRolle, paaGemt }) {
  const valgt = roller.find((r) => r.id === rolle) || roller[0];
  /* ⚠ NULSTILLES NÅR MAN SKIFTER ROLLE. Uden nøglen ville afkrydsningerne
     fra den forrige rolle blive stående, og man ville gemme disponentens
     permissions på koordinatoren. Se React-nøglen på komponenten. */
  const [valgteP, saetValgteP] = useState(() => new Set(valgt.perms));
  const [gemmer, saetGemmer] = useState(false);
  const [svar, saetSvar] = useState(null);

  const perms = ALLE_PERMS.filter((x) => valgteP.has(x));
  const form = valideRolleperms(perms);
  /* Den samme sætning serveren ville afvise med. */
  const spaerring = laaserUde(valgt.id, perms, rolleNode, { egenRolle });

  /* ⚠ ÆNDRET I FORHOLD TIL HVAD DER GÆLDER NU, ikke til standarden. Ellers
     ville en rolle kunden allerede har redigeret, altid se ændret ud. */
  const aendret = perms.length !== valgt.perms.length
    || perms.some((x) => !valgt.perms.includes(x));

  const skift = (perm) => {
    saetValgteP((s) => {
      const ny = new Set(s);
      if (ny.has(perm)) ny.delete(perm); else ny.add(perm);
      return ny;
    });
    saetSvar(null);
  };

  const gem = async () => {
    saetGemmer(true);
    saetSvar(null);
    const r = await skrivRolle({ rolle: valgt.id, perms });
    saetGemmer(false);
    saetSvar(r);
    if (r.ok) paaGemt();
  };

  return (
    <div className="fc-rolleeditor">
      <Feltraekke>
        <Felt id="re-rolle" label="Rolle" kraevet vaerdi={valgt.id}
              saet={(v) => saetRolle(v)}
              hint="Navnene er faste. En ottende rolle er en ændring i koden."
              valgmuligheder={roller.map((r) => ({
                vaerdi: r.id,
                label: `${r.label}${r.egen ? " (jeres)" : ""}`,
              }))} />
      </Feltraekke>

      {/* ⚠ SPÆRRINGEN STÅR OVER KNAPPEN, ikke under den. Man skal kunne se
          hvorfor der ikke kan gemmes, mens man kigger på det man har rørt. */}
      {spaerring && (
        <p className="fc-svar fc-svar-naegtet" role="alert">{spaerring}</p>
      )}
      {!form.ok && (
        <p className="fc-svar fc-svar-fejl" role="alert">{form.fejl}</p>
      )}

      <div className="fc-permgitter">
        {ALLE_PERMS.map((perm) => {
          const paa = valgteP.has(perm);
          const iStandard = valgt.standard.includes(perm);
          return (
            <label key={perm} className="fc-perm">
              <input type="checkbox" checked={paa} onChange={() => skift(perm)} />
              <code>{perm}</code>
              {/* ⚠ HVAD STANDARDEN SIGER, ved siden af hvad I har valgt.
                  Uden den kan man ikke se om man er ved at fjerne noget
                  rollen plejede at have — og det er netop dét man vil vide
                  når man strammer op. */}
              {iStandard !== paa && (
                <Pille tone={paa ? "ok" : "warn"}>
                  {paa ? "tilføjet" : "fjernet"}
                </Pille>
              )}
              {perm === NOEGLEPERM && <Pille tone="bad">nøgle</Pille>}
            </label>
          );
        })}
      </div>

      <Raekke style={{ marginTop: 14 }}>
        <span className="fc-hint">
          {num(perms.length)} af {num(ALLE_PERMS.length)} permissions
          {aendret ? " · ikke gemt" : ""}
        </span>
        <span style={{ display: "flex", gap: 8 }}>
          <Knap onClick={() => saetValgteP(new Set(valgt.standard))}>
            Sæt til standard
          </Knap>
          <Knap variant="primaer" onClick={gem}
                disabled={gemmer || !aendret || !form.ok || Boolean(spaerring)}>
            {gemmer ? "Gemmer …" : "Gem rollen"}
          </Knap>
        </span>
      </Raekke>

      <Formularsvar svar={svar} />

      {/* ⚠ HVOR MANGE DER IKKE BLEV FORNYET. En ændring der lykkedes for otte
          ud af ni, er ikke en ændring der lykkedes — den niende går rundt med
          sin gamle adgang, og det ser ud som om det gik godt. */}
      {svar?.ok && svar.data && (
        <p className="fc-hint" style={{ marginTop: 8 }}>
          {num(svar.data.fornyet)} af {num(svar.data.ramte)} brugere fik
          fornyet deres adgang med det samme.
          {svar.data.fejlede?.length > 0 && (
            <> ⚠ <b>{num(svar.data.fejlede.length)} fejlede</b> og har stadig
            deres gamle adgang. Gem rollen igen.</>
          )}
        </p>
      )}

      <p className="fc-hint" style={{ marginTop: 10 }}>
        Ændringen skrives af <b>rolleskriv</b> på serveren, som minter claims
        om og tilbagekalder tokens. <code>roller/</code> er{" "}
        <b>.write: false</b> — noden er en <b>kilde</b>, ikke et
        håndhævelsespunkt: reglerne læser den aldrig, og adgang afgøres
        udelukkende af tokenet. Se beslutning 31b.
      </p>
    </div>
  );
}

/* ---- Hvilke dashboards en bruger får vist ------------------------------ */

/**
 * ⚠ DET ER EN VISNING, IKKE EN ADGANG — OG SKÆRMEN SIGER DET.
 *
 * Mockuppen kalder den "Dashboardadgange" og sætter en krone ved "ekstra
 * adgang". Det ville være et løfte platformen ikke kan holde: `kpi/` er
 * læsbar for ENHVER indlogget bruger i tenanten — ingen permission, ingen
 * modulklausul. En bruger der "nægtes" Warehouse-dashboardet, kan stadig
 * læse kpi/<division>/warehouse direkte.
 *
 * Kaldte vi det en adgang, ville nogen slå Økonomi fra for en chauffør og TRO
 * at tallene var utilgængelige for ham. Det er den værste slags kontrol: den
 * ser ud som om den virker.
 *
 * Vil man have den rigtige spærring, er det `kpi/` der skal deles op pr.
 * domæne. Det er en selvstændig ændring — se dashboardvisning.js.
 */
function Visningspanel({ uid, navn, visning, harModulFn, paaLuk, paaGemt }) {
  /* ⚠ ET FELT DER IKKE ER SAT, ER VIST. Kun et eksplicit false skjuler —
     ellers ville et nyt modul være usynligt for hver bruger der havde en
     indstilling fra før modulet fandtes. */
  const [valgt, saetValgt] = useState(() => {
    const ud = {};
    for (const d of DASHBOARDS) ud[d.key] = visning?.[d.key] !== false;
    return ud;
  });
  const [gemmer, saetGemmer] = useState(false);
  const [svar, saetSvar] = useState(null);

  /* Kun de dashboards kunden overhovedet har. Et fravalgt modul har allerede
     skjult sit dashboard, og en afkrydsning for noget kunden ikke har købt,
     ville se ud som et valg der betød noget. */
  const kanVaelges = DASHBOARDS.filter((d) => d.altid || harModulFn(d.key));

  const somNode = Object.fromEntries(kanVaelges.map((d) => [d.key, valgt[d.key]]));
  /* Den SAMME funktion serveren afviser med. */
  const spaerring = skjulerAlt(somNode, harModulFn);

  const gem = async () => {
    saetGemmer(true);
    saetSvar(null);
    const r = await skrivDashboardvisning({ uid, visning: somNode });
    saetGemmer(false);
    saetSvar(r);
    if (r.ok) paaGemt();
  };

  return (
    <div className="fc-rolleeditor" style={{ marginTop: 16 }}>
      <Raekke>
        <b>Dashboards for {navn}</b>
        <Knap onClick={paaLuk}>Luk</Knap>
      </Raekke>

      <p className="fc-hint" style={{ marginTop: 8 }}>
        ⚠ <b>Det er en visning, ikke en adgang.</b> Nøgletallene ligger i{" "}
        <code>kpi/</code>, som <b>enhver</b> indlogget bruger i virksomheden kan
        læse — der er hverken permission eller modulspærring på den. En
        afkrydsning her <b>skjuler</b> et dashboard; den spærrer det ikke.
      </p>
      <p className="fc-hint" style={{ marginTop: 6 }}>
        Skal tallene være utilgængelige, er det <code>kpi/</code> der skal
        deles op pr. modul med en permission på hver. Det er en selvstændig
        ændring, og den er ikke lavet.
      </p>

      {spaerring && (
        <p className="fc-svar fc-svar-naegtet" role="alert">{spaerring}</p>
      )}

      <div className="fc-permgitter" style={{ maxHeight: "none" }}>
        {kanVaelges.map((d) => (
          <label key={d.key} className="fc-perm">
            <input type="checkbox" checked={valgt[d.key]}
                   onChange={() => {
                     saetValgt((v) => ({ ...v, [d.key]: !v[d.key] }));
                     saetSvar(null);
                   }} />
            <span>
              <b>{d.label}</b>
              <span className="fc-hint" style={{ display: "block" }}>{d.under}</span>
            </span>
            {/* ⚠ SAMLET KAN GIVES UDEN MODULERNE — og det er hele pointen med
                den. En bogholder skal kunne se overblikket uden at have Fleet,
                Warehouse og Facility hver for sig. */}
            {d.key === SAMLET_NOEGLE && <Pille tone="info">på tværs</Pille>}
          </label>
        ))}
      </div>

      <Raekke style={{ marginTop: 14 }}>
        <span className="fc-hint">
          {num(kanVaelges.filter((d) => valgt[d.key]).length)} af
          {" "}{num(kanVaelges.length)} vises
        </span>
        <Knap variant="primaer" onClick={gem}
              disabled={gemmer || Boolean(spaerring)}>
          {gemmer ? "Gemmer …" : "Gem"}
        </Knap>
      </Raekke>

      <Formularsvar svar={svar} />
    </div>
  );
}
