import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { BookOpen, Sparkles, Loader2, CheckCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

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

interface BulkListingModalProps {
  items: InventoryItem[];
  isOpen: boolean;
  onClose: () => void;
}

interface ProcessingStatus {
  [itemId: string]: 'pending' | 'processing' | 'complete' | 'error';
}

export function BulkListingModal({ items, isOpen, onClose }: BulkListingModalProps) {
  const { toast } = useToast();
  const [selectedItems, setSelectedItems] = useState<string[]>(items.map(item => item.id));
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState<ProcessingStatus>({});
  const [processedCount, setProcessedCount] = useState(0);

  const handleSelectAll = (checked: boolean) => {
    setSelectedItems(checked ? items.map(item => item.id) : []);
  };

  const handleSelectItem = (itemId: string, checked: boolean) => {
    setSelectedItems(prev => 
      checked 
        ? [...prev, itemId] 
        : prev.filter(id => id !== itemId)
    );
  };

  const generateBulkListings = async () => {
    setIsProcessing(true);
    setProcessedCount(0);
    
    const initialStatus: ProcessingStatus = {};
    selectedItems.forEach(id => {
      initialStatus[id] = 'pending';
    });
    setProcessingStatus(initialStatus);

    let completed = 0;

    for (const itemId of selectedItems) {
      const item = items.find(i => i.id === itemId);
      if (!item) continue;

      setProcessingStatus(prev => ({ ...prev, [itemId]: 'processing' }));

      try {
        const { data, error } = await supabase.functions.invoke('generate-ebay-listing', {
          body: {
            itemData: {
              title: item.title,
              author: item.author,
              publisher: item.publisher,
              publication_year: item.publication_year,
              condition: item.condition_assessment || 'good',
              category: item.suggested_category || 'book',
              isbn: item.isbn,
              genre: item.genre,
              issue_number: item.issue_number,
              issue_date: item.issue_date
            }
          }
        });

        if (error) {
          throw new Error(error.message);
        }

        if (data?.success && data?.optimizedListing) {
          // Here you would save the generated listing
          // For now, we'll just mark as complete
          setProcessingStatus(prev => ({ ...prev, [itemId]: 'complete' }));
          completed++;
          setProcessedCount(completed);
        } else {
          throw new Error('Failed to generate optimized listing');
        }
      } catch (error) {
        console.error(`Error generating listing for item ${itemId}:`, error);
        setProcessingStatus(prev => ({ ...prev, [itemId]: 'error' }));
      }

      // Small delay between requests to avoid overwhelming the API
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    setIsProcessing(false);
    
    toast({
      title: "Bulk Processing Complete!",
      description: `Successfully generated ${completed} optimized listings.`,
    });
  };

  const progressPercentage = selectedItems.length > 0 ? (processedCount / selectedItems.length) * 100 : 0;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Bulk Create Listings</DialogTitle>
          <DialogDescription>
            Generate SEO-optimized eBay listings for multiple items at once.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-6">
          {/* Selection Controls */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Checkbox 
                id="select-all"
                checked={selectedItems.length === items.length}
                onCheckedChange={handleSelectAll}
              />
              <label htmlFor="select-all" className="text-sm font-medium">
                Select All ({selectedItems.length} of {items.length} selected)
              </label>
            </div>
            
            <Button 
              onClick={generateBulkListings}
              disabled={selectedItems.length === 0 || isProcessing}
            >
              {isProcessing ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4 mr-2" />
              )}
              {isProcessing ? 'Processing...' : `Generate ${selectedItems.length} Listings`}
            </Button>
          </div>

          {/* Progress Bar */}
          {isProcessing && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Processing listings...</span>
                <span>{processedCount} / {selectedItems.length}</span>
              </div>
              <Progress value={progressPercentage} className="w-full" />
            </div>
          )}

          {/* Items Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-h-[400px] overflow-y-auto">
            {items.map((item) => {
              const isSelected = selectedItems.includes(item.id);
              const status = processingStatus[item.id];
              
              return (
                <div 
                  key={item.id} 
                  className={`border rounded-lg p-3 transition-all ${
                    isSelected ? 'border-primary bg-primary/5' : 'border-border'
                  }`}
                >
                  <div className="flex items-start space-x-3">
                    <Checkbox 
                      checked={isSelected}
                      onCheckedChange={(checked) => handleSelectItem(item.id, !!checked)}
                      disabled={isProcessing}
                    />
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-12 h-16 bg-muted rounded flex items-center justify-center flex-shrink-0">
                          {item.photos?.public_url ? (
                            <img 
                              src={item.photos.public_url} 
                              alt={item.title || 'Item photo'}
                              className="w-full h-full object-cover rounded"
                            />
                          ) : (
                            <BookOpen className="w-4 h-4 text-muted-foreground" />
                          )}
                        </div>
                        
                        <div className="flex-1 min-w-0">
                          <h4 className="font-medium text-sm line-clamp-2">
                            {item.title || item.suggested_category || 'Untitled Item'}
                          </h4>
                          <p className="text-xs text-muted-foreground">
                            {item.author || 'Unknown Author'}
                          </p>
                          <div className="flex items-center gap-1 mt-1">
                            <Badge variant="outline" className="text-xs">
                              {item.suggested_category}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              ${item.suggested_price?.toFixed(2) || '0.00'}
                            </span>
                          </div>
                        </div>
                      </div>
                      
                      {/* Processing Status */}
                      {status && (
                        <div className="flex items-center gap-1 text-xs">
                          {status === 'processing' && <Loader2 className="w-3 h-3 animate-spin" />}
                          {status === 'complete' && <CheckCircle className="w-3 h-3 text-success" />}
                          {status === 'error' && <div className="w-3 h-3 bg-destructive rounded-full" />}
                          <span className="capitalize">{status}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-4">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">
              {isProcessing ? 'Close' : 'Cancel'}
            </Button>
            {!isProcessing && processedCount > 0 && (
              <Button className="flex-1">
                View Generated Listings
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}