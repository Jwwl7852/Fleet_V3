import { readFileSync, writeFileSync } from "node:fs";
const P = "src/moduler/udbyder/Prisliste.jsx";
let s = readFileSync(P, "utf8");
const F = (a, b) => { if (!s.includes(a)) throw new Error("fandt ikke: " + a.slice(0,70)); s = s.split(a).join(b); };

F(`  const [kunder, saetKunder] = useState([]);`,
  `  const [kunder, saetKunder] = useState([]);
  /* Hvilken kundes grundlag der er slaaet op. ⚠ ÉT AD GANGEN — en samlet
     oversigt over alle kunders linjer er ikke en faktura, og det er en
     faktura der skal kunne laegges sammen i haanden. */
  const [aabenKunde, saetAabenKunde] = useState(null);`);

/* Knappen i raekken: "Gør op" naar der ikke er noget, ellers "Vis". */
F(`                { key: "handling", label: "", render: (r) => (
                    <span className="fc-ikke-print">
                      {r.g ? (
                        <span className="fc-hint">{datoTid(r.g.genereretMs)}</span>
                      ) : (
                        <Knap disabled={arbejder || !periodeSlut}
                              onClick={() => kald(() => opretGrundlag({ periode, id: r.id }))}>
                          Gør op
                        </Knap>
                      )}
                    </span>
                  ) },`,
`                { key: "handling", label: "", render: (r) => (
                    <span className="fc-med-ikon fc-ikke-print" style={{ gap: 6 }}>
                      {r.g ? (
                        <Knap onClick={() => saetAabenKunde(aabenKunde === r.id ? null : r.id)}>
                          {aabenKunde === r.id ? "Luk" : "Vis grundlag"}
                        </Knap>
                      ) : (
                        <Knap disabled={arbejder || !periodeSlut}
                              onClick={() => kald(() => opretGrundlag({ periode, id: r.id }))}>
                          Gør op
                        </Knap>
                      )}
                    </span>
                  ) },`);

/* Selve fakturakortet, efter kundetabellen. */
F(`              raekker={kunder.map((k) => ({ ...k, g: grundlag[periode]?.[k.id] || null }))}
              tom="Ingen kunder."
            />
          </>
        )}
      </Kort>`,
`              raekker={kunder.map((k) => ({ ...k, g: grundlag[periode]?.[k.id] || null }))}
              tom="Ingen kunder."
            />
          </>
        )}
      </Kort>

      {aabenKunde && grundlag[periode]?.[aabenKunde] && (
        <Kort
          titel={\`Fakturagrundlag \${periode} — \${
            kunder.find((k) => k.id === aabenKunde)?.navn || aabenKunde}\`}
          handling={
            <span className="fc-med-ikon fc-ikke-print" style={{ gap: 8 }}>
              <Knap onClick={() => hent(
                      grundlagCsv(periode, [grundlag[periode][aabenKunde]]),
                      filnavn(\`fakturagrundlag-\${aabenKunde}-\${periode}\`,
                              grundlag[periode][aabenKunde].genereretMs))}>
                Hent som Excel
              </Knap>
              <Knap onClick={() => window.print()}>Print</Knap>
            </span>
          }
        >
          <Faktura kunde={kunder.find((k) => k.id === aabenKunde)}
                   periode={periode} g={grundlag[periode][aabenKunde]} />
        </Kort>
      )}`);

writeFileSync(P, s, "utf8");
console.log("fakturaen kan aabnes pr. kunde");
