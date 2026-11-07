export function onlineHelpHtml({ quarters }) {
  return `
    <p class="help-loop"><strong>Your shared city campaign</strong></p>
    <ol class="help-steps">
      <li><strong>Select</strong> a parcel or person and read its card. A disabled move explains what is missing.</li>
      <li><strong>Plan</strong> your moves using the action allowance shown in your city header. Your operator and banked actions can change that allowance; some moves cost no action. Accepted moves join your private plan and cannot currently be undone.</li>
      <li><strong>Review</strong> with View plan. The city header shows confirmed balances. Planned purchases and service costs appear in your Cybercab desk before settlement.</li>
      <li><strong>Commit plan</strong> when ready. Your seat waits until both players commit; then the books resolve together. Reloading or reconnecting preserves the confirmed plan.</li>
    </ol>
    <p>Finish quarter ${quarters} with a higher NAV than your opponent. Cash, property equity and your Cybercab fleet contribute to your portfolio.</p>
    <h3 class="help-h3">Sound</h3>
    <div data-help-audio></div>
    <h3 class="help-h3">City planning</h3>
    <p>Property cards show purchase, tenancy, permit and works options with their cost and action requirements. Both players compete for the same city, so settlement can change an opportunity.</p>
    <p><strong>Bank</strong> spends an action to carry one into the next quarter. Unspent actions otherwise expire. If a pact needs a decision, open <strong>Pact decisions</strong> and choose whether to honour it before continuing.</p>
    <h3 class="help-h3">Your Cybercab business</h3>
    <p>Choose neighbourhood, airport or reserve dispatch for each cab. Run up to four work blocks per quarter, then maintain worn components and decide whether to buy or import another cab.</p>
    <p>The desk separates cash after planned spending, operating profit and the projected settlement cash change. Servicing costs cash and takes two work blocks once a lift is free. Imports arrive next quarter. Any remaining work blocks run when the quarter settles; earnings are paid once.</p>
    <p>Your fleet and plan are private. The other player sees your public NAV, not your uncommitted choices. Cars moving around the map illustrate the business; waiting does not add earnings.</p>
    <h3 class="help-h3">Results and reconnection</h3>
    <p>View plan shows your current cash and NAV, and the last settlement's cash change including planned spending. Complete solo-style receipt history is not available in online rooms yet.</p>
    <p><strong>Reconnect</strong> retries an interrupted request. For another device, use Room access and reconnection and keep your seat access token private. The invitation is for the other seat.</p>
    <h3 class="help-h3">Camera and play scope</h3>
    <p>Drag to pan · right-drag to orbit · + / − to zoom · F to frame the city · N to face north · Escape to close a panel.</p>
    <p>These rooms support city planning and the Cybercab business. World transfers and local arcade rewards are currently available in solo campaigns.</p>`;
}
