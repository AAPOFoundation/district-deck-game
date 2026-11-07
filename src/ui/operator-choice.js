// One chooser headline from a live modifier the rules actually consume.
// Unsupported, deferred, and no-effect attributes produce no line.

function liveAttributes(operator) {
  const attributes = Array.isArray(operator?.attributes) ? operator.attributes : [];
  return attributes.filter((attribute) => attribute?.status === 'live' && attribute.modifier);
}

function ruleKeys(attribute) {
  return Array.isArray(attribute?.ruleKeys) ? attribute.ruleKeys : [];
}

function actionHeadline(attribute) {
  if (!ruleKeys(attribute).includes('actionsPerQuarter')) return '';
  const add = attribute.modifier.add;
  if (!Number.isFinite(add) || add === 0) return '';
  const count = Math.abs(add);
  return `${add > 0 ? '+' : '−'}${count} ${count === 1 ? 'action' : 'actions'} per quarter`;
}

function worksHeadline(attribute) {
  const keys = ruleKeys(attribute);
  if (!keys.includes('renovateCostBp') || !keys.includes('redevelopCostBp')) return '';
  const multiplyBp = attribute.modifier.multiplyBp;
  if (!Number.isFinite(multiplyBp) || multiplyBp <= 0 || multiplyBp >= 10_000) return '';
  const percent = (10_000 - multiplyBp) / 100;
  const shown = Number.isInteger(percent) ? String(percent) : String(Math.round(percent * 10) / 10);
  return `${shown}% lower base renovation/redevelopment cost`;
}

function overdraftHeadline(attribute) {
  if (!ruleKeys(attribute).includes('overdraftInterestBp')) return '';
  const add = attribute.modifier.add;
  if (!Number.isFinite(add) || add >= 0) return '';
  return `${Math.abs(add)} bp lower overdraft interest`;
}

export function liveOperatorDifferenceLabels(operator) {
  const attributes = liveAttributes(operator);
  for (const read of [actionHeadline, worksHeadline, overdraftHeadline]) {
    for (const attribute of attributes) {
      const headline = read(attribute);
      if (headline) return [headline];
    }
  }
  return [];
}
