export type ItemType = 'book' | 'magazine' | 'bundle';
export type MetaType = 'book' | 'magazine' | 'product';

export interface ScanMeta {
  type: MetaType;
  title?: string | null;
  barcode?: string | null;
  barcode_addon?: string | null;
  isbn13?: string | null;
  coverUrl?: string | null;
  // add other fields as needed by upsertItem
}
