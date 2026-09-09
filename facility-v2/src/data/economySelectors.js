export function economyEntries(dataset) {
  const base = dataset.costs.map((item) => ({ ...item, sourceId: item.id, amountType: item.kind, vatBasis: item.vatBasis ?? 'Ekskl. moms', sourceLabel: item.source ?? (item.kind === 'registered_demo' ? 'Registreret demoomkostning' : item.kind === 'budget' ? 'Budget' : 'Estimat') }));
  const taskEntries = dataset.tasks.flatMap((task) => [
    ...task.timeEntries.map((entry) => ({ id: `time:${entry.id}`, sourceId: entry.id, propertyId: task.propertyId, installationId: task.installationId, caseId: task.caseId, date: entry.date, category: 'Intern tid', amountType: 'internal_time', amount: entry.hourlyCost === null ? null : entry.hours * entry.hourlyCost, hours: entry.hours, currency: 'DKK', vatBasis: 'Ekskl. moms', sourceLabel: entry.hourlyCost === null ? 'Registrerede timer · ukendt kostsats' : 'Registreret intern tid' })),
    ...task.materials.map((entry) => ({ id: `material:${entry.id}`, sourceId: entry.id, propertyId: task.propertyId, installationId: task.installationId, caseId: task.caseId, date: task.completedAt?.slice(0, 10) || task.dueDate, category: 'Materialer', amountType: 'materials', amount: entry.total, currency: 'DKK', vatBasis: 'Ekskl. moms', sourceLabel: entry.total === null ? 'Registreret materiale · ukendt kostpris' : 'Registrerede materialer' })),
    ...(task.amount === null ? [] : [{ id: `task-amount:${task.id}`, sourceId: task.id, propertyId: task.propertyId, installationId: task.installationId, caseId: task.caseId, date: task.dueDate, category: task.amountType === 'quote' ? 'Tilbud' : 'Estimat', amountType: task.amountType, amount: task.amount, currency: 'DKK', vatBasis: 'Ekskl. moms', sourceLabel: task.amountType === 'quote' ? 'Leverandørtilbud · ikke faktisk omkostning' : 'Opgaveestimat' }]),
  ]);
  return [...base, ...taskEntries];
}

export function summarizeEconomy(entries) {
  const actualTypes = new Set(['registered_demo', 'registered_manual', 'internal_time', 'materials']);
  const sum = (types) => entries.filter((item) => types.has(item.amountType) && item.amount !== null).reduce((total, item) => total + item.amount, 0);
  return { registered: sum(actualTypes), budget: sum(new Set(['budget'])), estimate: sum(new Set(['estimate'])), quote: sum(new Set(['quote'])), unknownCostHours: entries.filter((item) => item.amountType === 'internal_time' && item.amount === null).reduce((total, item) => total + item.hours, 0) };
}
