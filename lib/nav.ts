import { LayoutDashboard, Users, FileText, BookOpen, Calendar, CalendarDays, ClipboardList, Receipt, BarChart3, UserCog, Sparkles, MapPin, ShieldCheck, Package, FileCheck, Wallet, PenLine, KeyRound, Settings, Link2, Repeat, Car, ClipboardCheck, Hammer, Banknote, TrendingUp, SlidersHorizontal, HardHat, Landmark, FolderLock } from 'lucide-react'
import { BUSINESS } from '@/lib/business'

// The admin menu, defined once. Both apps share this file; the only per-business switch is
// BUSINESS.planStudio (LPBC's Plan & Design Studio). Group items by what you're DOING, not by table name.
export type NavItem = { href: string; label: string; icon: any; roles: string[]; exact?: boolean; matches?: string[]; badge?: 'requests' }
export type NavGroup = { id: string; label: string; icon: any; items: NavItem[] }

const STAFF = ['admin', 'bookkeeper']
const ALL = ['admin', 'bookkeeper', 'invoicing']

export const DASHBOARD: NavItem = { href: '/admin', label: 'Dashboard', icon: LayoutDashboard, exact: true, roles: ALL }

export const GROUPS: NavGroup[] = [
  {
    id: 'schedule', label: 'Schedule & Tasks', icon: CalendarDays, items: [
      { href: '/admin/calendar', label: 'Calendar', icon: Calendar, roles: STAFF },
      { href: '/admin/todo', label: 'Todo List', icon: Sparkles, roles: ALL },
      { href: '/admin/schedule-requests', label: 'Schedule Requests', icon: ClipboardList, roles: STAFF, badge: 'requests' },
      { href: '/admin/notepad', label: 'Notepad', icon: PenLine, roles: ['admin'] },
    ],
  },
  {
    id: 'customers', label: 'Customers & Sales', icon: Users, items: [
      { href: '/admin/crm', label: 'CRM & Email', icon: Users, roles: ALL },
      { href: '/admin/invoices', label: 'Invoices & Quotes', icon: FileText, roles: ALL },
      { href: '/admin/collections', label: 'Collections (Who Owes Me)', icon: Banknote, roles: STAFF },
      { href: '/admin/agreements', label: 'Service Agreements', icon: Repeat, roles: STAFF },
    ],
  },
  {
    id: 'jobs', label: 'Jobs & Field', icon: HardHat, items: [
      ...(BUSINESS.planStudio ? [{ href: '/admin/plan-job', label: 'Plan & Design Studio', icon: Hammer, roles: STAFF } as NavItem] : []),
      { href: '/admin/worksites', label: 'Worksites', icon: MapPin, roles: STAFF },
      { href: '/admin/inventory', label: 'Materials & Inventory', icon: Package, roles: STAFF },
      { href: '/admin/checklists', label: 'Safety Checklists', icon: ClipboardCheck, roles: STAFF },
      { href: '/admin/subcontractors', label: 'Subcontractors', icon: Hammer, roles: STAFF },
    ],
  },
  {
    id: 'money', label: 'Money & Taxes', icon: Landmark, items: [
      { href: '/admin/bookkeeping', label: 'Bookkeeping', icon: BookOpen, roles: STAFF },
      { href: '/admin/expenses', label: 'Expenses', icon: Wallet, roles: ['admin'] },
      { href: '/admin/job-profit', label: 'Job Profit', icon: TrendingUp, roles: STAFF },
      { href: '/admin/reports', label: 'Reports', icon: BarChart3, roles: STAFF },
      { href: '/admin/taxes', label: 'Business Tax Center', icon: Receipt, roles: STAFF },
      { href: '/admin/mileage', label: 'Mileage', icon: Car, roles: STAFF },
    ],
  },
  {
    id: 'compliance', label: 'Licenses & Docs', icon: ShieldCheck, items: [
      { href: '/admin/permits', label: 'Permits & Licensing', icon: FileCheck, roles: STAFF, matches: ['/admin/permits', '/admin/licensing'] },
      { href: '/admin/documents', label: 'Insurance & Other Docs', icon: FolderLock, roles: STAFF },
    ],
  },
]

// Admin-only.
export const SETTINGS_GROUP: NavGroup = {
  id: 'settings', label: 'Settings', icon: Settings, items: [
    { href: '/admin/users', label: 'Users', icon: UserCog, roles: ['admin'] },
    { href: '/admin/business-settings', label: 'Business Settings', icon: SlidersHorizontal, roles: ['admin'] },
    { href: '/admin/vault', label: 'Account Vault', icon: KeyRound, roles: ['admin'] },
    { href: '/admin/google-connect', label: 'Google Connection', icon: Link2, roles: ['admin'] },
  ],
}

export const isItemActive = (item: NavItem, pathname: string) =>
  item.exact ? pathname === item.href : (item.matches || [item.href]).some(m => pathname === m || pathname.startsWith(m + '/'))
