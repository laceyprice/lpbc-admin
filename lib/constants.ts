// Shared canonical option lists used across multiple admin forms so they
// stay in sync (e.g. Invoices & Quotes and the Materials List planning form
// should always offer the exact same "Service Type" choices).

// Invoice/quote billing type — mirrors what's used on Invoices & Quotes.
export const SERVICES = ['Service', 'Draw']

// Suggested categories for the Expenses page (free text is still allowed).
export const EXPENSE_CATEGORIES = {
  business: ['Software & Tech', 'Phone & Internet', 'Insurance', 'Rent / Building', 'Utilities', 'Vehicles & Fuel', 'Payroll & Contract Labor', 'Subcontractors', 'Marketing & Advertising', 'Licenses & Permits', 'Professional Services', 'Banking & Fees', 'Supplies & Materials', 'Tools & Equipment', 'Loans & Financing', 'Other'],
  personal: ['Housing', 'Utilities', 'Insurance', 'Subscriptions & Streaming', 'Vehicles', 'Groceries & Household', 'Healthcare', 'Kids & Education', 'Debt Payments', 'Phone & Internet', 'Other'],
}

export const EXPENSE_FREQUENCIES: { value: string; label: string }[] = [
  { value: 'monthly', label: 'Monthly' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'biweekly', label: 'Every 2 weeks' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'semiannual', label: 'Twice a year' },
  { value: 'annual', label: 'Yearly' },
  { value: 'one_time', label: 'One-time' },
]
