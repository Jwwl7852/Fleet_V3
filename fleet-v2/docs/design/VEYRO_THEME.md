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

Til små sekundære labels bruges den afledte
`--veyro-secondary-text-strong: #5F6F7F` (4,81:1 mod arbejdsfladen).
Palettens Secondary Text-værdi bevares uændret som grundtoken.

Logoets kildefil er `NY. Veyro_Systems_hovedlogo_header_sidebar.png`.
Den kopieres uændret til `src/assets/veyro/veyro-systems-logo.png` og
bruges gennem `VeyroLogo`. SHA-256:
`3F0A45DEDA4188828A835856E8F5BFEB15E86D6A2FF6C513B18C5BF9FC4922E2`.
