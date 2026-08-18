/* src/moduler/opsaetning/Brugere.jsx
 * Brugere & roller
 *
 * ⚠ DER ER INGEN MOCKUP FOR DEN HER SKÆRM, og den er ikke bygget på gæt.
 * Alt hvad den viser, står allerede i permissions.js, dev-brugere.js og
 * firebase.rules.json. Den viser det — den opfinder det ikke.
 *
 * ---------------------------------------------------------------------------
 * DE TRE ÅBNE SPØRGSMÅL HANDLER ALLE OM AT SKRIVE
 *
 * FleetControl-spoergsmaal.md spørger: kan en kunde ændre en rolles indhold,
 * hvordan inviteres en bruger, og hvem spærrer et login. Ingen af dem blokerer
 * en LÆSESKÆRM, og skrivning er ikke bygget nogen steder. Det første er nu
 * besvaret — se beslutning 31 — og svaret var allerede håndhævet:
 * `roller/` er `.write: false` i reglerne.
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
 * token, og derfor kan intet på denne skærm ændre hvad nogen MÅ. Skal en
 * bruger have anden adgang, ændres rollen server-side og claim'et fornys —
 * med revokeRefreshTokens, ellers beholder brugeren sin gamle adgang indtil
 * tokenet udløber af sig selv.
 *
 * MEDARBEJDERE UDEN LOGIN hører under Bemanding → Medarbejdere. `personId` er
 * hvem noget HANDLER om; `uid` er hvem der GJORDE noget (beslutning 18). En
 * chauffør har måske aldrig et login.
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { useListe } from "../../fleet/useListe.js";
import {
  opretBruger, skiftRolle, spaerLogin, nytLoesen, valideNyBruger, BRUGERSVAR,
} from "../../fleet/brugere.js";
import { useFleet } from "../../fleet/FleetContext.jsx";
import {
  ALLE_ROLLER, ROLLE_LABEL, ROLLE_PERMS, ALLE_PERMS, PERM,
  permsFraRolle, rolleHarPerm, harPerm,
} from "../../fleet/permissions.js";
import { num } from "../../fleet/format.js";
import {
  Kort, Tabel, Pille, Gitter, MiniLinje, Knap, Tom, KpiKort, KpiRaekke, Ikon,
  Datatilstand, Felt, Feltraekke, Formular, Formularsvar,
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
                  vaerdi: r, label: ROLLE_LABEL[r]?.label || r,
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
  const { bruger, tenantId, tenant } = useFleet();
  const mineP = bruger?.perms || [];
  const maaAdministrere = harPerm(mineP, PERM.brugereSkriv);

  const [opretter, setOpretter] = useState(false);
  const [nyKode, setNyKode] = useState("");
  const [vistKode, setVistKode] = useState("");
  /* uid'et på den række der er en handling i gang på — så knappen kan
     deaktiveres uden at hele tabellen fryser. */
  const [arbejder, setArbejder] = useState(null);
  const [svar, setSvar] = useState(null);

  /* Brugerindekset. ⚠ IKKE Auth — se noten på kortet. */
  const {
    data: brugere, tilstand: brugerTilstand, genindlaes: genindlaesBrugere,
  } = useListe("brugere", {
    graense: 200,
    /* Ingen division: et login hører til en virksomhed, ikke en afdeling. */
    division: "alle",
    sorter: (a, b) => (a.navn || "").localeCompare(b.navn || "", "da"),
    demo: [],
  });

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

  const roller = ALLE_ROLLER.map((r) => ({
    id: r,
    ...ROLLE_LABEL[r],
    perms: permsFraRolle(r),
  }));

  return (
    <div className="fc-grid" style={{ gap: 16 }}>
      <KpiRaekke>
        <KpiKort label="Roller" vaerdi={num(ALLE_ROLLER.length)}
                 ikon={<Ikon navn="skjold" />} tone="ikon-5" rund
                 note="faste — kan ikke redigeres" />
        <KpiKort label="Permissions i kataloget" vaerdi={num(ALLE_PERMS.length)}
                 ikon={<Ikon navn="dokument" />} tone="ikon-4" rund
                 note="hver svarer til en regel" />
        <KpiKort label="Din rolle" vaerdi={ROLLE_LABEL[bruger?.rolle]?.label || bruger?.rolle || "—"}
                 ikon={<Ikon navn="personer" />} tone="ikon-6" rund
                 note={`${num(mineP.length)} permissions i dit token`} />
        <KpiKort label="Medarbejdere uden login" vaerdi="Workforce"
                 ikon={<Ikon navn="bygning" />} tone="ikon-2" rund
                 note="personId, ikke uid" til="/bemanding/medarbejdere" />
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
          <Link className="fc-a" to="/bemanding/medarbejdere">Medarbejdere</Link> —
          der hænger indberetninger og reservationer på hende, og en post fra
          sidste år skal stadig kunne opløses til et navn.
        </p>
      </Kort>

      <Kort titel="Rollerne">
        <p className="fc-hint" style={{ marginBottom: 12 }}>
          ⚠ <b>Rollerne er faste.</b> Man tildeler dem — man ændrer dem ikke.
          Der er ingen node at ændre dem i: <code>tenants/&lt;id&gt;/roller</code> lå
          tom og <code>.write: false</code> i månedsvis og er nu <b>fjernet</b>.
          Rollens indhold kommer fra <code>ROLLE_PERMS</code> i koden, og claim&#39;et
          er det ene håndhævelsespunkt. Beslutning 31: en vognmand der fjernede{" "}
          <code>booking.godkend</code> fra sin egen adminrolle, havde lukket sig
          selv ude af sit eget system — og adgangen til at rette det var selv en
          permission.
        </p>
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
            { key: "hvorfor", label: "Hvorfor ikke mere", bredde: "46%",
              render: (r) => <span className="fc-hint">{r.hvorfor}</span> },
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
              ),
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
            <Link className="fc-a" to="/bemanding/medarbejdere">Medarbejdere</Link>.
          </p>
        </Kort>
      </Gitter>
    </div>
  );
}
