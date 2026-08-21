/* src/fleet/demo-personale.js
 * ÉT demo-personale. Ikke to.
 *
 * Navnene stod før hardkodet i Bemanding.jsx, hvor de var opfundet til en
 * kompetencetabel og ikke fandtes andre steder. Da Medarbejdere blev bygget,
 * ville skærmen have fået sit eget sæt — og så havde platformen haft to
 * medarbejderstabe der ikke kendte hinanden: Lars Aage kunne stå med et
 * udløbet EU-bevis på Bemanding og slet ikke findes på Medarbejdere.
 *
 * Det er samme fejl som beslutning 6 løste for nøgletal, et niveau længere
 * nede: én kilde, flere visninger. Bemanding importerer herfra, Medarbejdere
 * læser det som demo-sæt gennem useListe(), og Kompetencer og Ferie & fravær
 * skal gøre det samme, når de bygges.
 *
 * FORMEN ER NODENS, IKKE SKÆRMENS. Posterne herunder ser ud præcis som
 * tenants/<t>/personale/<personId> og tenants/<t>/kompetencer/<id> gør i
 * ARKITEKTUR.md — samme felter, samme navne, samme enheder. Den dag der ligger
 * rigtige data i DEV, skal skærmene ikke laves om; demo-sættet skal bare falde
 * væk. Et demo-sæt med sin egen form ville skjule at skærmen læser forkert.
 *
 * DET ER ET UDSNIT. 35 personer er ikke hele staben — KPI-noden siger 58
 * planlagte og 48 disponerede. Rosteren er tegnet til at ligne en vognmand,
 * ikke til at summere op til nøgletallene, og skærmene skriver det til
 * brugeren frem for at lade to tal modsige hinanden i stilhed.
 *
 * INGEN DIVISION — beslutning 19. Stamdata har ikke en division, og reglerne
 * afviser feltet på personale/ med .validate: false. En medarbejder er
 * defineret ved sine KOMPETENCER: hun oprettes én gang og virker i alle
 * moduler tenanten har adgang til. Ulrik Bang med C/E og D er derfor ikke
 * `faelles` længere — han er en person med fire kompetencer.
 *
 * NØGLEN ER ET personId. Ikke et uid. Kun de otte der har et login har et
 * uid-felt; chaufførerne har intet, og det er ikke et hul i datasættet — det
 * er pointen med beslutning 18. Se personale.js.
 *
 * INTET FØLSOMT HER. Ingen CPR, ingen privatadresse, ingen pårørende, ingen
 * baggrundskontrol. De felter hører i sensitive/personale bag
 * personale.sensitiveLaes, og reglerne AFVISER cpr og privatAdresse i
 * general-noden. Et demo-sæt der havde dem med, ville lære den næste udvikler
 * en form der ikke kan gemmes.
 */
/* Kun rene moduler herinde. format.js, flaade.js og demo-kpi.js har ingen
   React i sig, og det er med vilje: så kan datasættet indlæses af en test
   eller en Cloud Function uden at trække en hel frontend med. */
import { serviceTone } from "./format.js";
import { KOMPETENCE, KOMPETENCE_LABEL } from "./flaade.js";
import { DEMO_KPI } from "./demo-kpi.js";
import { selvkontrol } from "./selvkontrol.js";

const NU = Date.now();
const D = 86400000;
const AAR = 365 * D;

/* ---- Personale ------------------------------------------------------ */

/**
 * DEMO_PERSONALE — tenants/<t>/personale/<personId>
 *
 * funktioner er et MAP. En person kan have flere: Peter Iversen er mekaniker
 * og kører også, Ulrik Bang har både C/E og D. Et array kunne ikke indekseres,
 * og "hvem er mekanikere" ville kræve at hente hele staben ned.
 *
 * INGEN division på nogen af dem (beslutning 19). Grupperingerne herunder er
 * kun læsbarhed — de er funktioner, ikke afdelinger, og de findes ikke som
 * felt. Hvad en person kan, står i kompetencer/; hvad hun laver, står i
 * funktioner.
 *
 * status: en fratrådt medarbejder står tilbage med fratraadtMs. Der hænger
 * reservationer og indberetninger på personId'et, og reglerne afviser en
 * sletning med newData.exists().
 */
export const DEMO_PERSONALE = [
  /* --- Chauffører -------------------------------------------------- */
  { id: "larsAage", navn: "Lars Aage", funktioner: { chauffoer: true },
    status: "aktiv", ansaettelsesform: "fastansat",
    telefon: "20 14 88 03", email: "lars.aage@demotransport.dk",
    stationeret: "Kolding", ansatMs: NU - 11 * AAR },
  { id: "reneThomsen", navn: "Rene Thomsen", funktioner: { chauffoer: true },
    status: "aktiv", ansaettelsesform: "fastansat",
    telefon: "22 41 07 65", email: "rene.thomsen@demotransport.dk",
    stationeret: "Kolding", ansatMs: NU - 7 * AAR },
  { id: "jesperRiis", navn: "Jesper Riis", funktioner: { chauffoer: true },
    status: "aktiv", ansaettelsesform: "fastansat",
    telefon: "26 78 31 14", email: "jesper.riis@demotransport.dk",
    stationeret: "Aalborg", ansatMs: NU - 5 * AAR },
  { id: "anneKrogh", navn: "Anne Krogh", funktioner: { chauffoer: true },
    status: "aktiv", ansaettelsesform: "fastansat",
    telefon: "31 55 92 40", email: "anne.krogh@demotransport.dk",
    stationeret: "Kolding", ansatMs: NU - 4 * AAR },
  { id: "henrikVestergaard", navn: "Henrik Vestergaard", funktioner: { chauffoer: true },
    status: "aktiv", ansaettelsesform: "fastansat",
    telefon: "40 23 66 18", email: "henrik.vestergaard@demotransport.dk",
    stationeret: "Aalborg", ansatMs: NU - 9 * AAR },
  { id: "mortenBech", navn: "Morten Bech", funktioner: { chauffoer: true },
    status: "aktiv", ansaettelsesform: "vikar",
    telefon: "50 71 24 93", email: "morten.bech@demotransport.dk",
    stationeret: "Kolding", ansatMs: NU - 140 * D },
  { id: "dorteEnevoldsen", navn: "Dorte Enevoldsen", funktioner: { chauffoer: true },
    status: "aktiv", ansaettelsesform: "fastansat",
    telefon: "28 90 15 77", email: "dorte.enevoldsen@demotransport.dk",
    stationeret: "Kolding", ansatMs: NU - 6 * AAR },
  { id: "yusufDemir", navn: "Yusuf Demir", funktioner: { chauffoer: true },
    status: "aktiv", ansaettelsesform: "fastansat",
    telefon: "23 12 40 58", email: "yusuf.demir@demotransport.dk",
    stationeret: "Aalborg", ansatMs: NU - 3 * AAR },
  { id: "steenHalvorsen", navn: "Steen Halvorsen", funktioner: { chauffoer: true },
    status: "aktiv", ansaettelsesform: "ekstern",
    telefon: "60 44 81 29", email: "steen.halvorsen@demotransport.dk",
    stationeret: "Kolding", ansatMs: NU - 220 * D },
  /* Orlov: kan ikke disponeres, men er hverken slettet eller fratrådt. */
  { id: "clausNyholm", navn: "Claus Nyholm", funktioner: { chauffoer: true },
    status: "orlov", ansaettelsesform: "fastansat",
    telefon: "29 63 07 41", email: "claus.nyholm@demotransport.dk",
    stationeret: "Aalborg", ansatMs: NU - 8 * AAR },
  /* Fratrådt: står tilbage. Hans indberetninger og reservationer peger stadig
     på personId'et, og reglerne afviser en sletning. */
  { id: "bjarneToft", navn: "Bjarne Toft", funktioner: { chauffoer: true },
    status: "fratraadt", ansaettelsesform: "fastansat",
    telefon: "21 08 55 36", email: "bjarne.toft@demotransport.dk",
    stationeret: "Kolding", ansatMs: NU - 14 * AAR, fratraadtMs: NU - 96 * D },

  /* --- Lager og terminal ------------------------------------------- */
  { id: "benjaminHolm", navn: "Benjamin Holm", funktioner: { lager: true },
    status: "aktiv", ansaettelsesform: "fastansat",
    telefon: "27 33 19 84", email: "benjamin.holm@demotransport.dk",
    stationeret: "Kolding", ansatMs: NU - 2 * AAR },
  { id: "metteSoerensen", navn: "Mette Sørensen", funktioner: { lager: true, terminal: true },
    status: "aktiv", ansaettelsesform: "fastansat",
    telefon: "30 27 64 12", email: "mette.soerensen@demotransport.dk",
    stationeret: "Kolding", ansatMs: NU - 6 * AAR },
  { id: "nadiaKrarup", navn: "Nadia Krarup", funktioner: { terminal: true },
    status: "aktiv", ansaettelsesform: "vikar",
    telefon: "52 80 41 07", email: "nadia.krarup@demotransport.dk",
    stationeret: "Aalborg", ansatMs: NU - 62 * D },
  { id: "emilBrandt", navn: "Emil Brandt", funktioner: { lager: true },
    status: "aktiv", ansaettelsesform: "fastansat",
    telefon: "24 19 73 55", email: "emil.brandt@demotransport.dk",
    stationeret: "Aalborg", ansatMs: NU - 3 * AAR },

  /* --- Værksted --------------------------------------------------- */
  /* Peter Iversen kører også — funktioner er et map netop af den grund. */
  { id: "peterIversen", navn: "Peter Iversen", funktioner: { mekaniker: true, chauffoer: true },
    status: "aktiv", ansaettelsesform: "fastansat",
    telefon: "25 66 30 91", email: "peter.iversen@demotransport.dk",
    stationeret: "Kolding", ansatMs: NU - 10 * AAR },
  { id: "ibSoerensen", navn: "Ib Sørensen", funktioner: { mekaniker: true },
    status: "aktiv", ansaettelsesform: "fastansat",
    telefon: "22 74 58 60", email: "ib.soerensen@demotransport.dk",
    stationeret: "Kolding", ansatMs: NU - 17 * AAR },
  /* Værkstedet servicerer hele materiellet. Det krævede før et felt der sagde
     "begge"; nu kræver det ingenting. */
  { id: "janHolmgaard", navn: "Jan Holmgaard", funktioner: { mekaniker: true },
    status: "aktiv", ansaettelsesform: "fastansat",
    telefon: "26 41 09 37", email: "jan.holmgaard@demotransport.dk",
    stationeret: "Kolding", ansatMs: NU - 12 * AAR },
  { id: "kasperLykke", navn: "Kasper Lykke", funktioner: { mekaniker: true },
    status: "aktiv", ansaettelsesform: "vikar",
    telefon: "53 22 87 14", email: "kasper.lykke@demotransport.dk",
    stationeret: "Aalborg", ansatMs: NU - 88 * D },

  /* --- Buschauffører ----------------------------------------------- */
  { id: "kimDalsgaard", navn: "Kim Dalsgaard", funktioner: { buschauffoer: true },
    status: "aktiv", ansaettelsesform: "fastansat",
    telefon: "20 55 12 74", email: "kim.dalsgaard@demotransport.dk",
    stationeret: "Vejle", ansatMs: NU - 9 * AAR },
  { id: "tinaBruun", navn: "Tina Bruun", funktioner: { buschauffoer: true },
    status: "aktiv", ansaettelsesform: "fastansat",
    telefon: "22 90 46 31", email: "tina.bruun@demotransport.dk",
    stationeret: "Vejle", ansatMs: NU - 5 * AAR },
  { id: "oveNilsson", navn: "Ove Nilsson", funktioner: { buschauffoer: true },
    status: "aktiv", ansaettelsesform: "fastansat",
    telefon: "27 18 63 05", email: "ove.nilsson@demotransport.dk",
    stationeret: "Vejle", ansatMs: NU - 13 * AAR },
  { id: "saraLind", navn: "Sara Lind", funktioner: { buschauffoer: true },
    status: "aktiv", ansaettelsesform: "fastansat",
    telefon: "31 74 20 68", email: "sara.lind@demotransport.dk",
    stationeret: "Odense", ansatMs: NU - 2 * AAR },
  { id: "gitteFrandsen", navn: "Gitte Frandsen", funktioner: { buschauffoer: true },
    status: "aktiv", ansaettelsesform: "fastansat",
    telefon: "28 35 91 47", email: "gitte.frandsen@demotransport.dk",
    stationeret: "Odense", ansatMs: NU - 4 * AAR },
  { id: "leifMogensen", navn: "Leif Mogensen", funktioner: { buschauffoer: true },
    status: "aktiv", ansaettelsesform: "ekstern",
    telefon: "61 02 77 53", email: "leif.mogensen@demotransport.dk",
    stationeret: "Odense", ansatMs: NU - 310 * D },
  { id: "camillaStorm", navn: "Camilla Storm", funktioner: { buschauffoer: true },
    status: "aktiv", ansaettelsesform: "vikar",
    telefon: "51 46 08 22", email: "camilla.storm@demotransport.dk",
    stationeret: "Vejle", ansatMs: NU - 105 * D },
  { id: "torbenVad", navn: "Torben Vad", funktioner: { buschauffoer: true },
    status: "orlov", ansaettelsesform: "fastansat",
    telefon: "29 81 34 76", email: "torben.vad@demotransport.dk",
    stationeret: "Vejle", ansatMs: NU - 7 * AAR },

  /* --- Både lastbil og bus ----------------------------------------- */
  /* C/E og D på samme kørekort. Han var eksemplet på hvorfor division måtte
     være et felt og ikke en sti (beslutning 15) — med divisionen i stien ville
     han have haft to kalendere. Beslutning 19 fjernede spørgsmålet: han har
     ingen division, han har fire kompetencer. Det er dem der afgør hvad han
     må køre, og de står i kompetencer/. */
  { id: "ulrikBang", navn: "Ulrik Bang", funktioner: { chauffoer: true, buschauffoer: true },
    status: "aktiv", ansaettelsesform: "fastansat",
    telefon: "23 60 15 89", email: "ulrik.bang@demotransport.dk",
    stationeret: "Kolding", ansatMs: NU - 15 * AAR },

  /* --- Disponenter ------------------------------------------------ */
  /* Herfra og ned har alle et login. Bemærk at uid og id er forskellige
     strenge: personen er ikke sin konto. */
  { id: "frankUhrskov", navn: "Frank Uhrskov", funktioner: { disponent: true },
    status: "aktiv", ansaettelsesform: "fastansat",
    telefon: "40 91 26 03", email: "frank.uhrskov@demotransport.dk",
    stationeret: "Kolding", ansatMs: NU - 8 * AAR, uid: "u-frank" },
  { id: "lineAggerholm", navn: "Line Aggerholm", funktioner: { disponent: true },
    status: "aktiv", ansaettelsesform: "fastansat",
    telefon: "41 07 58 32", email: "line.aggerholm@demotransport.dk",
    stationeret: "Kolding", ansatMs: NU - 3 * AAR, uid: "u-line" },

  /* --- Administration --------------------------------------------- */
  /* De fire kundeansvarlige fra Kunder & Priser. De stod som `ansvarlig` på
     kunderne og fandtes ellers ingen steder — endnu et sæt navne uden en
     medarbejder bagved. Bemærk at KUNDERNE stadig kan være `faelles`: dér
     betyder værdien at kundens forretning går på tværs, og den beholder sin
     mening. Det er stamdata om vores egne folk og biler der ikke har en
     division, ikke om kunden. */
  { id: "metteKjaer", navn: "Mette Kjær", funktioner: { administration: true },
    status: "aktiv", ansaettelsesform: "fastansat",
    telefon: "42 15 80 64", email: "mette.kjaer@demotransport.dk",
    stationeret: "Kolding", ansatMs: NU - 6 * AAR, uid: "u-mette" },
  { id: "soerenDahl", navn: "Søren Dahl", funktioner: { administration: true },
    status: "aktiv", ansaettelsesform: "fastansat",
    telefon: "42 33 07 19", email: "soeren.dahl@demotransport.dk",
    stationeret: "Aalborg", ansatMs: NU - 4 * AAR, uid: "u-soeren" },
  { id: "anneBoegh", navn: "Anne Bøgh", funktioner: { administration: true },
    status: "aktiv", ansaettelsesform: "fastansat",
    telefon: "42 76 21 58", email: "anne.boegh@demotransport.dk",
    stationeret: "Kolding", ansatMs: NU - 9 * AAR, uid: "u-anne" },
  { id: "peterLund", navn: "Peter Lund", funktioner: { administration: true },
    status: "aktiv", ansaettelsesform: "fastansat",
    telefon: "42 04 93 27", email: "peter.lund@demotransport.dk",
    stationeret: "Vejle", ansatMs: NU - 2 * AAR, uid: "u-peter" },
  /* Den indloggede demo-bruger. uid'et er det samme som i App.jsx, så
     detaljepanelet kan vise at posten hører til den man selv er logget ind
     som — og at kontoen er noget andet end personen. */
  { id: "dennisChristensen", navn: "Dennis Christensen",
    funktioner: { administration: true, disponent: true },
    status: "aktiv", ansaettelsesform: "fastansat",
    telefon: "42 88 10 45", email: "dch@fleetcontrol.dk",
    stationeret: "Kolding", ansatMs: NU - 10 * AAR, uid: "demo" },
];

/* ---- Kompetencer ---------------------------------------------------- */

/**
 * DEMO_KOMPETENCER — tenants/<t>/kompetencer/<id>
 *
 * Egen node, ikke et barn af personen: "hvilke kompetencer udløber inden for
 * 30 dage?" kan ikke besvares under personale/<id>/kompetencer/, fordi RTDB
 * kun forespørger på børnene af én node. Samme argument som etaper i
 * beslutning 16.
 *
 * INGEN DIVISION. Reglerne afviser feltet med .validate: false. Det gjorde de
 * også før beslutning 19 — dengang med den begrundelse at divisionen arvedes
 * fra personen. Nu har personen heller ingen, og feltet er ikke bare
 * unødvendigt her: det findes ikke på nogen af de to noder.
 *
 * DE ELLEVE FØRSTE ER LÅST. De kom fra Bemanding, og deres udløbsdatoer er
 * regnet ud så præcis otte af dem falder inden for 30 dage — hvad
 * k.bemanding.kompetencerUdloeber siger. Flytter du en dato, holder Bemanding
 * op med at stemme med sit eget nøgletal. Kontrollen nederst i filen fanger
 * det i dev.
 *
 * Tallet var før 5 i gods og 3 i bus, delt efter personens division. Med
 * beslutning 19 er der ét tal: ingen abonnent har både gods og bus, så der er
 * ingenting at dele op. Summen er den samme — det er kun opdelingen der er
 * væk, ikke en eneste post.
 *
 * Alle øvrige rækker udløber med VILJE mere end 30 dage ude.
 */
export const DEMO_KOMPETENCER = [
  /* De elleve fra Bemanding. Rør ikke datoerne. */
  { id: "k-larsAage-eubevis", personId: "larsAage", type: KOMPETENCE.eubevis, udloeberMs: NU + 120 * D },
  /* ⚠ DET UDLOEBNE EU-BEVIS LIGGER PAA EN DER IKKE ER PAA EN ETAPE.
     Efter beslutning 25 BLOKERER eubevis, fordi kravet kan udledes af arten.
     Laa det paa en chauffoer der er tildelt en tur, ville Disponering vise en
     konflikt der kom fra DEMO-DATA og ikke fra modellen — og saa kan man ikke
     se forskel paa en fejl i data og en fejl i koden. */
  { id: "k-steen-eubevis", personId: "steenHalvorsen", type: KOMPETENCE.eubevis, udloeberMs: NU - 2 * D },
  { id: "k-rene-eubevis", personId: "reneThomsen", type: KOMPETENCE.eubevis, udloeberMs: NU + 201 * D },
  { id: "k-jesper-eubevis", personId: "jesperRiis", type: KOMPETENCE.eubevis, udloeberMs: NU + 168 * D },
  { id: "k-reneThomsen-adr", personId: "reneThomsen", type: KOMPETENCE.adr, udloeberMs: NU + 9 * D },
  { id: "k-benjaminHolm-truck", personId: "benjaminHolm", type: KOMPETENCE.truckcertifikat, udloeberMs: NU + 16 * D },
  { id: "k-metteSoerensen-kran", personId: "metteSoerensen", type: KOMPETENCE.kran, udloeberMs: NU + 23 * D },
  { id: "k-peterIversen-foerste", personId: "peterIversen", type: KOMPETENCE.foerstehjaelp, udloeberMs: NU + 29 * D },
  { id: "k-anneKrogh-eubevis", personId: "anneKrogh", type: KOMPETENCE.eubevis, udloeberMs: NU + 112 * D },
  { id: "k-jesperRiis-adr", personId: "jesperRiis", type: KOMPETENCE.adr, udloeberMs: NU + 240 * D },
  { id: "k-kimDalsgaard-eubevis", personId: "kimDalsgaard", type: KOMPETENCE.eubevis, udloeberMs: NU + 5 * D },
  { id: "k-tinaBruun-foerste", personId: "tinaBruun", type: KOMPETENCE.foerstehjaelp, udloeberMs: NU + 18 * D },
  { id: "k-oveNilsson-d", personId: "oveNilsson", type: KOMPETENCE.d, udloeberMs: NU + 27 * D },
  { id: "k-saraLind-eubevis", personId: "saraLind", type: KOMPETENCE.eubevis, udloeberMs: NU + 190 * D },

  /* Kørekort og tachografkort. Uden dem ville chaufførerne se ud som om de
     ikke måtte køre — og det er netop de typer der BLOKERER en etape. */
  { id: "k-larsAage-c", personId: "larsAage", type: KOMPETENCE.c, udloeberMs: NU + 402 * D },
  { id: "k-larsAage-ce", personId: "larsAage", type: KOMPETENCE.ce, udloeberMs: NU + 402 * D },
  { id: "k-larsAage-tacho", personId: "larsAage", type: KOMPETENCE.tachografkort, udloeberMs: NU + 318 * D },
  { id: "k-reneThomsen-c", personId: "reneThomsen", type: KOMPETENCE.c, udloeberMs: NU + 521 * D },
  { id: "k-reneThomsen-ce", personId: "reneThomsen", type: KOMPETENCE.ce, udloeberMs: NU + 521 * D },
  { id: "k-reneThomsen-tacho", personId: "reneThomsen", type: KOMPETENCE.tachografkort, udloeberMs: NU + 209 * D },
  { id: "k-jesperRiis-c", personId: "jesperRiis", type: KOMPETENCE.c, udloeberMs: NU + 388 * D },
  { id: "k-jesperRiis-ce", personId: "jesperRiis", type: KOMPETENCE.ce, udloeberMs: NU + 388 * D },
  { id: "k-jesperRiis-tacho", personId: "jesperRiis", type: KOMPETENCE.tachografkort, udloeberMs: NU + 264 * D },
  { id: "k-anneKrogh-c", personId: "anneKrogh", type: KOMPETENCE.c, udloeberMs: NU + 455 * D },
  { id: "k-anneKrogh-ce", personId: "anneKrogh", type: KOMPETENCE.ce, udloeberMs: NU + 455 * D },
  { id: "k-anneKrogh-tacho", personId: "anneKrogh", type: KOMPETENCE.tachografkort, udloeberMs: NU + 173 * D },
  { id: "k-henrik-c", personId: "henrikVestergaard", type: KOMPETENCE.c, udloeberMs: NU + 610 * D },
  { id: "k-henrik-ce", personId: "henrikVestergaard", type: KOMPETENCE.ce, udloeberMs: NU + 610 * D },
  { id: "k-henrik-tacho", personId: "henrikVestergaard", type: KOMPETENCE.tachografkort, udloeberMs: NU + 240 * D },
  { id: "k-henrik-adr", personId: "henrikVestergaard", type: KOMPETENCE.adr, udloeberMs: NU + 301 * D },
  { id: "k-henrik-eubevis", personId: "henrikVestergaard", type: KOMPETENCE.eubevis, udloeberMs: NU + 355 * D },
  { id: "k-mortenBech-c", personId: "mortenBech", type: KOMPETENCE.c, udloeberMs: NU + 289 * D },
  { id: "k-mortenBech-tacho", personId: "mortenBech", type: KOMPETENCE.tachografkort, udloeberMs: NU + 194 * D },
  { id: "k-dorte-c", personId: "dorteEnevoldsen", type: KOMPETENCE.c, udloeberMs: NU + 437 * D },
  { id: "k-dorte-ce", personId: "dorteEnevoldsen", type: KOMPETENCE.ce, udloeberMs: NU + 437 * D },
  { id: "k-dorte-tacho", personId: "dorteEnevoldsen", type: KOMPETENCE.tachografkort, udloeberMs: NU + 152 * D },
  { id: "k-dorte-eubevis", personId: "dorteEnevoldsen", type: KOMPETENCE.eubevis, udloeberMs: NU + 288 * D },
  { id: "k-yusuf-c", personId: "yusufDemir", type: KOMPETENCE.c, udloeberMs: NU + 566 * D },
  { id: "k-yusuf-ce", personId: "yusufDemir", type: KOMPETENCE.ce, udloeberMs: NU + 566 * D },
  { id: "k-yusuf-tacho", personId: "yusufDemir", type: KOMPETENCE.tachografkort, udloeberMs: NU + 331 * D },
  { id: "k-yusuf-adr", personId: "yusufDemir", type: KOMPETENCE.adr, udloeberMs: NU + 148 * D },
  { id: "k-steen-c", personId: "steenHalvorsen", type: KOMPETENCE.c, udloeberMs: NU + 205 * D },
  { id: "k-steen-tacho", personId: "steenHalvorsen", type: KOMPETENCE.tachografkort, udloeberMs: NU + 168 * D },
  { id: "k-claus-c", personId: "clausNyholm", type: KOMPETENCE.c, udloeberMs: NU + 344 * D },
  { id: "k-claus-ce", personId: "clausNyholm", type: KOMPETENCE.ce, udloeberMs: NU + 344 * D },
  { id: "k-claus-tacho", personId: "clausNyholm", type: KOMPETENCE.tachografkort, udloeberMs: NU + 276 * D },
  /* Bjarne er fratrådt. Beviserne står tilbage sammen med personen — de
     forsvinder ikke, fordi ansættelsen gjorde. */
  { id: "k-bjarne-c", personId: "bjarneToft", type: KOMPETENCE.c, udloeberMs: NU + 96 * D },
  { id: "k-bjarne-tacho", personId: "bjarneToft", type: KOMPETENCE.tachografkort, udloeberMs: NU + 121 * D },

  /* Lager og terminal. */
  { id: "k-benjaminHolm-foerste", personId: "benjaminHolm", type: KOMPETENCE.foerstehjaelp, udloeberMs: NU + 251 * D },
  { id: "k-metteSoerensen-truck", personId: "metteSoerensen", type: KOMPETENCE.truckcertifikat, udloeberMs: NU + 182 * D },
  { id: "k-emilBrandt-truck", personId: "emilBrandt", type: KOMPETENCE.truckcertifikat, udloeberMs: NU + 366 * D },
  { id: "k-emilBrandt-foerste", personId: "emilBrandt", type: KOMPETENCE.foerstehjaelp, udloeberMs: NU + 133 * D },

  /* Værksted. */
  { id: "k-peterIversen-c", personId: "peterIversen", type: KOMPETENCE.c, udloeberMs: NU + 412 * D },
  { id: "k-peterIversen-tacho", personId: "peterIversen", type: KOMPETENCE.tachografkort, udloeberMs: NU + 297 * D },
  { id: "k-ibSoerensen-truck", personId: "ibSoerensen", type: KOMPETENCE.truckcertifikat, udloeberMs: NU + 157 * D },
  { id: "k-janHolmgaard-foerste", personId: "janHolmgaard", type: KOMPETENCE.foerstehjaelp, udloeberMs: NU + 203 * D },
  { id: "k-janHolmgaard-truck", personId: "janHolmgaard", type: KOMPETENCE.truckcertifikat, udloeberMs: NU + 291 * D },

  /* Bus. */
  { id: "k-kimDalsgaard-d", personId: "kimDalsgaard", type: KOMPETENCE.d, udloeberMs: NU + 333 * D },
  { id: "k-kimDalsgaard-tacho", personId: "kimDalsgaard", type: KOMPETENCE.tachografkort, udloeberMs: NU + 261 * D },
  { id: "k-tinaBruun-d", personId: "tinaBruun", type: KOMPETENCE.d, udloeberMs: NU + 418 * D },
  { id: "k-tinaBruun-tacho", personId: "tinaBruun", type: KOMPETENCE.tachografkort, udloeberMs: NU + 226 * D },
  { id: "k-tinaBruun-eubevis", personId: "tinaBruun", type: KOMPETENCE.eubevis, udloeberMs: NU + 372 * D },
  { id: "k-oveNilsson-tacho", personId: "oveNilsson", type: KOMPETENCE.tachografkort, udloeberMs: NU + 187 * D },
  { id: "k-oveNilsson-eubevis", personId: "oveNilsson", type: KOMPETENCE.eubevis, udloeberMs: NU + 244 * D },
  { id: "k-saraLind-d", personId: "saraLind", type: KOMPETENCE.d, udloeberMs: NU + 502 * D },
  { id: "k-saraLind-tacho", personId: "saraLind", type: KOMPETENCE.tachografkort, udloeberMs: NU + 310 * D },
  { id: "k-gitte-d", personId: "gitteFrandsen", type: KOMPETENCE.d, udloeberMs: NU + 391 * D },
  { id: "k-gitte-tacho", personId: "gitteFrandsen", type: KOMPETENCE.tachografkort, udloeberMs: NU + 215 * D },
  { id: "k-gitte-foerste", personId: "gitteFrandsen", type: KOMPETENCE.foerstehjaelp, udloeberMs: NU + 95 * D },
  { id: "k-leifMogensen-d1", personId: "leifMogensen", type: KOMPETENCE.d1, udloeberMs: NU + 221 * D },
  { id: "k-camillaStorm-d", personId: "camillaStorm", type: KOMPETENCE.d, udloeberMs: NU + 163 * D },
  { id: "k-camillaStorm-tacho", personId: "camillaStorm", type: KOMPETENCE.tachografkort, udloeberMs: NU + 141 * D },
  { id: "k-torbenVad-d", personId: "torbenVad", type: KOMPETENCE.d, udloeberMs: NU + 279 * D },
  { id: "k-torbenVad-tacho", personId: "torbenVad", type: KOMPETENCE.tachografkort, udloeberMs: NU + 198 * D },

  /* C/E og D på samme person. Det er her hans rækkevidde står — ikke i et
     divisionsfelt på personen. */
  { id: "k-ulrikBang-c", personId: "ulrikBang", type: KOMPETENCE.c, udloeberMs: NU + 481 * D },
  { id: "k-ulrikBang-ce", personId: "ulrikBang", type: KOMPETENCE.ce, udloeberMs: NU + 481 * D },
  { id: "k-ulrikBang-d", personId: "ulrikBang", type: KOMPETENCE.d, udloeberMs: NU + 447 * D },
  { id: "k-ulrikBang-tacho", personId: "ulrikBang", type: KOMPETENCE.tachografkort, udloeberMs: NU + 302 * D },
  { id: "k-ulrikBang-eubevis", personId: "ulrikBang", type: KOMPETENCE.eubevis, udloeberMs: NU + 259 * D },

  /* Kontoret. Line kører ikke, men har førstehjælp — kompetencer er ikke
     forbeholdt chauffører. */
  { id: "k-lineAggerholm-foerste", personId: "lineAggerholm", type: KOMPETENCE.foerstehjaelp, udloeberMs: NU + 147 * D },
];

/* ---- Opslag --------------------------------------------------------- */

/* Kun til opslag herinde. Skærmene joiner på det de har HENTET — ikke på
   demo-arrayet — ellers ville de vise demo-navne oven på rigtige data den dag
   der ligger noget i basen. */
const personerEfterId = new Map(DEMO_PERSONALE.map((p) => [p.id, p]));

/**
 * Kompetencer med personnavn og label.
 *
 * Tog før en division og filtrerede personerne på den. Den parameter er væk
 * med beslutning 19: der er én liste, fordi der er én stab. Ingen abonnent har
 * både gods og bus, så der var aldrig to lister at holde adskilt — kun et felt
 * der lod som om.
 *
 * Formen er den Bemanding viser i sin tabel: { person, kompetence }. Det er en
 * visning af nodeformen ovenfor, ikke en anden kilde.
 */
export function demoKompetencerMedNavn() {
  return DEMO_KOMPETENCER
    .filter((k) => personerEfterId.has(k.personId))
    .map((k) => ({
      id: k.id,
      personId: k.personId,
      person: personerEfterId.get(k.personId).navn,
      kompetence: KOMPETENCE_LABEL[k.type] || k.type,
      udloeberMs: k.udloeberMs,
    }))
    .sort((a, b) => a.udloeberMs - b.udloeberMs);
}

/* ---- Selvkontrol ---------------------------------------------------- */

/**
 * Antal kompetencer der udløber inden for 30 dage — samme regnestykke som
 * Bemanding laver på sin egen tabel.
 *
 * Den skal give nøjagtig k.bemanding.kompetencerUdloeber. Gør den ikke det,
 * viser Bemanding et nøgletal der modsiger tabellen lige under det, og det er
 * fejlen bag 84-mod-83 i ny forklædning. Et demo-sæt er lige så nemt at komme
 * til at flytte som et rigtigt.
 *
 * Eksporteret så en test kan kalde den. Filen importerer kun rene moduler
 * netop derfor.
 */
export const demoUdloeberInden30 = () =>
  demoKompetencerMedNavn().filter((r) => serviceTone(r.udloeberMs).dage <= 30).length;

/** Kompetencer der peger på et personId der ikke findes. Skal være tom. */
export const demoForaeldreloeseKompetencer = () =>
  DEMO_KOMPETENCER.filter((k) => !personerEfterId.has(k.personId));

/* Kontrollen kører kun under dev og retter ikke noget — den siger til.
   DEMO_KPI importeres statisk fra demo-kpi.js. Den lå før i useKpi.js og måtte
   hentes med et dynamisk import, fordi useKpi trækker FleetContext.jsx med;
   datasættet er flyttet ud netop for at den slags kontrol også kan køres af en
   test. Se demo-kpi.js. */
selvkontrol("demo-personale", () => {
  const inden30 = demoUdloeberInden30();
  /* Feltet står stadig under begge divisioner i kpi/ — noden er delt
     (beslutning 9) — men vaerdien er den samme, fordi staben er den samme.
     Begge tjekkes, saa en aendring kun det ene sted ogsaa fanges. */
  for (const division of ["gods", "bus"]) {
    const forventet = DEMO_KPI[division]?.bemanding?.kompetencerUdloeber;
    if (inden30 !== forventet) {
      console.warn(
        `demo-personale: ${inden30} kompetencer udløber inden for 30 dage, ` +
        `men kpi.${division}.bemanding.kompetencerUdloeber siger ${forventet}. ` +
        `Bemanding viser nu et nøgletal der modsiger sin egen tabel — se noten ved DEMO_KOMPETENCER.`
      );
    }
  }

  const udenPerson = demoForaeldreloeseKompetencer();
  if (udenPerson.length) {
    console.warn(
      `demo-personale: ${udenPerson.length} kompetencer peger på et personId der ikke findes ` +
      `(${udenPerson.map((k) => k.personId).join(", ")}).`
    );
  }
});
