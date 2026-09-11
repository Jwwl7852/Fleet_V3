import { useEffect, useMemo, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { harPerm, PERM } from "../permissions.js";
import { useFleet } from "../FleetContext.jsx";
import { useListe } from "../useListe.js";
import { DEMO_INDKOEBSBEHOV, DEMO_INDKOEBSORDRER } from "../demo-procure.js";
import { DEMO_FAKTURAER, DEMO_LEVERANDOERER } from "../demo-indkoeb.js";
import {
  DEMO_APPROVALS, DEMO_CATALOG, DEMO_INVOICES, DEMO_NEEDS, DEMO_ORDERS,
  DEMO_QR_LABELS, DEMO_RECEIPTS, DEMO_RULES, DEMO_SUPPLIERS,
} from "./procure-v2-demo.js";
import {
  ApprovalsScreen, CatalogScreen, ConsumptionScreen, GroupConsumptionScreen,
  OrdersScreen, OverviewScreen, ReceiptScreen,
} from "./ProcureScreens.jsx";
import MobileOrderScreen from "./MobileOrderScreen.jsx";
import QrLabelScreen from "./QrLabelScreen.jsx";
import ProcurementWorkspaceScreen from "./ProcurementWorkspaceScreen.jsx";
import MobileReceiptScreen from "./MobileReceiptScreen.jsx";
import SendOrderScreenV2 from "./SendOrderScreenV2.jsx";
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
});

const normalizeOrder = (order) => order.poNumber ? order : ({
  id: order.id, poNumber: order.nummer, supplierId: order.leverandoerId,
  title: order.note || "Bestilling", departmentId: order.afdelingId || "ukendt",
  department: order.afdeling || "Ikke angivet", deliveryLocation: order.leveringssted || "Ikke angivet",
  wantedDate: order.oensketDato || "", contact: order.bestillerId || order.oprettetAf,
  revision: order.revision || 1,
  approvedRevision: order.godkendtRevision || (["godkendt", "sendt", "modtaget"].includes(order.status) ? (order.revision || 1) : null),
  approvalStatus: order.status === "afventerGodkendelse" ? "pending" : order.status === "afvist" ? "rejected" : "approved",
  status: order.status, sendStatus: order.status === "sendt" ? "accepted" : "draft",
  supplierConfirmationStatus: order.leverandoerBekraeftet ? "confirmed" : "pending",
  lines: Object.entries(order.linjer || {}).map(([id, line]) => ({ id, itemId: line.vareId, sku: line.varenummer, name: line.vare, categorySnapshot: line.varegruppe || "Ukategoriseret", quantity: line.antal, unit: line.enhed || "stk.", unitPriceOere: line.prisPrEnhedOere || 0, priceBasis: line.prisgrundlag || "Historisk pris" })),
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

export default function ProcureModule() {
  const location = useLocation();
  const { bruger, demo, tenant } = useFleet();
  const canRead = harPerm(bruger?.perms, PERM.indkoebLaes);
  const canWrite = harPerm(bruger?.perms, PERM.indkoebSkriv);
  const canApprove = harPerm(bruger?.perms, PERM.indkoebGodkend);
  const canAdmin = harPerm(bruger?.perms, PERM.brugereSkriv);
  const needsSource = useListe("indkoebsbehov", { vindue: "alle", graense: 500, demo: DEMO_INDKOEBSBEHOV });
  const ordersSource = useListe("indkoebsordrer", { vindue: "alle", graense: 500, demo: DEMO_INDKOEBSORDRER });
  const suppliersSource = useListe("leverandoerer", { vindue: "alle", graense: 500, demo: DEMO_LEVERANDOERER });
  const catalogSource = useListe("forbrugsvarer", { vindue: "alle", graense: 500, demo: [] });
  const invoicesSource = useListe("fakturaer", { vindue: "alle", graense: 500, demo: DEMO_FAKTURAER });
  const approvalsSource = useListe("procureGodkendelsessager", { vindue: "alle", graense: 500, demo: [] });
  const [setup, setSetup] = useState(() => demo ? DEMO_SETUP : EMPTY_SETUP);
  const [demoState, setDemoState] = useState(() => ({
    needs: DEMO_NEEDS, orders: DEMO_ORDERS, suppliers: DEMO_SUPPLIERS,
    catalog: DEMO_CATALOG, approvals: DEMO_APPROVALS, receipts: DEMO_RECEIPTS,
    invoices: DEMO_INVOICES, rules: DEMO_RULES, qrLabels: DEMO_QR_LABELS, setup: DEMO_SETUP,
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
    qrLabels: [], setup,
  }), [needsSource.data, ordersSource.data, suppliersSource.data, catalogSource.data, invoicesSource.data, approvalsSource.data, setup]);
  const state = demo ? demoState : liveState;
  const setState = (producer) => { if (demo) setDemoState((current) => typeof producer === "function" ? producer(current) : producer); };
  useEffect(() => { window.scrollTo({ top: 0, behavior: "instant" }); }, [location.pathname]);

  if (!canRead) return <section className="procure-v2 procure-denied"><h1>PROCURE</h1><p>Du har ikke adgang til indkøb. Kontakt en administrator, hvis du mener, det er en fejl.</p></section>;
  const busy = !demo && (needsSource.henter || ordersSource.henter || suppliersSource.henter || catalogSource.henter || invoicesSource.henter || approvalsSource.henter);
  const error = !demo && (needsSource.fejl || ordersSource.fejl || suppliersSource.fejl || catalogSource.fejl || invoicesSource.fejl || approvalsSource.fejl);
  const common = { state, setState, demo, tenant, user: bruger, canWrite, canApprove, canAdmin, busy, error };
  const path = location.pathname.replace(/\/$/, "");
  if (path === "/indkoeb") return <OverviewScreen {...common} />;
  if (path === "/indkoeb/mobil/qr-maerkater") return <QrLabelScreen {...common} />;
  if (/^\/indkoeb\/mobil\/modtag(?:\/[^/]+)?$/.test(path)) return <MobileReceiptScreen {...common} />;
  if (/^\/indkoeb\/mobil(?:\/(?:kurv|mine|scan(?:\/[^/]+)?))?$/.test(path)) return <MobileOrderScreen {...common} />;
  if (path === "/indkoeb/behov") return <Navigate to={`/indkoeb/bestillinger${location.search}`} replace />;
  if (path === "/indkoeb/katalog") return <CatalogScreen {...common} />;
  if (path === "/indkoeb/godkendelser") return <ApprovalsScreen {...common} />;
  if (path === "/indkoeb/forbrug/varegrupper") return <GroupConsumptionScreen {...common} />;
  if (path === "/indkoeb/forbrug") return <ConsumptionScreen {...common} />;
  if (path === "/indkoeb/opsaetning") return <ProcureSetupScreen {...common} />;
  if (/^\/indkoeb\/modtagelser(?:\/[^/]+)?$/.test(path)) return <ReceiptScreen {...common} />;
  if (/^\/indkoeb\/bestillinger\/[^/]+\/send$/.test(path)) return <SendOrderScreenV2 {...common} />;
  if (path === "/indkoeb/bestillinger") return <ProcurementWorkspaceScreen {...common} />;
  if (/^\/indkoeb\/bestillinger\/[^/]+$/.test(path)) return <OrdersScreen {...common} />;
  if (path === "/indkoeb/varer") return <Navigate to="/indkoeb/katalog" replace />;
  if (path === "/indkoeb/statistik") return <Navigate to="/indkoeb/forbrug" replace />;
  if (path === "/indkoeb/arkiv") return <Navigate to="/indkoeb/bestillinger?status=afsluttet" replace />;
  return <Navigate to="/indkoeb" replace />;
}
