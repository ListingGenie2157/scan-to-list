import { useState, useEffect, forwardRef, useImperativeHandle, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Search, Filter, Package, Clock, CheckCircle, Calendar, BookOpen, Grid3X3, List, LayoutGrid, Edit3, Download, Trash2, Plus, DollarSign, Edit, ExternalLink, Settings } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/components/ui/use-toast";
import { CreateListingModal } from "@/components/CreateListingModal";
import { BulkListingModal } from "@/components/BulkListingModal";
import { BulkEditModal } from "@/components/BulkEditModal";
import EbayPricingModal from "@/components/EbayPricingModal";
import { AsinMatchModal } from "@/components/AsinMatchModal";
import { ItemEditModal } from "@/components/ItemEditModal";
import type { InventoryItem, PhotoInfo } from "@/types/inventory";

interface InventoryRow {
  id: string | number;
  title: string | null;
  subtitle?: string | null;
  author: string | null;
  status: string | null;
  suggested_category: string | null;
  suggested_price: number | null;
  publisher: string | null;
  publication_year: number | null;
  isbn: string | null;
  created_at: string;
  amazon_asin: string | null;
  amazon_title: string | null;
  amazon_match_confidence: number | null;
  photo_id: string | null;
  genre: string | null;
  series_title: string | null;
  issue_number: string | null;
  issue_date: string | null;
  suggested_title: string | null;
  confidence_score?: number | null;
  condition_assessment?: string | null;
}

interface PhotoRow {
  id: string;
  public_url: string | null;
  thumb_url: string | null;
  url_public?: string | null;
}

interface OldItemRow {
  id: string | number;
  title: string | null;
  authors: string[] | null;
  status: string | null;
  type: string | null;
  quantity: number | null;
  last_scanned_at: string | null;
  created_at: string;
  publisher: string | null;
  year: number | null;
  isbn13: string | null;
  suggested_price: number | null;
  photos: PhotoInfo[] | null;
}

export interface InventoryGridRef {
  refreshInventory: () => void;
}

export const InventoryGrid = forwardRef<InventoryGridRef>((props, ref) => {
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"grid" | "compact" | "list">("grid");
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [isCreateListingModalOpen, setIsCreateListingModalOpen] = useState(false);
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [isBulkListingModalOpen, setIsBulkListingModalOpen] = useState(false);
  const [isBulkEditModalOpen, setIsBulkEditModalOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isPricingModalOpen, setIsPricingModalOpen] = useState(false);
  const [pricingItem, setPricingItem] = useState<InventoryItem | null>(null);
  const [isAsinMatchModalOpen, setIsAsinMatchModalOpen] = useState(false);
  const [asinMatchItem, setAsinMatchItem] = useState<InventoryItem | null>(null);
  const [editModalItem, setEditModalItem] = useState<InventoryItem | null>(null);
  const { toast } = useToast();

  const fetchInventory = useCallback(async () => {
    try {
      // Try to fetch from inventory_items first (new table structure)
      const { data: inventoryData, error: inventoryError } = await supabase
        .from('inventory_items')
        .select(`
          id,
          title,
          subtitle,
          author,
          status,
          suggested_category,
          suggested_price,
          publisher,
          publication_year,
          isbn,
          created_at,
          amazon_asin,
          amazon_title,
          amazon_match_confidence,
          photo_id,
          genre,
          series_title,
          issue_number,
          issue_date,
          suggested_title
        `)
        .eq('user_id', user?.id)
        .in('status', ['photographed', 'processed'])
        .order('created_at', { ascending: false });

      if (!inventoryError && inventoryData && inventoryData.length > 0) {
        // New inventory_items structure
        const photoIds = inventoryData.map(item => item.photo_id).filter(Boolean);

        // Fetch photos for all items at once
        let photosMap: Record<string, PhotoInfo> = {};
        if (photoIds.length > 0) {
          const { data: photosData } = await supabase
            .from('photos')
            .select('id, public_url, thumb_url, url_public')
            .in('id', photoIds);

          photosMap =
            photosData?.reduce<Record<string, PhotoInfo>>((acc, photo: PhotoRow) => {
              acc[photo.id] = {
                public_url: photo.public_url || photo.url_public || null,
                thumb_url: photo.thumb_url ?? null
              };
              return acc;
            }, {}) || {};
        }

        const mapped = inventoryData.map((item: InventoryRow) => {
          // Determine category/type
          let category = item.suggested_category;
          let type = item.suggested_category;
          
          // Auto-classify if not set
          if (!category) {
            if (item.genre?.toLowerCase().includes('magazine') || item.issue_number) {
              category = 'magazine';
              type = 'magazine';
            } else {
              category = 'book';
              type = 'book';
            }
          }

          return {
            id: String(item.id),
            title: item.title ?? null,
            author: item.author ?? null,
            status: item.status ?? 'photographed',
            suggested_category: category,
            suggested_price: item.suggested_price ?? null,
            suggested_title: item.suggested_title ?? null,
            publisher: item.publisher ?? null,
            publication_year: item.publication_year ?? null,
            condition_assessment: item.condition_assessment ?? null,
            genre: item.genre ?? null,
            isbn: item.isbn ?? null,
            issue_number: item.issue_number ?? null,
            issue_date: item.issue_date ?? null,
            series_title: item.subtitle ?? null,
            created_at: item.created_at,
            confidence_score: item.confidence_score ?? null,
            photos: item.photo_id ? photosMap[item.photo_id] : null,
            type: type,
            quantity: 1,
            last_scanned_at: item.created_at,
            amazon_asin: item.amazon_asin,
            amazon_title: item.amazon_title,
            amazon_match_confidence: item.amazon_match_confidence,
          };
        });
        setInventory(mapped);
        return;
      }

      // Fallback to items table (old structure)
      const { data, error } = await supabase
        .from('items')
        .select(`
          id,
          title,
          authors,
          status,
          type,
          quantity,
          last_scanned_at,
          created_at,
          publisher,
          year,
          isbn13,
          suggested_price,
          photos (
            public_url,
            thumb_url
          )
        `)
        .eq('user_id', user?.id)
        .in('status', ['draft','processed'])
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching inventory:', error);
      } else {
        const mapped = (data || []).map((it: OldItemRow) => {
          const firstPhoto = Array.isArray(it.photos) ? it.photos[0] : null;
          return {
            id: String(it.id),
            title: it.title ?? null,
            author: Array.isArray(it.authors) ? it.authors.filter(Boolean).join(', ') : null,
            status: it.status ?? 'draft',
            suggested_category: it.type ?? 'book',
            suggested_price: it.suggested_price ?? null,
            suggested_title: null,
            publisher: it.publisher ?? null,
            publication_year: null,
            condition_assessment: null,
            genre: null,
            isbn: it.isbn13 ?? null,
            issue_number: null,
            issue_date: null,
            series_title: null,
            created_at: it.created_at,
            confidence_score: null,
            photos: firstPhoto,
            // extra fields
            type: it.type ?? 'book',
            quantity: it.quantity ?? 1,
            last_scanned_at: it.last_scanned_at ?? null,
            // Amazon fields (default to null for old items structure)
            amazon_asin: null,
            amazon_title: null,
            amazon_match_confidence: null,
          } as InventoryItem;
        });
        setInventory(mapped);
      }
      } catch (error) {
        console.error('Error fetching inventory:', error);
      } finally {
        setLoading(false);
      }
    }, [user]);

  useImperativeHandle(ref, () => ({
    refreshInventory: fetchInventory
  }));

  useEffect(() => {
    if (user) {
      fetchInventory();
    }
  }, [user, fetchInventory]);

  const filteredInventory = inventory.filter(item => {
    const title = item.title || item.suggested_category || 'Untitled';
    const author = item.author || '';
    const matchesSearch = title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         author.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "all" || item.status === statusFilter;
    const matchesCategory = categoryFilter === "all" || item.suggested_category === categoryFilter;
    const matchesType = typeFilter === "all" || item.type === typeFilter;
    
    return matchesSearch && matchesStatus && matchesCategory && matchesType;
  });

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "processed": return <CheckCircle className="w-4 h-4 text-success" />;
      case "listed": return <Package className="w-4 h-4 text-primary" />;
      case "sold": return <CheckCircle className="w-4 h-4 text-success" />;
      default: return <Clock className="w-4 h-4 text-warning" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, string> = {
      draft: "bg-warning/10 text-warning border-warning/20",
      processed: "bg-success/10 text-success border-success/20",
      listed: "bg-primary/10 text-primary border-primary/20",
      sold: "bg-success/10 text-success border-success/20",
    };
    const cls = variants[status] || "bg-muted text-muted-foreground border-muted";
    return (
      <Badge variant="outline" className={cls}>
        {status}
      </Badge>
    );
  };

  const getCategoryIcon = (category: string) => {
    if (category === "book") return <BookOpen className="w-4 h-4 text-muted-foreground" />;
    if (category === "magazine") return <Calendar className="w-4 h-4 text-muted-foreground" />;
    return <Package className="w-4 h-4 text-muted-foreground" />;
  };

  const getTypeBadge = (type: string | null | undefined) => {
    if (type === 'magazine') return <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">Magazine</Badge>;
    if (type === 'bundle') return <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200">Bundle</Badge>;
    return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">Book</Badge>;
  };

  const getGridColumns = () => {
    switch (viewMode) {
      case "compact":
        return "grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 gap-2 sm:gap-3";
      case "list":
        return "grid grid-cols-1 gap-2";
      default: // grid
        return "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4";
    }
  };

  const toggleItemSelection = (itemId: string) => {
    setSelectedItems(prev => 
      prev.includes(itemId) 
        ? prev.filter(id => id !== itemId)
        : [...prev, itemId]
    );
  };

  const toggleSelectAll = () => {
    if (selectedItems.length === filteredInventory.length) {
      setSelectedItems([]);
    } else {
      setSelectedItems(filteredInventory.map(item => item.id));
    }
  };

  const handleExportCSV = async () => {
    if (selectedItems.length === 0) return;
    
    setIsExporting(true);
    try {
      const { data, error } = await supabase.functions.invoke('export-inventory-csv', {
        body: {
          selectedItemIds: selectedItems,
          userId: user?.id
        }
      });

      if (error) throw error;

      if (data?.download_url) {
        const link = document.createElement('a');
        link.href = data.download_url;
        link.download = data.file_name;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    } catch (error) {
      console.error('Error exporting CSV:', error);
    } finally {
      setIsExporting(false);
    }
  };

  const deleteSelected = async () => {
    if (selectedItems.length === 0) return;
    if (!confirm(`Delete ${selectedItems.length} item(s)? This removes photos too.`)) return;

    try {
      const { error } = await supabase.functions.invoke('delete-items', {
        body: { item_ids: selectedItems, hard: true }
      });
      if (error) throw error;
      setInventory(items => items.filter(it => !selectedItems.includes(it.id)));
      setSelectedItems([]);
    } catch (err) {
      console.error('Bulk delete failed', err);
    }
  };

  const handleGetPricing = (item: InventoryItem) => {
    setPricingItem(item);
    setIsPricingModalOpen(true);
  };

  const handleAsinMatch = (item: InventoryItem) => {
    setAsinMatchItem(item);
    setIsAsinMatchModalOpen(true);
  };

  const handleAddPhoto = async (itemId: string) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
      input.setAttribute('capture', 'environment');
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file || !user?.id) return;
      try {
        const basePath = `${user.id}/items/${itemId}`;
        const fileName = `photo-${Date.now()}.jpg`;
        const thumbBlob = await createThumbnail(file, 320);

        const { error: upErr } = await supabase.storage.from('photos').upload(`${basePath}/${fileName}`, file, {
          upsert: true, cacheControl: '3600', contentType: file.type || 'image/jpeg'
        });
        if (upErr) throw upErr;
        const thumbPath = `${basePath}/${fileName.replace('.jpg','')}-thumb.webp`;
        const { error: upThumbErr } = await supabase.storage.from('photos').upload(thumbPath, thumbBlob, {
          upsert: true, cacheControl: '3600', contentType: 'image/webp'
        });
        if (upThumbErr) throw upThumbErr;

        const { data: pub1 } = supabase.storage.from('photos').getPublicUrl(`${basePath}/${fileName}`);
        const { data: pub2 } = supabase.storage.from('photos').getPublicUrl(thumbPath);

        await supabase.from('photos').insert({
          item_id: Number(itemId),
          file_name: fileName,
          storage_path: `${basePath}/${fileName}`,
          public_url: pub1.publicUrl,
          url_public: pub1.publicUrl,
          thumb_url: pub2.publicUrl,
          user_id: user.id,
        });

        toast({ title: 'Photo added', description: 'Your photo was uploaded.' });
        fetchInventory();
      } catch (e) {
        console.error(e);
        toast({ title: 'Upload failed', variant: 'destructive', description: 'Could not add photo.' });
      }
    };
    input.click();
  };

  async function createThumbnail(file: Blob, maxSize: number): Promise<Blob> {
    const img = await blobToImage(file);
    const [w, h] = fitWithin(img.naturalWidth, img.naturalHeight, maxSize);
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('No canvas context');
    ctx.drawImage(img, 0, 0, w, h);
    const blob: Blob = await new Promise((resolve) => canvas.toBlob((b) => resolve(b as Blob), 'image/webp', 0.86));
    return blob;
  }

  function fitWithin(w: number, h: number, max: number): [number, number] {
    const ratio = Math.min(max / w, max / h, 1);
    return [Math.round(w * ratio), Math.round(h * ratio)];
  }

  function blobToImage(blob: Blob): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
      img.src = url;
    });
  }

  const renderItemCard = (item: InventoryItem) => {
    const isSelected = selectedItems.includes(item.id);
    
    if (viewMode === "compact") {
      return (
        <Card key={item.id} className={`shadow-card hover:shadow-elevated transition-shadow cursor-pointer ${isSelected ? 'ring-2 ring-primary' : ''}`}>
          <CardContent className="p-2">
            <div className="space-y-2">
              {/* Selection Checkbox */}
              <div className="flex justify-between items-start">
                <Checkbox
                  checked={isSelected}
                  onCheckedChange={() => toggleItemSelection(item.id)}
                  className="mt-1"
                />
              </div>
              
              {/* Compact Image */}
              <div className="aspect-[3/4] bg-muted rounded-lg flex items-center justify-center overflow-hidden">
                {item.photos?.public_url ? (
                  <img 
                    src={item.photos.public_url} 
                    alt={item.title || 'Item photo'}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <BookOpen className="w-4 h-4 text-muted-foreground" />
                )}
              </div>
              
              {/* Compact Content */}
              <div className="space-y-1">
                <h3 className="font-medium text-xs leading-tight line-clamp-2">
                  {item.title || item.suggested_category || 'Untitled'}
                </h3>
                <div className="flex items-center justify-between">
                  <div className="flex gap-1">
                    <Badge variant="outline">Qty: {item.quantity ?? 1}</Badge>
                    {getTypeBadge(item.type)}
                  </div>
                  {getStatusIcon(item.status)}
                </div>
              </div>
              
              {/* Compact Actions */}
              <Button 
                variant="outline" 
                size="sm" 
                className="w-full text-xs"
                onClick={() => {
                  setSelectedItem(item);
                  setIsCreateListingModalOpen(true);
                }}
              >
                List on eBay
              </Button>
            </div>
          </CardContent>
        </Card>
      );
    }

    if (viewMode === "list") {
      return (
        <Card key={item.id} className={`shadow-card hover:shadow-elevated transition-shadow cursor-pointer ${isSelected ? 'ring-2 ring-primary' : ''}`}>
          <CardContent className="p-3">
            <div className="flex gap-3">
              {/* Selection Checkbox */}
              <Checkbox
                checked={isSelected}
                onCheckedChange={() => toggleItemSelection(item.id)}
                className="mt-1"
              />
              
              {/* List Image */}
              <div className="w-16 h-20 bg-muted rounded-lg flex items-center justify-center overflow-hidden flex-shrink-0">
                {item.photos?.public_url ? (
                  <img 
                    src={item.photos.public_url} 
                    alt={item.title || 'Item photo'}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <BookOpen className="w-4 h-4 text-muted-foreground" />
                )}
              </div>
              
              {/* List Content */}
              <div className="flex-1 space-y-1">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-medium text-sm leading-tight line-clamp-1">
                    {item.title || item.suggested_category || 'Untitled Item'}
                  </h3>
                  <div className="flex items-center gap-1">
                    {getStatusIcon(item.status)}
                    {getStatusBadge(item.status)}
                  </div>
                </div>
                
                <p className="text-xs text-muted-foreground">
                  {item.author || 'Unknown Author'}
                </p>
                
                <div className="flex items-center justify-between">
                  <div className="flex gap-2 items-center">
                    <span className="font-semibold text-sm">Qty: {item.quantity ?? 1}</span>
                    {getTypeBadge(item.type)}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {item.last_scanned_at ? `Scanned ${new Date(item.last_scanned_at).toLocaleDateString()}` : ''}
                  </span>
                </div>
              </div>
              
              {/* List Actions */}
              <div className="flex flex-col gap-1">
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="text-xs"
                  onClick={() => {
                    // TODO: Implement edit functionality
                  }}
                >
                  Edit
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="text-xs"
                  onClick={() => {
                    setSelectedItem(item);
                    setIsCreateListingModalOpen(true);
                  }}
                >
                  List on eBay
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      );
    }

    // Default grid view
    return (
      <Card 
        key={item.id} 
        className={`shadow-card hover:shadow-elevated transition-shadow cursor-pointer ${isSelected ? 'ring-2 ring-primary' : ''}`}
        onClick={() => {
          setSelectedItem(item);
          setIsCreateListingModalOpen(true);
        }}
      >
        <CardContent className="p-4">
          <div className="space-y-3">
            {/* Selection Checkbox */}
            <div className="flex justify-between items-start">
              <Checkbox
                checked={isSelected}
                onCheckedChange={() => toggleItemSelection(item.id)}
                onClick={(e) => e.stopPropagation()}
              />
            </div>
            
            {/* Image */}
            <div className="aspect-[3/4] bg-muted rounded-lg flex items-center justify-center overflow-hidden">
              {item.photos?.public_url ? (
                <img 
                  src={item.photos.public_url} 
                  alt={item.title || 'Item photo'}
                  className="w-full h-full object-cover"
                />
              ) : (
                <BookOpen className="w-6 h-6 text-muted-foreground" />
              )}
            </div>

            {/* Content */}
            <div className="space-y-2">
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-medium text-sm leading-tight line-clamp-2">
                  {item.title || item.suggested_category || 'Untitled Item'}
                </h3>
                {getCategoryIcon(item.suggested_category || 'book')}
              </div>
              
              <p className="text-sm text-muted-foreground line-clamp-1">
                {item.suggested_category === 'magazine' ? (
                  <>
                    {item.series_title && `${item.series_title} `}
                    {item.issue_number && `Issue #${item.issue_number}`}
                    {item.issue_date && ` (${item.issue_date})`}
                  </>
                ) : (
                  item.author || 'Unknown Author'
                )}
              </p>
              
              <div className="flex items-center justify-between">
                 <div className="flex items-center gap-1">
                   <Badge variant="outline">Qty: {item.quantity ?? 1}</Badge>
                   {getTypeBadge(item.type)}
                    {item.amazon_asin && (
                    <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200 text-xs">
                      ASIN
                    </Badge>
                   )}
                 </div>
                <div className="flex items-center gap-1">
                  {getStatusIcon(item.status)}
                  {getStatusBadge(item.status)}
                </div>
              </div>

              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Added {new Date(item.created_at).toLocaleDateString()}</span>
                <span>{item.last_scanned_at ? `Scanned ${new Date(item.last_scanned_at).toLocaleDateString()}` : ''}</span>
              </div>
            </div>

            {/* Actions */}
            <div className="space-y-2 pt-2">
              <div className="flex flex-col sm:flex-row gap-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="flex-1 min-w-0"
                  onClick={(e) => { 
                    e.stopPropagation(); 
                    setEditModalItem(item);
                  }}
                >
                  <Settings className="w-3 h-3 sm:w-4 sm:h-4 mr-1" /> Edit
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="flex-1 min-w-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleAsinMatch(item);
                  }}
                  title="Link this item to its Amazon product page (optional)"
                >
                  <ExternalLink className="w-3 h-3 sm:w-4 sm:h-4 mr-1" /> Amazon
                </Button>
              </div>
               <Button 
                 variant="outline" 
                 size="sm" 
                 className="w-full"
                 onClick={(e) => {
                   e.stopPropagation();
                   setSelectedItem(item);
                   setIsCreateListingModalOpen(true);
                 }}
               >
                <Package className="w-4 h-4 mr-1" /> List on eBay
               </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-6">
      {/* Filters */}
      <Card className="shadow-card">
        <CardContent className="p-4">
          <div className="flex flex-col gap-4">
            {/* Search and Filters Row */}
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search by title or author..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full sm:w-40">
                  <Filter className="w-4 h-4 mr-2" />
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="photographed">Photographed</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="processed">Processed</SelectItem>
                  <SelectItem value="listed">Listed</SelectItem>
                  <SelectItem value="sold">Sold</SelectItem>
                </SelectContent>
              </Select>

              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-full sm:w-40">
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="book">Books</SelectItem>
                  <SelectItem value="magazine">Magazines</SelectItem>
                </SelectContent>
              </Select>

              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-full sm:w-40">
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Items</SelectItem>
                  <SelectItem value="book">Books Only</SelectItem>
                  <SelectItem value="magazine">Magazines Only</SelectItem>
                  <SelectItem value="bundle">Bundles</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            {/* View Mode Toggle Row */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <Checkbox
                  checked={selectedItems.length === filteredInventory.length && filteredInventory.length > 0}
                  onCheckedChange={toggleSelectAll}
                />
                <p className="text-sm text-muted-foreground">
                  {selectedItems.length > 0 ? (
                    <>Selected {selectedItems.length} of {filteredInventory.length} items</>
                  ) : (
                    <>Showing {filteredInventory.length} of {inventory.length} items</>
                  )}
                </p>
              </div>
              
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">View:</span>
                <div className="flex rounded-lg border p-1">
                  <Button
                    variant={viewMode === "grid" ? "default" : "ghost"}
                    size="sm"
                    onClick={() => setViewMode("grid")}
                    className="h-8 px-3"
                  >
                    <LayoutGrid className="w-4 h-4" />
                    <span className="hidden sm:inline ml-1">Grid</span>
                  </Button>
                  <Button
                    variant={viewMode === "compact" ? "default" : "ghost"}
                    size="sm"
                    onClick={() => setViewMode("compact")}
                    className="h-8 px-3"
                  >
                    <Grid3X3 className="w-4 h-4" />
                    <span className="hidden sm:inline ml-1">Compact</span>
                  </Button>
                  <Button
                    variant={viewMode === "list" ? "default" : "ghost"}
                    size="sm"
                    onClick={() => setViewMode("list")}
                    className="h-8 px-3"
                  >
                    <List className="w-4 h-4" />
                    <span className="hidden sm:inline ml-1">List</span>
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-2">
        {selectedItems.length > 0 && (
          <>
            <Button 
              variant="outline" 
              size="sm"
              onClick={handleExportCSV}
              disabled={isExporting}
              className="w-full sm:w-auto"
            >
              <Download className="w-4 h-4 mr-2" />
              {isExporting ? 'Exporting...' : `Export CSV (${selectedItems.length})`}
            </Button>
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => setIsBulkListingModalOpen(true)}
              className="w-full sm:w-auto"
            >
              Bulk Create Listings ({selectedItems.length})
            </Button>
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => setIsBulkEditModalOpen(true)}
              className="w-full sm:w-auto"
            >
              <Edit3 className="w-4 h-4 mr-2" />
              Bulk Edit ({selectedItems.length})
            </Button>
            <Button 
              variant="destructive" 
              size="sm"
              onClick={deleteSelected}
              className="w-full sm:w-auto"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Delete ({selectedItems.length})
            </Button>
          </>
        )}
      </div>
      {/* Inventory Grid */}
      {loading ? (
        <div className={getGridColumns()}>
          {[...Array(viewMode === "compact" ? 12 : 6)].map((_, i) => (
            <Card key={i} className="shadow-card">
              <CardContent className={viewMode === "compact" ? "p-2" : "p-4"}>
                <div className="space-y-3 animate-pulse">
                  <div className={
                    viewMode === "compact" 
                      ? "aspect-[3/4] bg-muted rounded-lg" 
                      : viewMode === "list"
                      ? "w-16 h-20 bg-muted rounded-lg"
                      : "aspect-[3/4] bg-muted rounded-lg"
                  } />
                  <div className="space-y-2">
                    <div className="h-4 bg-muted rounded w-3/4" />
                    <div className="h-3 bg-muted rounded w-1/2" />
                    <div className="h-4 bg-muted rounded w-1/3" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className={getGridColumns()}>
          {filteredInventory.map((item) => renderItemCard(item))}
        </div>
      )}

      {filteredInventory.length === 0 && !loading && (
        <Card className="shadow-card">
          <CardContent className="p-8 text-center">
            <Package className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="font-medium mb-2">No items found</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Try adjusting your search criteria or upload some photos to get started.
            </p>
            <Button variant="gradient">
              Upload Photos
            </Button>
          </CardContent>
        </Card>
      )}

      <CreateListingModal 
        item={selectedItem}
        isOpen={isCreateListingModalOpen}
        onClose={() => {
          setIsCreateListingModalOpen(false);
          setSelectedItem(null);
        }}
      />

      <BulkListingModal
        isOpen={isBulkListingModalOpen}
        onClose={() => setIsBulkListingModalOpen(false)}
        selectedItems={selectedItems.length > 0 ? selectedItems : filteredInventory.map(item => item.id)}
      />
      
      <BulkEditModal
        isOpen={isBulkEditModalOpen}
        onClose={() => setIsBulkEditModalOpen(false)}
        selectedItems={selectedItems}
        onBulkUpdateComplete={() => {
          fetchInventory();
          setSelectedItems([]);
        }}
      />

      <EbayPricingModal
        open={isPricingModalOpen}
        onClose={() => {
          setIsPricingModalOpen(false);
          setPricingItem(null);
        }}
        item={pricingItem || { title: "" }}
        onApply={(price) => {
          // TODO: Apply price to item
          console.log("Apply price:", price);
          setIsPricingModalOpen(false);
          setPricingItem(null);
        }}
      />

      <AsinMatchModal 
        item={asinMatchItem}
        isOpen={isAsinMatchModalOpen}
        onClose={() => {
          setIsAsinMatchModalOpen(false);
          setAsinMatchItem(null);
        }}
        onSuccess={() => {
          fetchInventory(); // Refresh to show ASIN badge
        }}
      />

      <ItemEditModal 
        open={editModalItem !== null}
        onOpenChange={(open) => {
          if (!open) {
            setEditModalItem(null);
          }
        }}
        item={editModalItem}
        onSave={(updatedItem) => {
          setEditModalItem(null);
          fetchInventory();
        }}
      />
    </div>
  );
});
InventoryGrid.displayName = "InventoryGrid";