// Per-business constants used by shared features (texts, emails, pages). The two apps keep
// IDENTICAL code everywhere else — only this file differs. No env access: safe on client and server.
export const BUSINESS = {
  name: 'L. Price Building Company',
  owner: 'Lacey',
  phone: '850-598-9128',
  email: 'Lacey@LaceyNPrice.com',
  brand: '#b8895a',
  brandDark: '#2f5a5e',
  // "Time on the job" jobs are priced per invoice in this business.
  jobWord: 'job',
}
