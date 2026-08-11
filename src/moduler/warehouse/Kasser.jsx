/* src/moduler/warehouse/Kasser.jsx
 * Warehouse – kasser.
 *
 * ⚠ EN UDLÅNT KASSE OPTAGER IKKE EN REOLPLADS. Prototypen skrev "Udlånt hos
 * kunde" SOM PLADS. Så kunne ledige hylder ikke tælles, og en plads var
 * optaget af en kasse der fysisk stod i Paris. Her er det en TILSTAND, og
 * `pladsId` er fraværende — formularen skjuler feltet og reglerne afviser det.
 *
 * ⚠ HJEMPLADS OG NUVÆRENDE PLADS ER TO TING. Hvor kassen HØRER TIL, og hvor
 * den STÅR. De er ens det meste af tiden, og netop derfor skal de være to
 * felter: den dag en kasse er sat på en anden hylde, er forskellen det eneste
 * der kan finde den igen.
 *
 * ⚠ EN KASSE SLETTES ALDRIG. Der hænger udlånshistorik på id'et. En kasse der
 * går i stykker, får status `udeAfDrift` og bliver stående — samme regel som
 * en solgt bil (beslutning 18). Der er ingen slet-knap.
 */
import { useState } from "react";
import { useListe } from "../../fleet/useListe.js";
import { useFleet } from "../../fleet/FleetContext.jsx";
import { num } from "../../fleet/format.js";
import { harPerm, PERM } from "../../fleet/permissions.js";
import {
  Kort, Tabel, Pille, Knap, Felt, Feltraekke, Formular, Formularsvar,
  Henter, Datatilstand, Tom, Ikon, Sider, KpiKort, KpiRaekke,
} from "../../fleet/ui.jsx";
import {
  KASSE_STATUS, ALLE_KASSE_STATUS, kraeverPlads, valideKasse, pladsnavn,
} from "../../fleet/warehouse.js";
import { gem, nyId } from "../../fleet/skriv.js";
import { AUDIT } from "../../fleet/audit.js";
import {
  DEMO_KASSER, DEMO_REOLPLADSER, DEMO_KASSETYPER,
} from "../../fleet/demo-warehouse.js";

const PR_SIDE = 12;

const tomKasse = () => ({ id: "", type: "", status: "ledig", hjemPladsId: "", pladsId: "", note: "" });

function Kasseformular({ kasse, typer, pladser, sti, paaGemt, paaLuk }) {
  const nyt = !kasse;
  const [f, saetF] = useState(() => (kasse ? { ...tomKasse(), ...kasse } : tomKasse()));
  const [roert, saetRoert] = useState({});
  const [visAlle, saetVisAlle] = useState(false);
  const [gemmer, saetGemmer] = useState(false);
  const [svar, saetSvar] = useState(null);

  const saet = (felt) => (v) => {
    saetF((x) => {
      const ny = { ...x, [felt]: v };
      /* ⚠ SKIFTER STATUS TIL UDLÅNT, FORSVINDER PLADSEN. Ellers ville
         formularen sende et pladsId reglerne afviser — og brugeren skulle
         gætte hvorfor. */
      if (felt === "status" && !kraeverPlads(v)) ny.pladsId = "";
      /* Sættes den tilbage på lager uden en plads, foreslås hjempladsen: det
         er dér den hører til, og det er nitten gange ud af tyve rigtigt. */
      if (felt === "status" && kraeverPlads(v) && !ny.pladsId) ny.pladsId = ny.hjemPladsId;
      return ny;
    });
    saetRoert((x) => ({ ...x, [felt]: true }));
    saetSvar(null);
  };

  const ctx = { typer: typer.map((t) => t.id), pladser: pladser.map((p) => p.id) };
  const fejl = valideKasse({ ...f, pladsId: f.pladsId || null }, ctx);
  const vis = (felt) => (visAlle || roert[felt] ? fejl[felt] : null);
  const kanGemme = Object.keys(fejl).length === 0;
  const paaLager = kraeverPlads(f.status);

  const gemNu = async () => {
    saetVisAlle(true);
    if (!kanGemme) return;
    saetGemmer(true);
    const id = (kasse?.id || f.id).trim();
    const data = {
      type: f.type, status: f.status, hjemPladsId: f.hjemPladsId,
      pladsId: paaLager ? f.pladsId : null,
      note: f.note?.trim() || null,
    };
    const r = await gem({
      sti: sti(`kasser/${id}`), data, foer: kasse || null,
      objekt: "kasser", objektId: id,
      handling: nyt ? AUDIT.opret : AUDIT.aendre,
    });
    saetGemmer(false);
    saetSvar(r);
    if (r.ok) paaGemt();
  };

  const pladsvalg = pladser.map((p) => ({ vaerdi: p.id, label: pladsnavn(p) }));

  return (
    <Kort titel={nyt ? "Ny kasse" : `Redigér ${kasse.id}`}>
      <Formular onGem={gemNu} gemmer={gemmer} kanGemme={kanGemme}
                gemLabel={nyt ? "Opret kasse" : "Gem ændringer"}
                onAnnuller={paaLuk} svar={svar}>
        <Feltraekke>
          {/* ⚠ ID'ET ER KASSENS PÅSKRIFT og kan ikke ændres bagefter: der
              hænger udlån på det. */}
          <Felt id="k-id" label="Kasse-id" kraevet vaerdi={nyt ? f.id : kasse.id}
                saet={nyt ? saet("id") : undefined} readOnly={!nyt} fejl={vis("id")}
                hint={nyt ? "Står på kassen. Fx MDT-101." : "Kan ikke ændres — der hænger udlån på id'et."} />
          <Felt id="k-type" label="Type" kraevet vaerdi={f.type} saet={saet("type")}
                fejl={vis("type")}
                valgmuligheder={typer.map((t) => ({ vaerdi: t.id, label: `${t.id} · ${t.navn}` }))} />
          <Felt id="k-status" label="Status" kraevet vaerdi={f.status} saet={saet("status")}
                fejl={vis("status")}
                valgmuligheder={ALLE_KASSE_STATUS.map((s) => ({
                  vaerdi: s, label: KASSE_STATUS[s].label,
                }))} />
        </Feltraekke>

        <Feltraekke>
          <Felt id="k-hjem" label="Hjemplads" kraevet vaerdi={f.hjemPladsId}
                saet={saet("hjemPladsId")} fejl={vis("hjemPladsId")}
                valgmuligheder={pladsvalg}
                hint="Hvor kassen hører til. Den beholder den, også når den er ude." />
          {paaLager ? (
            <Felt id="k-plads" label="Står nu" kraevet vaerdi={f.pladsId}
                  saet={saet("pladsId")} fejl={vis("pladsId")}
                  valgmuligheder={pladsvalg}
                  hint="Hvor den står lige nu. Ofte den samme som hjempladsen." />
          ) : null}
        </Feltraekke>

        {!paaLager && (
          <p className="fc-hint">
            ⚠ En <b>{KASSE_STATUS[f.status]?.label.toLowerCase()}</b> kasse står
            ikke på en reolplads — den er ude. Hylden er fri til en anden kasse.
          </p>
        )}

        <Felt id="k-note" label="Note" vaerdi={f.note} saet={saet("note")}
              hint="Fx en skade. Kun til jer selv." />
      </Formular>
    </Kort>
  );
}

export default function Kasser() {
  const { path, bruger } = useFleet();
  const [ny, saetNy] = useState(false);
  const [redigerer, saetRedigerer] = useState(null);
  const [soeg, saetSoeg] = useState("");
  const [status, saetStatus] = useState("");
  const [type, saetType] = useState("");
  const [side, saetSide] = useState(1);

  const maaSkrive = harPerm(bruger?.perms, PERM.kasserSkriv);

  /* Ingen division på en kasse — den hører til en hal. Eksplicit, så det ikke
     ser ud som om skærmen bare var heldig. */
  const { data: kasser, tilstand, genindlaes, henter } = useListe("kasser", {
    division: "alle", graense: 1000, demo: DEMO_KASSER,
    sorter: (a, b) => a.id.localeCompare(b.id, "da"),
  });
  const { data: pladser } = useListe("reolpladser", {
    division: "alle", graense: 500, demo: DEMO_REOLPLADSER,
    sorter: (a, b) => pladsnavn(a).localeCompare(pladsnavn(b), "da"),
  });
  const { data: typer } = useListe("kassetyper", {
    division: "alle", graense: 100, demo: DEMO_KASSETYPER,
  });

  if (henter) return <Henter hvad="kasserne" />;

  const pladsMap = Object.fromEntries(pladser.map((p) => [p.id, p]));
  const typeMap = Object.fromEntries(typer.map((t) => [t.id, t]));

  const q = soeg.trim().toLowerCase();
  const viste = kasser.filter((k) =>
    (!status || k.status === status) &&
    (!type || k.type === type) &&
    (!q || k.id.toLowerCase().includes(q) ||
      pladsnavn(pladsMap[k.pladsId]).toLowerCase().includes(q)));

  /* Siden klippes til det der findes — ellers står man på side 4 af en liste
     der efter et filter kun har to. */
  const sider = Math.max(1, Math.ceil(viste.length / PR_SIDE));
  const nuSide = Math.min(side, sider);
  const paaSiden = viste.slice((nuSide - 1) * PR_SIDE, nuSide * PR_SIDE);

  const antal = (s) => kasser.filter((k) => k.status === s).length;
  /* ⚠ AFLEDT, IKKE FRA kpi/. Tallene regnes af de kasser skærmen allerede
     har — de er ikke et aggregat, og et gemt tal ville drive fra listen.
     Se undtagelsen i CLAUDE.md. */
  const paaLager = kasser.filter((k) => kraeverPlads(k.status)).length;

  return (
    <div className="fc-grid" style={{ gap: 16 }}>
      <KpiRaekke>
        <KpiKort label="Kasser i alt" vaerdi={num(kasser.length)}
                 ikon={<Ikon navn="kasse" />} tone="ikon-5" rund />
        <KpiKort label="Ledige" vaerdi={num(antal("ledig"))} note="klar til udlån" />
        <KpiKort label="Udlånt" vaerdi={num(antal("udlaant"))} note="ude hos kunde" />
        <KpiKort label="På lager" vaerdi={num(paaLager)}
                 note={`heraf ${num(antal("udeAfDrift"))} ude af drift`} />
      </KpiRaekke>

      <Datatilstand tilstand={tilstand} genprov={genindlaes} />

      {ny && (
        <Kasseformular typer={typer} pladser={pladser} sti={path}
                       paaLuk={() => saetNy(false)}
                       paaGemt={() => { saetNy(false); genindlaes(); }} />
      )}
      {redigerer && (
        <Kasseformular kasse={redigerer} typer={typer} pladser={pladser} sti={path}
                       paaLuk={() => saetRedigerer(null)}
                       paaGemt={() => { saetRedigerer(null); genindlaes(); }} />
      )}

      <Kort
        titel={`Kasser (${num(viste.length)} af ${num(kasser.length)})`}
        handling={
          <Knap variant="primaer" disabled={!maaSkrive || !typer.length || !pladser.length}
                onClick={() => saetNy(true)}
                title={!maaSkrive ? `Kræver ${PERM.kasserSkriv} — reglerne afviser.`
                  : !typer.length ? "Opret en kassetype først."
                  : !pladser.length ? "Opret en reolplads først."
                  : "Opret en kasse."}>
            Ny kasse
          </Knap>
        }
      >
        <div className="fc-filtre">
          <div className="fc-felt">
            <label htmlFor="kf-soeg">Søg</label>
            <input id="kf-soeg" type="search" value={soeg}
                   placeholder="Kasse-id eller plads"
                   onChange={(e) => { saetSoeg(e.target.value); saetSide(1); }} />
          </div>
          <div className="fc-felt">
            <label htmlFor="kf-status">Status</label>
            <select id="kf-status" value={status}
                    onChange={(e) => { saetStatus(e.target.value); saetSide(1); }}>
              <option value="">Alle statusser</option>
              {ALLE_KASSE_STATUS.map((v) => (
                <option key={v} value={v}>{KASSE_STATUS[v].label}</option>
              ))}
            </select>
          </div>
          <div className="fc-felt">
            <label htmlFor="kf-type">Type</label>
            <select id="kf-type" value={type}
                    onChange={(e) => { saetType(e.target.value); saetSide(1); }}>
              <option value="">Alle typer</option>
              {typer.map((t) => <option key={t.id} value={t.id}>{t.navn}</option>)}
            </select>
          </div>
        </div>

        {!typer.length || !pladser.length ? (
          <Tom>
            En kasse skal have en <b>type</b> og en <b>hjemplads</b>. Opret dem
            under Reolpladser først — ellers ville kassen pege på noget der ikke
            findes, og reglerne afviser den.
          </Tom>
        ) : (
          <>
            <Tabel
              kolonner={[
                { key: "id", label: "Kasse", render: (k) => <b>{k.id}</b> },
                { key: "type", label: "Type",
                  render: (k) => typeMap[k.type]?.navn || k.type },
                { key: "status", label: "Status", render: (k) => (
                    <Pille tone={KASSE_STATUS[k.status]?.pill || "info"}>
                      {KASSE_STATUS[k.status]?.label || k.status}
                    </Pille>
                  ) },
                /* ⚠ EN STREG, IKKE "Udlånt hos kunde". Kassen står ingen
                   steder — det er ikke en plads med et navn. */
                { key: "plads", label: "Står nu", render: (k) => (
                    k.pladsId ? pladsnavn(pladsMap[k.pladsId])
                              : <span className="fc-neutral">— ude</span>
                  ) },
                { key: "hjem", label: "Hjemplads", render: (k) => (
                    <span className="fc-hint">{pladsnavn(pladsMap[k.hjemPladsId])}</span>
                  ) },
                { key: "handling", label: "", render: (k) => (
                    <Knap disabled={!maaSkrive} onClick={() => saetRedigerer(k)}>Redigér</Knap>
                  ) },
              ]}
              raekker={paaSiden}
              tom="Ingen kasser matcher filteret."
            />
            <Sider side={nuSide} antal={viste.length} prSide={PR_SIDE} saet={saetSide} />
          </>
        )}

        <p className="fc-hint" style={{ marginTop: 10 }}>
          ⚠ <b>En kasse slettes aldrig.</b> Der hænger udlån på id'et. En kasse
          der går i stykker, får status <b>ude af drift</b> og bliver stående —
          samme regel som en solgt bil.
        </p>
      </Kort>
    </div>
  );
}
