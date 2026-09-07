# Veyro Systems-tema

Den autoritative platformskilde er tokenblokken i `src/fleet/fleet.css`.
Planning, Fakturacenter og eksisterende FLEET bruger de eksisterende
`--bc-*`- og `--fc-*`-navne, som peger på de fælles semantiske
`--veyro-*`-tokens.

Den isolerede FLEET v2-indgang kan ikke importere filer fra platformens
Vite-root. Dens `src/styles/fleet-v2.css` indeholder derfor en midlertidig,
identisk kopi af `--veyro-*`-paletten. Kopien skal erstattes af den
autoritative platformskilde, når v2 senere integreres.

| Rolle | Værdi |
|---|---|
| Deep Navy | `#061A2A` |
| Navy Dark | `#03131F` |
| Veyro Teal | `#087F8F` |
| Veyro Cyan | `#22C2CF` |
| Teal Light | `#E8F7F8` |
| White | `#FFFFFF` |
| App Background | `#F5F7F9` |
| Border | `#DCE3E8` |
| Primary Text | `#102235` |
| Secondary Text | `#667687` |
| Success | `#2EAD72` |
| Warning | `#D99A28` |
| Danger | `#D95C5C` |

`--veyro-secondary-text-strong: #5F6F7F` bevares som den oprindelige afledte
reference. Den faktiske, dæmpede UI-tekst bruger tilgængelighedstokenet
nedenfor. Palettens Secondary Text-værdi bevares uændret som grundtoken.

## Afledte semantiske UI-tokens

Grundpaletten ovenfor er uændret. Den faktiske grænseflade bruger fire små,
afledte tilpasninger, så eksisterende kontrastkrav holder med en reel margin:

| UI-rolle | Værdi | Begrundelse |
|---|---|---|
| Link og primær handling | `--veyro-link-accessible: #087484` | Bevarer teal-retningen og giver mindst 4,61:1 mod de relevante lyse flader |
| Dæmpet UI-tekst | `--veyro-muted-accessible: #5B6B7B` | Bevarer Secondary Text-retningen og giver mindst 4,62:1 mod arbejdsfladen |
| Kortflade | `--veyro-card-surface: #F7F8F9` | Rolig, næsten hvid flade uden at være rå `#FFFFFF` |
| Arbejdsflade | `--veyro-workspace-surface: color-mix(... 95% App Background, 5% Deep Navy)` | Giver 1,12:1 mellem kort og side |
| Stærk UI-border | `--veyro-border-strong: #DBE2E7` | Ét RGB-trin mørkere end grundborderen og mindst 1,10:1 mod begge flader |

De er semantiske tilgængelighedstokens og erstatter ikke de officielle
grundfarver. `--bc-*` og `--fc-*` peger fortsat gennem det fælles lag.

Logoets kildefil er `NY. Veyro_Systems_hovedlogo_header_sidebar.png`.
Den kopieres uændret til `src/assets/veyro/veyro-systems-logo.png` og
bruges gennem `VeyroLogo`. SHA-256:
`3F0A45DEDA4188828A835856E8F5BFEB15E86D6A2FF6C513B18C5BF9FC4922E2`.
