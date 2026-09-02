export type FieldType = 'signature' | 'initials' | 'date' | 'name'

// A signature field placed on a document. x/y/w/h are fractions (0..1) of the
// page box so they map at any render width.
export interface PlacedField {
  id: string
  signer_id: string
  page: number
  x: number
  y: number
  w: number
  h: number
  type: FieldType
}

export const FIELD_LABEL: Record<FieldType, string> = { signature: 'Sign', initials: 'Initials', date: 'Date', name: 'Printed Name' }
export const FIELD_DEFAULT_W: Record<FieldType, number> = { signature: 0.26, initials: 0.12, date: 0.16, name: 0.26 }
export const FIELD_DEFAULT_H = 0.06

// Distinct colors per recipient, cycled by index.
export const SIGNER_COLORS = ['#2f5a5e', '#b8895a', '#185FA5', '#7c3aed', '#0d9488', '#c2410c', '#be123c', '#4d7c0f']
export const signerColor = (i: number) => SIGNER_COLORS[i % SIGNER_COLORS.length]
