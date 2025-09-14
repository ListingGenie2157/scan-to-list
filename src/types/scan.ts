export type ItemType = 'book' | 'magazine' | 'bundle';
export type MetaType = 'book' | 'magazine' | 'product';

export interface ScanMeta {
  type: MetaType;
  title?: string | null;
  barcode?: string | null;
  barcode_addon?: string | null;
  isbn13?: string | null;
  coverUrl?: string | null;
  authors?: string[] | null;
  publisher?: string | null;
  year?: string | null;
  description?: string | null;
  categories?: string[] | null;
  genre?: string | null;
  condition?: string | null;
  series_title?: string | null;
  issue_number?: string | null;
  issue_date?: string | null;
}
