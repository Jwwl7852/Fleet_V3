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
 * ⚠ EN KLIENT KAN IKKE LISTE BRUGERE. Firebase Auth har ingen listUsers på
 * klientsiden — det kræver Admin SDK, altså en Cloud Function. Skærmen kan
 * derfor vise ROLLERNE (som er rigtige og ligger i kataloget) og hvem der er
 * logget ind lige nu, men ikke en brugerliste.
 *
 * Det er ikke en mangel der skal fyldes ud med noget der ligner. En opdigtet
 * brugerliste er værre end ingen: den ville vise konti der ikke findes, og
 * skjule dem der gør.
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
import { Link } from "react-router-dom";
import { useFleet } from "../../fleet/FleetContext.jsx";
import {
  ALLE_ROLLER, ROLLE_LABEL, ROLLE_PERMS, ALLE_PERMS, PERM,
  permsFraRolle, rolleHarPerm, harPerm,
} from "../../fleet/permissions.js";
import { num } from "../../fleet/format.js";
import {
  Kort, Tabel, Pille, Gitter, MiniLinje, Knap, Tom, KpiKort, KpiRaekke, Ikon,
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

export default function Brugere() {
  const { bruger, tenantId, tenant } = useFleet();
  const mineP = bruger?.perms || [];

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
        <KpiKort label="Medarbejdere uden login" vaerdi="Bemanding"
                 ikon={<Ikon navn="bygning" />} tone="ikon-2" rund
                 note="personId, ikke uid" til="/bemanding/medarbejdere" />
      </KpiRaekke>

      <Kort titel="Der er ingen brugerliste her — og det er ikke en mangel">
        <p className="fc-hint">
          <b>En klient kan ikke liste brugere.</b> Firebase Auth har ingen{" "}
          <code>listUsers</code> på klientsiden; det kræver Admin SDK, altså en
          Cloud Function. Skærmen kan derfor vise <b>rollerne</b> — som er rigtige
          og ligger i kataloget — men ikke hvem der har dem.
        </p>
        <p className="fc-hint" style={{ marginTop: 8 }}>
          En opdigtet brugerliste ville være værre end ingen: den ville vise konti
          der ikke findes, og skjule dem der gør. Indtil funktionen er skrevet,
          administreres konti i Firebase-konsollen — og i dev med{" "}
          <code>npm run provisioner:dev</code>, som opretter én bruger pr. rolle
          med rigtige claims.
        </p>
        <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
          <Knap disabled title="Kræver en Cloud Function med Admin SDK — en klient kan ikke oprette brugere.">
            Inviter bruger
          </Knap>
          <Knap disabled title="Kræver en Cloud Function: rolleskift skal kalde revokeRefreshTokens, ellers beholder brugeren sin gamle adgang indtil tokenet udløber.">
            Skift rolle
          </Knap>
          <Knap disabled title="Kræver en Cloud Function. Personen skal blive stående — kun loginnet spærres.">
            Spær login
          </Knap>
        </div>
        <p className="fc-hint" style={{ marginTop: 10 }}>
          ⚠ <b>Et rolleskift er ikke færdigt før tokenet er fornyet.</b> Uden{" "}
          <code>revokeRefreshTokens</code> beholder brugeren sin gamle adgang indtil
          tokenet udløber af sig selv — og så er nedgraderingen en pæn knap frem for
          en spærring.
        </p>
      </Kort>

      <Kort titel="Rollerne">
        <p className="fc-hint" style={{ marginBottom: 12 }}>
          ⚠ <b>Rollerne er faste.</b> Man tildeler dem — man ændrer dem ikke.{" "}
          <code>tenants/&lt;id&gt;/roller</code> er <b>.write: false</b> i reglerne,
          så det er ikke en konvention men en spærring. Beslutning 31: en vognmand
          der fjernede <code>booking.godkend</code> fra sin egen adminrolle, havde
          lukket sig selv ude af sit eget system.
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
