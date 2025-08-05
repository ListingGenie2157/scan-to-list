import { useState, useEffect, forwardRef, useImperativeHandle } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Filter, Package, Clock, CheckCircle, DollarSign, Calendar, BookOpen } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { CreateListingModal } from "@/components/CreateListingModal";

interface InventoryItem {
  id: string;
  title: string | null;
  author: string | null;
  status: string;
  suggested_category: string | null;
  suggested_price: number | null;
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
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [isCreateListingModalOpen, setIsCreateListingModalOpen] = useState(false);

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

  return (
    <div className="space-y-6">
      {/* Filters */}
      <Card className="shadow-card">
        <CardContent className="p-4">
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
        </CardContent>
      </Card>

      {/* Results Summary */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Showing {filteredInventory.length} of {inventory.length} items
        </p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm">
            Export Selected
          </Button>
          <Button variant="outline" size="sm">
            Bulk Actions
          </Button>
        </div>
      </div>

      {/* Inventory Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <Card key={i} className="shadow-card">
              <CardContent className="p-4">
                <div className="space-y-3 animate-pulse">
                  <div className="aspect-[3/4] bg-muted rounded-lg" />
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredInventory.map((item) => (
            <Card key={item.id} className="shadow-card hover:shadow-elevated transition-shadow cursor-pointer">
              <CardContent className="p-4">
                <div className="space-y-3">
                  {/* Image */}
                  <div className="aspect-[3/4] bg-muted rounded-lg flex items-center justify-center overflow-hidden">
                    {item.photos?.public_url ? (
                      <img 
                        src={item.photos.public_url} 
                        alt={item.title || 'Item photo'}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <BookOpen className="w-8 h-8 text-muted-foreground" />
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
                        console.log('Edit button clicked for item:', item.id);
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
                        console.log('Create listings button clicked!');
                        console.log('Setting selected item:', item);
                        setSelectedItem(item);
                        setIsCreateListingModalOpen(true);
                        console.log('Modal should be open now');
                      }}
                    >
                      Create Listing
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {filteredInventory.length === 0 && (
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
    </div>
  );
});
InventoryGrid.displayName = "InventoryGrid";