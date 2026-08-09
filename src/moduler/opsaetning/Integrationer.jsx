/* src/moduler/opsaetning/Integrationer.jsx
 * Opsætning – integrationer
 *
 * BESLUTNING 22: kun det der findes, med rigtig status. Ingen "coming soon".
 *
 * Der er ingen integrationer bygget, så skærmen siger det. Den viser hverken
 * logoer for HERE, DKV og e-conomic med "kommer snart", eller felter til
 * API-nøgler til noget der ikke aflæses.
 *
 * ⚠ HVORFOR IKKE ET VEJKORT HER.
 * En liste over kommende integrationer læses som partnerskaber der findes, og
 * den koster troværdighed præcis hos den kunde der spørger hvad platformen
 * KAN — ikke hvad den vil kunne. Et nøglefelt til en integration der ikke
 * findes, er den samme fejl: en kontrol der ser ud som om den virker.
 *
 * Vejkortet findes stadig. Det står i README og i FleetControl-spoergsmaal.md,
 * hvor det kan bære forbehold uden at ligne et løfte.
 *
 * Når den første integration bygges, kommer den i INTEGRATIONER med de felter
 * der faktisk kan aflæses — sidste synkronisering, fejl, hvem der forbandt den.
 */
import { Kort, Tom, KpiKort, KpiRaekke, Pille, Tabel } from "../../fleet/ui.jsx";
import { num, datoTid } from "../../fleet/format.js";
import { INTEGRATIONER, INTEGRATION_STATUS, antalIDrift } from "../../fleet/integrationer.js";

export default function Integrationer() {
  return (
    <div className="fc-grid" style={{ gap: 16 }}>
      <KpiRaekke>
        <KpiKort label="Integrationer i drift" vaerdi={num(antalIDrift())} />
        <KpiKort label="Forbundet, ikke i drift"
                 vaerdi={num(INTEGRATIONER.filter((i) => i.status !== "idrift").length)} />
      </KpiRaekke>

      <Kort titel="Forbundne systemer">
        {INTEGRATIONER.length === 0 ? (
          <Tom>
            Der er ingen integrationer forbundet. FleetControl taler ikke med
            nogen fremmede systemer endnu.
          </Tom>
        ) : (
          <Tabel
            kolonner={[
              { key: "navn", label: "System", render: (r) => <b>{r.navn}</b> },
              { key: "kategori", label: "Område" },
              { key: "status", label: "Status", render: (r) => (
                  <Pille tone={INTEGRATION_STATUS[r.status]?.pill}>
                    {INTEGRATION_STATUS[r.status]?.label}
                  </Pille>) },
              { key: "sidsteSynkMs", label: "Sidst synkroniseret",
                render: (r) => (r.sidsteSynkMs ? datoTid(r.sidsteSynkMs) : "—") },
              { key: "forbundetAf", label: "Forbundet af" },
              { key: "sidsteFejl", label: "Sidste fejl",
                render: (r) => r.sidsteFejl || <span className="fc-neutral">ingen</span> },
            ]}
            raekker={INTEGRATIONER}
          />
        )}
      </Kort>

      <Kort titel="Hvorfor der ikke står mere her">
        <p className="fc-hint">
          Siden viser <b>kun det der findes</b>. Der er bevidst ingen liste med
          logoer og "kommer snart", og ingen felter til API-nøgler til systemer
          der ikke aflæses.
        </p>
        <p className="fc-hint" style={{ marginTop: 8 }}>
          Begge dele læses som noget der er der og bare mangler et klik — og de
          koster troværdighed præcis hos den kunde der spørger hvad platformen{" "}
          <b>kan</b>, ikke hvad den vil kunne. Den samme kunde tror til gengæld på
          svaret, når vi siger at noget virker.
        </p>
        <p className="fc-hint" style={{ marginTop: 8 }}>
          Planerne findes — de står i projektets dokumentation, hvor de kan bære
          forbehold og åbne spørgsmål uden at ligne et tilsagn.
        </p>
      </Kort>
    </div>
  );
}
