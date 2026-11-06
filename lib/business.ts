// Per-business constants used by shared features (texts, emails, pages, menu). The two apps keep
// IDENTICAL code everywhere else — only this file differs. No env access: safe on client and server.
export const BUSINESS = {
  name: 'L. Price Building Company',
  shortName: 'L. Price Building Co.',   // sidebar header
  owner: 'Lacey',
  phone: '850-598-9128',
  email: 'Lacey@LaceyNPrice.com',
  brand: '#b8895a',
  brandDark: '#2f5a5e',
  logo: '/logo.png',
  planStudio: true,                      // LPBC only: Plan & Design Studio in the menu
}
