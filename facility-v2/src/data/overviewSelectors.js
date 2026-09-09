const DAY_MS = 24 * 60 * 60 * 1000;
const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'Maj', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dec'];

function parseDate(value) {
  return new Date(`${value.slice(0, 10)}T00:00:00Z`);
}

function indexBy(items) {
  return new Map(items.map((item) => [item.id, item]));
}

export function selectOverview(dataset, userId) {
  const properties = (dataset.properties ?? []).filter((item) => !item.archivedAt);
  const installations = dataset.installations ?? [];
  const cases = dataset.cases ?? [];
  const tasks = dataset.tasks ?? [];
  const serviceOccurrences = dataset.serviceOccurrences ?? [];
  const costs = dataset.costs ?? [];
  const referenceDate = parseDate(dataset.referenceDate);
  const upcomingLimit = new Date(referenceDate.getTime() + 30 * DAY_MS);
  const propertyById = indexBy(properties);
  const installationById = indexBy(installations);
  const registeredCosts = costs.filter((cost) => (
    cost.kind === 'registered_demo'
    && cost.currency === dataset.financialPeriod.currency
    && cost.date >= dataset.financialPeriod.from
    && cost.date <= dataset.financialPeriod.to
  ));
  const upcomingService = serviceOccurrences
    .filter((item) => item.status === 'planned')
    .filter((item) => {
      const due = parseDate(item.dueDate);
      return due >= referenceDate && due <= upcomingLimit;
    })
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .map((item) => ({
      ...item,
      property: propertyById.get(item.propertyId),
      installation: installationById.get(item.installationId),
    }));

  const monthlyCosts = MONTH_LABELS.map((label, month) => ({
    label,
    amount: registeredCosts
      .filter((cost) => Number(cost.date.slice(5, 7)) - 1 === month)
      .reduce((sum, cost) => sum + cost.amount, 0),
  }));

  return {
    propertyCount: properties.length,
    openCaseCount: cases.filter((item) => item.status !== 'closed').length,
    upcomingServiceCount: upcomingService.length,
    registeredCostTotal: registeredCosts.reduce((sum, cost) => sum + cost.amount, 0),
    recentProperties: [...properties]
      .sort((a, b) => b.registeredAt.localeCompare(a.registeredAt))
      .slice(0, 4),
    myTasks: tasks
      .filter((item) => item.assigneeId === userId && item.status !== 'completed')
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
      .map((item) => ({
        ...item,
        property: propertyById.get(item.propertyId),
        installation: installationById.get(item.installationId),
        caseRecord: cases.find((entry) => entry.id === item.caseId),
      })),
    upcomingService,
    monthlyCosts,
    costHasData: registeredCosts.length > 0,
    serviceHasData: upcomingService.length > 0,
  };
}

export function formatMoney(amount, currency = 'DKK') {
  return new Intl.NumberFormat('da-DK', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}
