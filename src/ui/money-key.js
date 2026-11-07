// COPY-DRAFT: shared explanations of the separate city and globe money.
export const MONEY_KEY_CITY = 'Treasury on the globe is kept apart from city Cash and is not counted in NAV.';
export const MONEY_KEY_GLOBE = 'Treasury pays for routes and collects export earnings, and city Cash and NAV leave it out.';

export function cityMoneyKeyHtml() {
  return `<p class="settle-fab__money" data-money-key="city">${MONEY_KEY_CITY}</p>`;
}
