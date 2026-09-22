import { describe, expect, it, vi } from "vitest";
import {
  hentOffentligLoginKontekst,
  lokalSyntetiskLoginKontekst,
  valideOffentligLoginKontekst,
} from "../../src/fleet/login-kundekonfiguration.js";

describe("offentlig loginkontekst", () => {
  it("giver kun hele det generelle katalog til den eksplicitte lokale emulator", () => {
    expect(lokalSyntetiskLoginKontekst()).toBeNull();
    const kontekst = lokalSyntetiskLoginKontekst({ brugerLokaleEmulatorer: true });
    expect(kontekst.status).toBe("kendt");
    expect(kontekst.contextId).toBe("lokal_demo");
    expect(kontekst.moduler).toEqual([
      "fleet", "facility", "planning", "procure", "fakturacenter",
      "workforce", "warehouse", "unit-booking",
    ]);
  });

  it("accepterer kun en komplet projektion med kendte moduler", () => {
    expect(valideOffentligLoginKontekst({ version: 1, contextId: "kunde_public", moduler: ["fleet", "fleet", "workforce"] })).toEqual({
      status: "kendt", contextId: "kunde_public", moduler: ["fleet", "workforce"],
    });
    expect(valideOffentligLoginKontekst({ version: 1, contextId: "kunde_public", moduler: ["fleet", "support"] })).toBeNull();
    expect(valideOffentligLoginKontekst({ version: 1, contextId: "tenant-hemmelig", moduler: [] })).toBeNull();
  });

  it("sender ingen credentials og fejler neutralt ved serverfejl", async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: false });
    await expect(hentOffentligLoginKontekst({ url: "https://functions.example/kontekst", fetchFn })).resolves.toEqual({ status: "ukendt", moduler: [] });
    expect(fetchFn).toHaveBeenCalledWith("https://functions.example/kontekst", expect.objectContaining({ credentials: "omit", cache: "no-store" }));
  });

  it("fejler neutralt ved manipuleret eller uventet svar", async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ version: 1, contextId: "kunde_public", moduler: ["facility", "hemmelig"] }) });
    await expect(hentOffentligLoginKontekst({ url: "https://functions.example/kontekst", fetchFn })).resolves.toEqual({ status: "ukendt", moduler: [] });
  });
});
