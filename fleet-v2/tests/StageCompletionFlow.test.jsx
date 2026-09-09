import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FleetV2App } from "../src/FleetV2App";
import { createMemoryUnitRepository } from "../src/data/unitRepository";

const start=(path,repository=createMemoryUnitRepository(),props={})=>{window.history.replaceState({},"",path);render(<FleetV2App repository={repository}{...props}/>);return repository;};

describe("statuskorrektion, mobilflow, økonomi og fælles billeder",()=>{
  beforeEach(()=>{localStorage.clear();vi.restoreAllMocks();});

  it("bekræfter Under vurdering tilbage til Ny, kan annulleres og bevarer sagen",async()=>{
    const repository=start("/arbejdsko/case-demo-001");
    await screen.findByRole("heading",{name:"Arbejdskø"});
    const before=structuredClone(repository.inspect().relations.cases.find((item)=>item.id==="case-demo-001"));
    fireEvent.change(screen.getByLabelText("Flyt status"),{target:{value:"new"}});
    fireEvent.click(screen.getByRole("button",{name:"Gem vurdering"}));
    expect(await screen.findByRole("heading",{name:"Flyt sagen tilbage til Ny?"})).toBeTruthy();
    fireEvent.click(screen.getByRole("button",{name:"Annuller"}));
    expect(repository.inspect().relations.cases.find((item)=>item.id===before.id).status).toBe("assessing");
    fireEvent.change(screen.getByLabelText("Flyt status"),{target:{value:"new"}});
    fireEvent.click(screen.getByRole("button",{name:"Gem vurdering"}));
    fireEvent.click(await screen.findByRole("button",{name:"Ja, flyt tilbage"}));
    await waitFor(()=>expect(repository.inspect().relations.cases.find((item)=>item.id===before.id).status).toBe("new"));
    const after=repository.inspect(); const item=after.relations.cases.find((entry)=>entry.id===before.id);
    expect(item).toMatchObject({id:before.id,reportId:before.reportId,priority:before.priority,assigneeId:before.assigneeId,dueDate:before.dueDate});
    expect(after.relations.caseEvents.some((event)=>event.caseId===before.id&&event.title==="Status ændret til Ny")).toBe(true);
  });

  it("viser mobiladgang, gemmer brugerejede kladder og opretter samme indberetning og sag",async()=>{
    const repository=start("/mobil");
    expect(await screen.findByRole("heading",{name:"Mobil indberetning"})).toBeTruthy();
    expect(screen.getByText(/Service og Varelevering/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button",{name:/Ny indberetning/}));
    await screen.findByRole("heading",{name:"Ny indberetning"});
    expect(screen.queryByRole("button",{name:/NB-001/})).toBeNull();
    fireEvent.change(screen.getByLabelText("Enhedskode"),{target:{value:"VEYRO-UNIT:unit-nb-001"}});
    fireEvent.click(screen.getByRole("button",{name:"Brug kode"}));
    expect(screen.getByRole("status").textContent).toMatch(/ikke adgang/);
    fireEvent.click(screen.getByRole("button",{name:/SC-104/}));
    fireEvent.click(screen.getByRole("button",{name:/Fortsæt/}));
    fireEvent.change(screen.getByLabelText("Kategori"),{target:{value:"Bremser"}});fireEvent.change(screen.getByLabelText("Titel"),{target:{value:"Mobil fejlrapport"}});fireEvent.change(screen.getByLabelText("Beskrivelse"),{target:{value:"Bremserne afgiver en tydelig lyd ved lav fart."}});
    fireEvent.click(screen.getByRole("button",{name:"Gem kladde"}));
    await waitFor(()=>expect(repository.inspect().relations.reportDrafts.some((item)=>item.reporterId==="mobile-mette"&&item.savedStep===2)).toBe(true));
    fireEvent.click(screen.getByRole("button",{name:/Fortsæt/}));
    fireEvent.change(screen.getByLabelText(/^Kilometertal/),{target:{value:"12459"}});fireEvent.click(screen.getByLabelText("Usikker"));fireEvent.click(screen.getByRole("button",{name:/Fortsæt/}));fireEvent.click(screen.getByRole("button",{name:"Indsend indberetning"}));
    expect(await screen.findByRole("heading",{name:"Tak for din indberetning"})).toBeTruthy();
    const report=repository.inspect().relations.reports.at(-1);const item=repository.inspect().relations.cases.find((entry)=>entry.reportId===report.id);
    expect(report).toMatchObject({reporterId:"mobile-mette",origin:"mobile_local_prototype",unitId:"unit-sc-104"});expect(item.unitId).toBe(report.unitId);
    fireEvent.click(screen.getByRole("button",{name:/Følg status/}));
    expect(await screen.findByText("Din indberetning")).toBeTruthy();
    expect(screen.getByText(/Interne noter.*vises ikke/)).toBeTruthy();
  });

  it("registrerer en manuel omkostning uden at fremstille den som fakturakontrolleret",async()=>{
    const repository=start("/oekonomi");
    expect(await screen.findByRole("heading",{name:"Økonomi og flådestatistik"})).toBeTruthy();
    expect(screen.getByText("Kontraktlige ydelser")).toBeTruthy();
    fireEvent.click(screen.getByRole("button",{name:/Manuel omkostning/}));const dialog=screen.getByRole("form",{name:"Registrer manuel omkostning"});
    fireEvent.change(within(dialog).getByLabelText("Omkostningens enhed"),{target:{value:"unit-nb-002"}});fireEvent.change(within(dialog).getByLabelText("Omkostningsbeløb"),{target:{value:"825,50"}});fireEvent.change(within(dialog).getByLabelText("Omkostningsbemærkning"),{target:{value:"Manuel energiopgørelse"}});fireEvent.click(within(dialog).getByRole("button",{name:"Gem post"}));
    await waitFor(()=>expect(repository.inspect().relations.costs.some((item)=>item.source==="manual_local"&&item.amountMinor===82550)).toBe(true));
    expect(await screen.findByText(/ikke fakturakontrolleret/)).toBeTruthy();
  });

  it("gemmer leasingens billedændring på den samme enhed og efterlader intet ved annullering",async()=>{
    const repository=createMemoryUnitRepository();const original=repository.inspect().units.find((item)=>item.id==="unit-nb-001").image;
    start("/leasing/lease-demo-nb-001",repository,{imageProcessor:async(file)=>({blob:file,name:file.name,type:file.type,width:800,height:500})});
    await screen.findByRole("heading",{name:/NB-001 · Leasingaftale/});fireEvent.click(screen.getByRole("button",{name:"Rediger aftale"}));let dialog=screen.getByRole("form",{name:/Rediger/});
    fireEvent.change(within(dialog).getByLabelText("Vælg enhedsbillede fra Leasing"),{target:{files:[new File(["cancel"],"cancel.png",{type:"image/png"})]}});await screen.findByAltText("Billede af NB-001");vi.spyOn(window,"confirm").mockReturnValue(true);fireEvent.click(within(dialog).getByRole("button",{name:"Annuller"}));expect(repository.inspect().units.find((item)=>item.id==="unit-nb-001").image).toEqual(original);
    fireEvent.click(screen.getByRole("button",{name:"Rediger aftale"}));dialog=screen.getByRole("form",{name:/Rediger/});const file=new File(["saved"],"shared-unit.png",{type:"image/png"});fireEvent.change(within(dialog).getByLabelText("Vælg enhedsbillede fra Leasing"),{target:{files:[file]}});await within(dialog).findByAltText("Billede af NB-001");fireEvent.click(within(dialog).getByRole("button",{name:"Gem aftale"}));
    await waitFor(()=>expect(repository.inspect().units.find((item)=>item.id==="unit-nb-001").image?.name).toBe("shared-unit.png"));expect(repository.inspect().relations.leases.find((item)=>item.id==="lease-demo-nb-001").image).toBeUndefined();
  });
});
