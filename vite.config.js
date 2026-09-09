import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  /* FACILITY kan fortsat bygge selvstændigt med checkpointets toolchain.
     I den fælles build skal kode under facility-v2/ derimod bruge præcis den
     samme React- og Router-instans (v6) som AppShell. Dedupe undgår både en
     ekstra runtime og inkompatible Router-contexts uden en bred opgradering. */
  resolve: {
    dedupe: ["react", "react-dom", "react-router", "react-router-dom"],
  },
  build: {
    outDir: "dist",
    sourcemap: true,
    rollupOptions: {
      output: {
        /**
         * ⚠ TRE FASTE CHUNKS — RESTEN DELER ROLLUP SELV.
         *
         * Skærmene hentes med `lazy()` (beslutning 97), så hver rute får sin
         * egen chunk uden at der skal stå noget her. Det der IKKE deler sig
         * af sig selv, er bibliotekerne: de importeres af alt, og uden en
         * regel havner de i den første chunk der nævner dem.
         *
         * `firebase` er 481 kB alene og skifter kun når vi opgraderer SDK'et.
         * Ligger den for sig, kan browseren beholde den på tværs af
         * udrulninger — og vi udruller ofte. Samme for `react`.
         *
         * ⚠ SPLIT IKKE VORES EGEN `fleet/`-mappe UD. Den deles af hver
         * eneste skærm, og en chunk der altid hentes, er en chunk der lige så
         * godt kan ligge i indgangen. En ekstra fil koster en rundtur.
         */
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("firebase") || id.includes("@firebase")) return "firebase";
          if (id.includes("react")) return "react";
          return "vendor";
        },
      },
    },
  },
});
