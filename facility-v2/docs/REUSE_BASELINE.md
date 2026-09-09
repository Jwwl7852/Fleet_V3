# FACILITY v2 – dokumenteret genbrugsgrundlag

Dato for fastlåsning: 8. september 2026.

## Git-kilde

- Repository: `C:\Users\DennisChristensen\Documents\GitHub\Fleet_V3-facility-v2`
- Kildebranch ved oprettelse: `codex/fleet-v2-development`
- Godkendt base-commit: `e9be941dd6ffd1d63f88cd4526988523a343761f`
- Committekst: `checkpoint: secure FLEET v2 through stage 2`
- FACILITY-branch: `codex/facility-v2-development`

Worktree og branch blev oprettet direkte fra commitobjektet. Ucommittede filer
fra det aktive FLEET-worktree indgår ikke.

## Verificerede kildefiler

| Fil i base-commit | SHA-256 | Brug i FACILITY |
|---|---|---|
| `fleet-v2/src/assets/veyro/veyro-systems-logo.png` | `3F0A45DEDA4188828A835856E8F5BFEB15E86D6A2FF6C513B18C5BF9FC4922E2` | Kopieret uændret |
| `fleet-v2/src/components/VeyroLogo.jsx` | `0A68932E596866567D8488680F397418B073FE4652682C215F94396B4F8FAD54` | Komponentmønster |
| `fleet-v2/src/components/Icon.jsx` | `1EB34FB64B252397C01983FD8EC1E2D40F3D231BD26457681D991C2D4BD29D9D` | Ikonmønster, FACILITY-ikoner tegnet lokalt |
| `fleet-v2/src/components/Sidebar.jsx` | `CF02E2D08DD9A5D538DE97C61041A8C9B0D5A015AFE98FA9545C8844950A434A` | Shell- og foldemønster, ikke direkte kopi |
| `fleet-v2/src/components/Topbar.jsx` | `F85AA27C0135D05CD008EBFC395285A922072DB1AED260D5874D7DBC0201D4FC` | Topbjælkemønster, ikke direkte kopi |
| `fleet-v2/src/components/OverviewCharts.jsx` | `F775E78AB21B82444EBC5DD38954E9239A34EBBDF8C3B59FEC818256443AB34D` | Inspiration til egen datadrevet graf |
| `fleet-v2/src/data/unitRepository.js` | `63173D0D35E0F5982CCA9ABB680E1AB2F28A60BF7C4EDC706004B348A304B210` | Repository- og migrationsmønster |
| `fleet-v2/src/data/FleetDataContext.jsx` | `CEE0853D2C79B33DB50BEF0B6103F86DAD512FAE4F56F7B827F4F596BAFB2813` | Context/repository-adskillelse |
| `fleet-v2/src/styles/fleet-v2.css` | `F30A5525594FF9A6A02C954520B2AE6082870569B8CF29C9109E3EDC74460527` | Verificerede semantiske farver |

## Originalt logo

Den oprindelige fil
`C:\Users\DennisChristensen\Downloads\NY. Veyro_Systems_hovedlogo_header_sidebar.png`
har samme SHA-256 som den committede kopi. Logoet er ikke tegnet eller
omfortolket i FACILITY.

## Afgrænsning

Ingen kode er importeret fra det aktive FLEET-, PLANNING- eller
FAKTURACENTER-worktree. Der er ikke lavet fælles pakke- eller tokenudtræk.
