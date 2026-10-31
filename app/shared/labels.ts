/** Labels a visitor can read. The Dutch admin name says where each one shows up. */
export const labelFields = [
  { key: 'projects', label: 'Menu: projecten', nl: 'Projecten', en: 'Projects' },
  { key: 'saveContact', label: 'Knop: contact opslaan', nl: 'Contact opslaan', en: 'Save contact' },
  { key: 'allTags', label: 'Filter: alles', nl: 'Alles', en: 'All' },
  { key: 'client', label: 'Label bij de klant', nl: 'Klant', en: 'Client' },
  { key: 'location', label: 'Label bij de locatie', nl: 'Locatie', en: 'Location' },
  { key: 'period', label: 'Label bij de periode', nl: 'Periode', en: 'Period' },
  { key: 'role', label: 'Label bij de rol', nl: 'Rol', en: 'Role' },
  { key: 'emptyProjects', label: 'Tekst zonder projecten', nl: 'Nog geen projecten.', en: 'No projects yet.' },
  { key: 'notFound', label: 'Pagina niet gevonden', nl: 'Deze pagina bestaat niet.', en: 'This page does not exist.' },
  { key: 'dark', label: 'Knop: donker', nl: 'Donker', en: 'Dark' },
  { key: 'light', label: 'Knop: licht', nl: 'Licht', en: 'Light' },
] as const;

export type LabelKey = (typeof labelFields)[number]['key'];

export function isLabelKey(value: string): value is LabelKey {
  return labelFields.some((field) => field.key === value);
}
