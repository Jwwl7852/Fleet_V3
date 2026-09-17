import { useEffect, useMemo, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { harPerm, PERM } from "../permissions.js";
import { harModul } from "../moduler.js";
import { useFleet } from "../FleetContext.jsx";
import { useListe } from "../useListe.js";
import { usePost } from "../usePost.js";
import { DEMO_INDKOEBSBEHOV, DEMO_INDKOEBSORDRER } from "../demo-procure.js";
import { DEMO_FAKTURAER, DEMO_LEVERANDOERER } from "../demo-indkoeb.js";
import {
  DEMO_APPROVALS, DEMO_CATALOG, DEMO_INVOICES, DEMO_NEEDS, DEMO_ORDERS,
  DEMO_INVENTORY_MOVEMENTS, DEMO_QR_LABELS, DEMO_RECEIPTS, DEMO_RULES, DEMO_SUPPLIERS,
} from "./procure-v2-demo.js";
import {
  ApprovalsScreen, CatalogScreen, ConsumptionScreen, GroupConsumptionScreen,
  OrdersScreen, OverviewScreen, ReceiptScreen,
} from "./ProcureScreens.jsx";
import MobileOrderScreen from "./MobileOrderScreen.jsx";
import QrLabelScreen from "./QrLabelScreen.jsx";
import ProcurementWorkspaceScreen from "./ProcurementWorkspaceScreen.jsx";
import MobileReceiptScreen from "./MobileReceiptScreen.jsx";
import InventoryScreen from "./InventoryScreen.jsx";
import SendOrderScreenV2 from "./SendOrderScreenV2.jsx";
import NewPurchaseScreen from "./NewPurchaseScreen.jsx";
import ProcureSetupScreen, { DEMO_SETUP, EMPTY_SETUP } from "./ProcureSetupScreen.jsx";
import { loadProcureSetup } from "./procure-v2-adapter.js";
import "./procure-v2.css";

const normalizeSupplier = (supplier) => ({
  id: supplier.id,
  name: supplier.name || supplier.navn,
  orderEmail: supplier.orderEmail || supplier.ordreEmail || supplier.kontaktEmail,
  address: supplier.address || supplier.adresse || "Adresse ikke registreret",
  agreement: supplier.agreement || supplier.prisaftale || null,
  orderMethod: supplier.orderMethod || ({ mail: "email", webshop: "webshop", begge: "both" }[supplier.bestillingsmetode] || "email"),
  webshopUrl: supplier.webshopUrl || null,
  customerNumber: supplier.customerNumber || supplier.kundenummer || null,
  responsibleBuyers: supplier.responsibleBuyers || Object.keys(supplier.ansvarligeIndkoebere || {}),
});

const normalizeNeed = (need) => need.id?.startsWith("BEH-") ? need : ({
  id: need.id, title: need.vare, departmentId: need.kilde, department: need.kilde,
  deliveryLocation: need.leveringssted || "Ikke angivet", wantedDate: need.oensketDato || "",
  status: need.status === "nyt" ? "new" : need.status, createdBy: need.oprettetAf,
  note: need.note || "", links: [],
  lines: [{ id: `${need.id}-line`, name: need.vare, quantity: need.antal || 1, unit: need.enhed || "stk." }],
});

const normalizeCatalogItem = (item) => ({
  id: item.id, sku: item.varenummer || item.id, name: item.navn,
  category: item.varegruppe || "Ukategoriseret", supplierId: item.leverandoerId || null,
  unit: item.enhed || "stk.", packageSize: item.pakningsstoerrelse || item.enhed || "stk.",
  unitPriceOere: Number(item.indkoebsprisOere || 0), favorite: Boolean(item.favorit),
  orderUnit: item.bestillingsenhed || item.enhed || "stk.", baseUnit: item.grundenhed || item.enhed || "stk.",
  unitsPerOrder: Number(item.antalPrBestillingsenhed || 1), orderPriceOere: Number(item.bestillingsprisOere || item.indkoebsprisOere || 0),
  minimumOrderQuantity: Number(item.minimumsantal || 1), orderStep: Number(item.bestillingstrin || 1), allowSingles: item.enkeltsalg !== false,
  boughtBefore: Boolean(item.tidligereKoeb), visual: item.billedeType || "other",
  active: item.aktiv !== false, defaultDepartmentId: item.standardAfdelingId || null,
  stocked: item.lagerfoert === true, minimumStock: Number.isFinite(item.minimumBeholdning) ? item.minimumBeholdning : null,
  inventoryLocations: Object.fromEntries(Object.entries(item.lagerplaceringer || {}).map(([key, row]) => [key, {
    warehouseId: row.lagerId, warehouse: row.lager, locationId: row.placeringId, location: row.placering,
    quantity: Number.isFinite(row.beholdning) ? row.beholdning : null, unit: row.enhed || item.grundenhed || item.enhed,
    revision: Number(row.revision || 0), lastCountedAt: row.senestOptaltMs || null, lastMovedAt: row.senestBevaegetMs || null,
    departmentId: row.afdelingId || item.standardAfdelingId || null,
  }])),
});

const normalizeOrder = (order) => order.poNumber ? order : ({
  id: order.id, poNumber: order.nummer, supplierId: order.leverandoerId,
  title: order.note || "Bestilling", departmentId: order.afdelingId || "ukendt",
  department: order.afdeling || "Ikke angivet", deliveryLocation: order.leveringssted || "Ikke angivet",
  deliveryAddress: order.leveringsadresse || "", deliveryPostalCode: order.leveringspostnr || "", deliveryCity: order.leveringsby || "",
  wantedDate: order.oensketDato || "", asSoonAsPossible: Boolean(order.hurtigstMuligt),
  contact: order.bestillerNavn || "", contactEmail: order.bestillerEmail || "",
  revision: order.revision || 1,
  approvedRevision: order.godkendtRevision || (["godkendt", "sendt", "modtaget"].includes(order.status) ? (order.revision || 1) : null),
  approvalStatus: order.status === "afventerGodkendelse" ? "pending" : order.status === "afvist" ? "rejected" : "approved",
  status: order.status, sendStatus: order.status === "sendt" ? (order.bestillingsmetode === "webshop" ? "webshop-registered" : "accepted") : "draft",
  supplierConfirmationStatus: order.leverandoerBekraeftet ? "confirmed" : "pending",
  orderMethod: order.bestillingsmetode || null,
  paymentStatus: order.betaling?.oekonomistatus === "afventerDokumentation" ? "Afventer dokumentation" : order.betaling?.oekonomistatus || "Ikke registreret",
  paymentDocumentRef: order.betaling?.dokumentId || null,
  webshopOrder: Object.values(order.webshop?.registreringer || {}).sort((a, b) => Number(b.registreretMs || 0) - Number(a.registreretMs || 0))[0] || null,
  lines: Object.entries(order.linjer || {}).map(([id, line]) => ({ id, itemId: line.forbrugsvareId || line.vareId || line.itemId, sku: line.varenummer, name: line.vare, categorySnapshot: line.varegruppe || "Ukategoriseret", departmentId: line.afdelingId || order.afdelingId || "", department: line.afdeling || order.afdeling || "", quantity: line.antal, unit: line.enhed || "stk.", unitPriceOere: line.prisPrEnhedOere || 0, priceBasis: line.prisgrundlag || "Historisk pris" })),
  history: [],
});

const receiptsFromOrders = (orders) => orders.flatMap((order) => Object.entries(order.modtagelser || {})
  .filter(([, receipt]) => receipt.status === "registreret")
  .map(([id, receipt]) => ({
    id, orderId: order.id, receivedDate: receipt.modtagetDato, receivedBy: receipt.modtagetAfNavn,
    deliveryNote: receipt.foelgeseddel || "", note: receipt.note || receipt.begrundelse || "",
    type: receipt.type, correctionOf: receipt.korrektionAf,
    lines: Object.values(receipt.linjer || {}).map((line) => ({
      orderLineId: line.ordrelinjeId, deliveredQuantity: line.leveretAntal,
      acceptedQuantity: line.godkendtAntal, damagedQuantity: line.beskadigetAntal,
      rejectedQuantity: line.afvistAntal, unit: line.enhed,
    })),
    attachments: Object.values(receipt.dokumenter || {}).filter((doc) => doc.status === "aktiv")
      .map((doc) => ({ id: doc.dokumentId, name: doc.originaltFilnavn, sha256: doc.sha256 })),
  })));

const normalizeInvoice = (invoice) => invoice.invoiceNumber ? invoice : ({
  ...invoice, invoiceNumber: invoice.fakturanummer, supplierId: invoice.leverandoerId,
  orderId: invoice.destinationArt === "procure" ? invoice.destinationId : null,
  approvalStatus: invoice.status === "godkendt" || invoice.status === "bogfoert" ? "approved" : invoice.status,
  approvedAt: invoice.godkendtMs || invoice.fakturadatoMs, type: invoice.fakturatype || "invoice",
  lines: Object.values(invoice.linjer || {}).map((line) => ({
    orderLineId: line.ordrelinjeId, itemId: line.vareId, categorySnapshot: line.varegruppe,
    quantity: line.antal, unit: line.enhed, unitPriceOere: line.prisPrEnhedOere,
  })),
});

const normalizeApprovalCase = (approval) => {
  const lines = Object.entries(approval.lines || {}).map(([id, line]) => ({ id, ...line, name: line.name || line.vare, quantity: Number(line.requestedQuantity || line.quantity || 0), unit: line.orderUnit || line.unit || "stk.", unitPriceOere: Number(line.unitPriceOere || 0) }));
  const eventLabels = { submitted: "Sendt til godkendelse", approve: "Godkendt", defer: "Udskudt", return: "Sendt tilbage til rettelse", reject: "Afvist" };
  return ({
  id: approval.id, reference: approval.reference || null, orderId: null, needId: approval.reference || approval.id, title: "Indsendte varelinjer",
  requester: approval.submittedByName || "Medarbejder", department: approval.department || "Ikke angivet",
  departmentId: approval.departmentId || null, deliveryLocation: approval.deliveryLocation || "Ikke angivet",
  wantedDate: approval.wantedDate || "", asSoonAsPossible: Boolean(approval.asSoonAsPossible),
  reason: "Udvalgte linjer fra en servergemt indkøbsliste.",
  rule: `Godkendelsesgrundlag for hele listen: ${new Intl.NumberFormat("da-DK", { style: "currency", currency: "DKK" }).format(Number(approval.approvalBasisOere || 0) / 100)}`,
  approvalBasisOere: Number(approval.approvalBasisOere || 0), revision: Number(approval.revision || 1),
  status: ["pending", "partially-approved"].includes(approval.status) ? "pending" : approval.status,
  submittedAt: approval.submittedAt ? new Date(approval.submittedAt).toLocaleString("da-DK") : "",
  lines, draftLines: lines,
  history: Object.values(approval.history || {}).sort((a, b) => Number(a.at || 0) - Number(b.at || 0)).map((event) => ({ at: event.at ? new Date(event.at).toLocaleString("da-DK") : "", actor: event.actorName || (event.action === "submitted" ? "Medarbejder" : "Godkender"), action: eventLabels[event.action] || event.action })),
  });
};

const normalizePurchases = (rows = []) => {
  const groups = new Map();
  for (const row of rows.filter((item) => item.koebId && item.koebstype === "alleredeForetaget")) {
    const current = groups.get(row.koebId) || { id: row.koebId, reference: row.koebReference || row.koebId,
      recordType: "purchase", supplierId: row.leverandoerId, purchaseDate: row.dato, paymentMethod: row.betalingsmetode || row.betalingsform,
      status: row.udgiftsstatus || "afventerGodkendelse", economyStatus: row.oekonomistatus || "ikkeBogfoert",
      receiptStatus: row.kvitteringsstatus || (row.bilagId ? "vedhaeftet" : "mangler"), documentId: row.bilagId || null,
      createdByName: row.oprettetAfNavn || "Medarbejder", createdAt: row.oprettetMs, lines: [] };
    current.lines.push({ id: row.id, itemId: row.vareId, sku: row.varenummer, name: row.vare, quantity: row.antal,
      unit: row.enhed, unitPriceOere: Number(row.prisPrEnhedOere || 0), amountOere: Number(row.beloebOere ?? Math.round(Number(row.antal || 0) * Number(row.prisPrEnhedOere || 0))),
      departmentId: row.afdelingId, department: row.afdeling, stocked: row.lagerfoert === true });
    if (row.bilagId) { current.documentId = row.bilagId; current.receiptStatus = "vedhaeftet"; }
    groups.set(row.koebId, current);
  }
  return [...groups.values()];
};

export default function ProcureModule() {
  const location = useLocation();
  const { bruger, demo, tenant, moduler } = useFleet();
  const path = location.pathname.replace(/\/$/, "");
  const resourceCatalog = path === "/ressourcer/varekatalog";
  const canRead = harPerm(bruger?.perms, PERM.indkoebLaes)
    && (!resourceCatalog || harModul(moduler, "indkoeb") || harModul(moduler, "warehouse"));
  const canWrite = harPerm(bruger?.perms, PERM.indkoebSkriv)
    || (resourceCatalog && harModul(moduler, "warehouse") && harPerm(bruger?.perms, PERM.varerSkriv));
  const canApprove = harPerm(bruger?.perms, PERM.indkoebGodkend);
  const canAdmin = harPerm(bruger?.perms, PERM.brugereSkriv);
  const needsSource = useListe("indkoebsbehov", { vindue: "alle", graense: 500, demo: DEMO_INDKOEBSBEHOV });
  const ordersSource = useListe("indkoebsordrer", { vindue: "alle", graense: 500, demo: DEMO_INDKOEBSORDRER });
  const suppliersSource = useListe("leverandoerer", { vindue: "alle", graense: 500, demo: DEMO_LEVERANDOERER });
  const catalogSource = useListe("forbrugsvarer", { vindue: "alle", graense: 500, demo: [] });
  const resourceCategoriesSource = useListe("ressourceKategorier/varer", { vindue: "alle", graense: 500, demo: [] });
  const invoicesSource = useListe("fakturaer", { vindue: "alle", graense: 500, demo: DEMO_FAKTURAER });
  const approvalsSource = useListe("procureGodkendelsessager", { vindue: "alle", graense: 500, demo: [] });
  const inventoryMovementsSource = useListe("forbrugsvarebevaegelser", { vindue: "alle", graense: 2000, demo: [] });
  const purchasesSource = useListe("indkoeb", { vindue: "alle", graense: 1000, demo: [] });
  const companySource = usePost(null, "virksomhed", { demo: { navn: tenant?.navn || "Fjordholm Drift A/S", adresse: "Havnevej 14", postnr: "8000", by: "Aarhus C", fakturaModtagelse: "faktura@fjordholm.example" } });
  const [setup, setSetup] = useState(() => demo ? DEMO_SETUP : EMPTY_SETUP);
  const [demoState, setDemoState] = useState(() => ({
    needs: DEMO_NEEDS, orders: DEMO_ORDERS, suppliers: DEMO_SUPPLIERS,
    catalog: DEMO_CATALOG, approvals: DEMO_APPROVALS, receipts: DEMO_RECEIPTS,
    invoices: DEMO_INVOICES, rules: DEMO_RULES, qrLabels: DEMO_QR_LABELS,
    inventoryMovements: DEMO_INVENTORY_MOVEMENTS, purchases: [], setup: DEMO_SETUP,
  }));
  useEffect(() => {
    if (demo) return undefined;
    let active = true;
    loadProcureSetup().then((result) => { if (active && result.ok) setSetup({ ...EMPTY_SETUP, ...(result.data.setup || {}) }); });
    return () => { active = false; };
  }, [demo]);
  const liveState = useMemo(() => ({
    needs: needsSource.data.map(normalizeNeed), orders: ordersSource.data.map(normalizeOrder),
    suppliers: suppliersSource.data.map(normalizeSupplier), catalog: catalogSource.data.map(normalizeCatalogItem), approvals: approvalsSource.data.map(normalizeApprovalCase),
    receipts: receiptsFromOrders(ordersSource.data), invoices: invoicesSource.data.map(normalizeInvoice), rules: [],
    qrLabels: [], inventoryMovements: inventoryMovementsSource.data, purchases: normalizePurchases(purchasesSource.data),
    setup: {
      ...setup,
      varekategorier: {
        ...(setup.varekategorier || {}),
        ...Object.fromEntries(resourceCategoriesSource.data.map((row) => [row.id, {
          id: row.id, label: row.navn, active: row.aktiv !== false,
        }])),
      },
    },
  }), [needsSource.data, ordersSource.data, suppliersSource.data, catalogSource.data, invoicesSource.data, approvalsSource.data, inventoryMovementsSource.data, purchasesSource.data, resourceCategoriesSource.data, setup]);
  const state = demo ? demoState : liveState;
  const setState = (producer) => { if (demo) setDemoState((current) => typeof producer === "function" ? producer(current) : producer); };
  useEffect(() => { window.scrollTo({ top: 0, behavior: "instant" }); }, [location.pathname]);

  if (!canRead) return <section className="procure-v2 procure-denied"><h1>PROCURE</h1><p>Du har ikke adgang til indkøb. Kontakt en administrator, hvis du mener, det er en fejl.</p></section>;
  const busy = !demo && (needsSource.henter || ordersSource.henter || suppliersSource.henter || catalogSource.henter || resourceCategoriesSource.henter || invoicesSource.henter || approvalsSource.henter || inventoryMovementsSource.henter || purchasesSource.henter);
  const error = !demo && (needsSource.fejl || ordersSource.fejl || suppliersSource.fejl || catalogSource.fejl || resourceCategoriesSource.fejl || invoicesSource.fejl || approvalsSource.fejl || inventoryMovementsSource.fejl || purchasesSource.fejl);
  const tenantDetails = { ...(tenant || {}), ...(companySource.post || {}) };
  const common = { state, setState, demo, tenant: tenantDetails, user: bruger, canWrite, canApprove, canAdmin, busy: busy || companySource.henter, error: error || companySource.fejl };
  if (path === "/ressourcer/varekatalog") return <CatalogScreen {...common} />;
  if (path === "/opsaetning/ressourcer/varer") return <ProcureSetupScreen {...common} />;
  if (path === "/indkoeb") return <OverviewScreen {...common} />;
  if (path === "/indkoeb/mobil/qr-maerkater") return <QrLabelScreen {...common} />;
  if (/^\/indkoeb\/mobil\/modtag(?:\/[^/]+)?$/.test(path)) return <MobileReceiptScreen {...common} />;
  if (/^\/indkoeb\/mobil(?:\/(?:kurv|mine|scan(?:\/[^/]+)?))?$/.test(path)) return <MobileOrderScreen {...common} />;
  if (path === "/indkoeb/behov") return <Navigate to={`/indkoeb/bestillinger${location.search}`} replace />;
  if (path === "/indkoeb/katalog") return <Navigate to={`/ressourcer/varekatalog${location.search}`} replace />;
  if (path === "/indkoeb/godkendelser") return <ApprovalsScreen {...common} />;
  if (path === "/indkoeb/forbrug/varegrupper") return <GroupConsumptionScreen {...common} />;
  if (path === "/indkoeb/forbrug") return <ConsumptionScreen {...common} />;
  if (path === "/indkoeb/lager") return <InventoryScreen {...common} />;
  if (path === "/indkoeb/opsaetning") return <Navigate to={`/opsaetning/ressourcer/varer${location.search}`} replace />;
  if (/^\/indkoeb\/modtagelser(?:\/[^/]+)?$/.test(path)) return <ReceiptScreen {...common} />;
  if (/^\/indkoeb\/bestillinger\/[^/]+\/send$/.test(path)) return <SendOrderScreenV2 {...common} />;
  if (path === "/indkoeb/bestillinger/ny") return <NewPurchaseScreen {...common} />;
  if (path === "/indkoeb/bestillinger") return <ProcurementWorkspaceScreen {...common} />;
  if (/^\/indkoeb\/bestillinger\/[^/]+$/.test(path)) return <OrdersScreen {...common} />;
  if (path === "/indkoeb/varer") return <Navigate to="/ressourcer/varekatalog" replace />;
  if (path === "/indkoeb/statistik") return <Navigate to="/indkoeb/forbrug" replace />;
  if (path === "/indkoeb/arkiv") return <Navigate to="/indkoeb/bestillinger?status=afsluttet" replace />;
  if (path === "/indkoeb/varelager") return <Navigate to="/indkoeb/lager" replace />;
  return <Navigate to="/indkoeb" replace />;
}
