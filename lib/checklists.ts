// Safety / compliance checklist templates (used by the page AND the API). Edit the wording to match
// your local code requirements — these are sensible starting points, not a substitute for the code book.
export type ItemType = 'check' | 'reading' | 'text'
export type ChecklistItem = { id: string; label: string; type: ItemType; unit?: string }
export type ChecklistTemplate = { id: string; name: string; description: string; items: ChecklistItem[] }

export const CHECKLISTS: ChecklistTemplate[] = [
  {
    id: 'gas_pressure_test', name: 'Gas line pressure test', description: 'New or modified gas piping — test and sign-off.',
    items: [
      { id: 'shutoff', label: 'Gas supply shut off / isolated at the meter or tank', type: 'check' },
      { id: 'piping', label: 'Piping sized, supported and free of damage', type: 'check' },
      { id: 'gauge', label: 'Test gauge is the correct range and in good condition', type: 'check' },
      { id: 'test_psi', label: 'Test pressure applied', type: 'reading', unit: 'psi' },
      { id: 'duration', label: 'Test duration', type: 'reading', unit: 'minutes' },
      { id: 'held', label: 'Pressure held with no drop', type: 'check' },
      { id: 'leak_solution', label: 'All joints checked with approved leak-detection solution', type: 'check' },
      { id: 'no_leaks', label: 'No leaks found', type: 'check' },
      { id: 'purged', label: 'Line purged and gas turned on; pilot/ignition verified', type: 'check' },
      { id: 'customer_shown', label: 'Customer shown the gas shut-off location', type: 'check' },
      { id: 'notes', label: 'Notes', type: 'text' },
    ],
  },
  {
    id: 'appliance_install', name: 'Gas appliance installation', description: 'Water heater, range, furnace, fireplace, grill, etc.',
    items: [
      { id: 'clearances', label: 'Clearances to combustibles meet manufacturer / code', type: 'check' },
      { id: 'vent', label: 'Venting / flue installed correctly and sealed', type: 'check' },
      { id: 'air', label: 'Combustion air adequate', type: 'check' },
      { id: 'shutoff', label: 'Appliance shut-off valve and sediment trap installed', type: 'check' },
      { id: 'connector', label: 'Flexible connector approved, not kinked, not through a wall', type: 'check' },
      { id: 'inlet_psi', label: 'Inlet pressure', type: 'reading', unit: 'in. w.c.' },
      { id: 'manifold_psi', label: 'Manifold pressure', type: 'reading', unit: 'in. w.c.' },
      { id: 'leak_check', label: 'Leak-checked all connections — no leaks', type: 'check' },
      { id: 'co', label: 'CO reading at appliance', type: 'reading', unit: 'ppm' },
      { id: 'operation', label: 'Operated through a full cycle — works correctly', type: 'check' },
      { id: 'customer_demo', label: 'Customer shown operation and safety information', type: 'check' },
      { id: 'notes', label: 'Notes', type: 'text' },
    ],
  },
  {
    id: 'lp_tank', name: 'LP tank / service inspection', description: 'Propane tank set, regulator and lines.',
    items: [
      { id: 'location', label: 'Tank location, distance to buildings/ignition sources OK', type: 'check' },
      { id: 'tank_cond', label: 'Tank in good condition (no rust, dents, damage)', type: 'check' },
      { id: 'regulator', label: 'Regulator and vent clear and in good condition', type: 'check' },
      { id: 'lines', label: 'Supply line / underground line condition', type: 'check' },
      { id: 'level', label: 'Tank level', type: 'reading', unit: '%' },
      { id: 'leak_check', label: 'Leak check — no leaks', type: 'check' },
      { id: 'signage', label: 'Required labels / signage present', type: 'check' },
      { id: 'notes', label: 'Notes', type: 'text' },
    ],
  },
  {
    id: 'gas_leak_call', name: 'Gas leak / odor call', description: 'Emergency response record.',
    items: [
      { id: 'evacuated', label: 'Occupants moved to a safe area; ignition sources avoided', type: 'check' },
      { id: 'shutoff', label: 'Gas shut off at meter / tank', type: 'check' },
      { id: 'detector', label: 'Combustible-gas detector used to locate the source', type: 'check' },
      { id: 'source', label: 'Source of leak found', type: 'text' },
      { id: 'repaired', label: 'Leak repaired and re-tested — no leaks', type: 'check' },
      { id: 'relit', label: 'Gas restored and appliances relit / verified', type: 'check' },
      { id: 'utility', label: 'Utility / authority notified if required', type: 'check' },
      { id: 'notes', label: 'Notes', type: 'text' },
    ],
  },
]

export const templateById = (id: string) => CHECKLISTS.find(t => t.id === id)

/** A run passes when no yes/no item was marked "fail". Unanswered items don't fail it (the page requires answers). */
export function runPassed(template: ChecklistTemplate, answers: Record<string, any>): boolean {
  return !template.items.some(i => i.type === 'check' && answers[i.id] === 'fail')
}

/** Items that still need an answer before signing (yes/no and readings; free-text notes are optional). */
export function unanswered(template: ChecklistTemplate, answers: Record<string, any>): ChecklistItem[] {
  return template.items.filter(i => i.type !== 'text' && !String(answers[i.id] ?? '').trim())
}
