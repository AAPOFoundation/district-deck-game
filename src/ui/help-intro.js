// Presentation-only disclosure. Existing rules, controls and diorama hosts retain
// their DOM identity and event handlers inside the native, keyboard-operable fold.
export function enhanceHelpIntro(sheet, { quarters, opponentLabel = 'Roman Petridis' }) {
  const paper = sheet?.querySelector('.sheet__paper');
  const firstRule = paper?.querySelector('.help-h3');
  if (!paper || !firstRule || paper.querySelector('.v4-help-reference')) return;

  const intro = document.createElement('div');
  intro.className = 'v4-help-intro';
  const eyebrow = document.createElement('p');
  eyebrow.className = 'v4-eyebrow';
  eyebrow.textContent = 'Melbourne · Your campaign';
  const title = document.createElement('h2');
  title.textContent = 'Make your first move';
  const goal = document.createElement('p');
  goal.textContent = `Finish quarter ${quarters} with a higher NAV than ${opponentLabel}. NAV is your cash plus the value of your holdings, less debt; neighbouring holdings work together.`;
  intro.append(eyebrow, title, goal);
  paper.querySelector('.help-loop')?.replaceWith(intro);

  const details = document.createElement('details');
  details.className = 'v4-help-reference';
  const summary = document.createElement('summary');
  summary.textContent = 'Sound, rules and camera controls';
  details.append(summary);
  let node = firstRule;
  while (node) {
    const next = node.nextSibling;
    details.append(node);
    node = next;
  }
  paper.append(details);
}
