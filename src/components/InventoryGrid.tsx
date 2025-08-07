import { useState, useEffect, forwardRef, useImperativeHandle } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Search, Filter, Package, Clock, CheckCircle, DollarSign, Calendar, BookOpen, Grid3X3, List, LayoutGrid, Edit3 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { CreateListingModal } from "@/components/CreateListingModal";
import { BulkListingModal } from "@/components/BulkListingModal";
import { BulkEditModal } from "@/components/BulkEditModal";

interface InventoryItem {
  id: string;
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
  created_at: string;
  photos: {
    public_url: string | null;
  } | null;
  confidence_score: number | null;
}

export interface InventoryGridRef {
  refreshInventory: () => void;
}

export const InventoryGrid = forwardRef<InventoryGridRef>((props, ref) => {
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"grid" | "compact" | "list">("grid");
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [isCreateListingModalOpen, setIsCreateListingModalOpen] = useState(false);
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [isBulkListingModalOpen, setIsBulkListingModalOpen] = useState(false);
  const [isBulkEditModalOpen, setIsBulkEditModalOpen] = useState(false);

  useImperativeHandle(ref, () => ({
    refreshInventory: fetchInventory
  }));

  useEffect(() => {
    if (user) {
      fetchInventory();
    }
  }, [user]);

  const fetchInventory = async () => {
    try {
      const { data, error } = await supabase
        .from('inventory_items')
        .select(`
          id,
          title,
          author,
          status,
          suggested_category,
          suggested_price,
          suggested_title,
          publisher,
          publication_year,
          condition_assessment,
          genre,
          isbn,
          issue_number,
          issue_date,
          created_at,
          confidence_score,
          photos (
            public_url
          )
        `)
        .eq('user_id', user?.id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching inventory:', error);
      } else {
        setInventory(data || []);
      }
    } catch (error) {
      console.error('Error fetching inventory:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredInventory = inventory.filter(item => {
    const title = item.title || item.suggested_category || 'Untitled';
    const author = item.author || '';
    const matchesSearch = title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         author.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "all" || item.status === statusFilter;
    const matchesCategory = categoryFilter === "all" || item.suggested_category === categoryFilter;
    
    return matchesSearch && matchesStatus && matchesCategory;
  });

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "processed": return <CheckCircle className="w-4 h-4 text-success" />;
      case "listed": return <Package className="w-4 h-4 text-primary" />;
      case "sold": return <DollarSign className="w-4 h-4 text-success" />;
      default: return <Clock className="w-4 h-4 text-warning" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const variants = {
      processed: "bg-success/10 text-success border-success/20",
      listed: "bg-primary/10 text-primary border-primary/20",
      sold: "bg-success/10 text-success border-success/20",
      pending: "bg-warning/10 text-warning border-warning/20"
    };
    
    return (
      <Badge variant="outline" className={variants[status as keyof typeof variants]}>
        {status}
      </Badge>
    );
  };

  const getCategoryIcon = (category: string) => {
    return category === "book" ? 
      <BookOpen className="w-4 h-4 text-muted-foreground" /> : 
      <Calendar className="w-4 h-4 text-muted-foreground" />;
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
                  <span className="font-semibold text-sm">
                    ${item.suggested_price?.toFixed(2) || '0.00'}
                  </span>
                  {getStatusIcon(item.status)}
                </div>
              </div>
              
              {/* Compact Actions */}
              <Button 
                variant="default" 
                size="sm" 
                className="w-full text-xs"
                onClick={() => {
                  setSelectedItem(item);
                  setIsCreateListingModalOpen(true);
                }}
              >
                List
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
                  <span className="font-semibold text-lg">
                    ${item.suggested_price?.toFixed(2) || '0.00'}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {item.confidence_score || 0}% confidence
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
                  variant="default" 
                  size="sm" 
                  className="text-xs"
                  onClick={() => {
                    setSelectedItem(item);
                    setIsCreateListingModalOpen(true);
                  }}
                >
                  List
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      );
    }

    // Default grid view
    return (
      <Card key={item.id} className={`shadow-card hover:shadow-elevated transition-shadow cursor-pointer ${isSelected ? 'ring-2 ring-primary' : ''}`}>
        <CardContent className="p-4">
          <div className="space-y-3">
            {/* Selection Checkbox */}
            <div className="flex justify-between items-start">
              <Checkbox
                checked={isSelected}
                onCheckedChange={() => toggleItemSelection(item.id)}
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
                {item.author || 'Unknown Author'}
              </p>
              
              <div className="flex items-center justify-between">
                <span className="font-semibold text-lg">
                  ${item.suggested_price?.toFixed(2) || '0.00'}
                </span>
                <div className="flex items-center gap-1">
                  {getStatusIcon(item.status)}
                  {getStatusBadge(item.status)}
                </div>
              </div>

              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Added {new Date(item.created_at).toLocaleDateString()}</span>
                <span className="flex items-center gap-1">
                  <div className="w-2 h-2 bg-success rounded-full" />
                  {item.confidence_score || 0}% confidence
                </span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-2">
              <Button 
                variant="outline" 
                size="sm" 
                className="flex-1"
                onClick={() => {
                  // TODO: Implement edit functionality
                }}
              >
                Edit
              </Button>
              <Button 
                variant="default" 
                size="sm" 
                className="flex-1"
                onClick={() => {
                  setSelectedItem(item);
                  setIsCreateListingModalOpen(true);
                }}
              >
                Create Listing
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
                  <SelectItem value="pending">Pending</SelectItem>
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
      <div className="flex gap-2">
        {selectedItems.length > 0 && (
          <>
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => setIsBulkEditModalOpen(true)}
            >
              <Edit3 className="w-4 h-4 mr-2" />
              Bulk Edit ({selectedItems.length})
            </Button>
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => setIsBulkListingModalOpen(true)}
            >
              Bulk Create Listings ({selectedItems.length})
            </Button>
          </>
        )}
        <Button variant="outline" size="sm">
          Export Selected
        </Button>
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
    </div>
  );
});
InventoryGrid.displayName = "InventoryGrid";