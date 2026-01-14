export interface PhotoInfo {
  id?: string | number;
  public_url: string | null;
  thumb_url?: string | null;
}

export interface InventoryItem {
  id: string;
  user_id?: string;
  title: string | null;
  author: string | null;
  status: string;
  suggested_category: string | null;
  suggested_price: number | null;
  suggested_title: string | null;
  publisher: string | null;
  publication_year: number | null;
  condition_assessment: string | null;
  genre: string | null;
  isbn: string | null;
  issue_number: string | null;
  issue_date: string | null;
  series_title: string | null;
  created_at: string;
  photos: PhotoInfo | PhotoInfo[] | null;
  confidence_score: number | null;
  type?: string | null;
  quantity?: number | null;
  last_scanned_at?: string | null;
  amazon_asin?: string | null;
  amazon_title?: string | null;
  amazon_match_confidence?: number | null;
  description?: string | null;
  photo_id?: string | number | null;
  subtitle?: string | null;
}
