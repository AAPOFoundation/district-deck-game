// City-owned import orders; globe reads this book from the live city snapshot.
export const CYBERCAB_SUPPLIER = Object.freeze({
  id: 'cybercabs-shanghai-melbourne', name: 'Shanghai Cybercab Works',
  from: 'shanghai', to: 'melbourne-inner', good: 'cybercabs', kind: 'sea',
  unitPrice: 36000, shippingQuarters: 1, arrivalLocation: 'port-yard',
});

export function cybercabSupplierBook(cityState) {
  const supplier = cityState?.cybercab?.supplier;
  return {
    ...CYBERCAB_SUPPLIER, opened: Boolean(supplier?.opened),
    openedQuarter: supplier?.openedQuarter ?? null,
    orders: (supplier?.orders ?? []).map(order => ({ ...order })),
  };
}

// Preserve saved reservations; migrate legacy yard inventory without a bay.
export function assignCybercabYardBays(business) {
  const occupied = new Set(), pending = [];
  for (const cab of business.fleet) {
    if (cab.status !== 'yard') { cab.bay = null; continue; }
    if (Number.isInteger(cab.bay) && cab.bay >= 0 && cab.bay < 12 && !occupied.has(cab.bay))
      occupied.add(cab.bay);
    else pending.push(cab);
  }
  for (const cab of pending) {
    let bay = 0;
    while (occupied.has(bay)) bay++;
    cab.bay = bay; occupied.add(bay);
  }
}

export function arriveCybercabImports(business, quarter) {
  assignCybercabYardBays(business);
  const arrivals = [];
  for (const order of business.supplier.orders) {
    if (order.status !== 'shipping' || order.arrivalQuarter > quarter) continue;
    order.status = 'yard';
    order.arrivedBeat = business.beat;
    const cab = business.fleet.find(c => c.id === order.cabId);
    const occupied = new Set(business.fleet.filter(c => c.status === 'yard').map(c => c.bay));
    let bay = 0;
    while (occupied.has(bay)) bay++;
    cab.bay = bay;
    cab.status = 'yard';
    cab.location = 'port-yard';
    arrivals.push({ kind: 'cybercab-import-arrival', id: order.id, cabId: cab.id,
      from: CYBERCAB_SUPPLIER.from, to: CYBERCAB_SUPPLIER.to,
      location: 'port-yard', quarter, beat: business.beat });
  }
  return arrivals;
}
