import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Edit3, Save, X, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface BulkEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedItems: string[];
  onBulkUpdateComplete: () => void;
}

interface BulkUpdateData {
  category?: string;
  status?: string;
  aiOptimize?: boolean;
}

export function BulkEditModal({ isOpen, onClose, selectedItems, onBulkUpdateComplete }: BulkEditModalProps) {
  const { toast } = useToast();
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateData, setUpdateData] = useState<BulkUpdateData>({});

  const performBulkAIOptimize = async () => {
    setIsUpdating(true);
    let successCount = 0;
    let errorCount = 0;

    try {
      for (const itemId of selectedItems) {
        try {
          // Get item details from inventory_items table
          const { data: item } = await supabase
            .from('inventory_items')
            .select('*')
            .eq('id', itemId)
            .single();

          if (!item) continue;

          // Call generate-ebay-listing function
          const { data: result, error } = await supabase.functions.invoke('generate-ebay-listing', {
            body: {
              itemData: {
                title: item.title,
                author: item.author,
                publisher: item.publisher,
                publication_year: item.publication_year,
                condition: item.condition_assessment,
                category: item.suggested_category,
                isbn: item.isbn,
                genre: item.genre,
                issue_number: item.issue_number,
                issue_date: item.issue_date
              },
              userId: item.user_id
            }
          });

          if (error) {
            console.error(`AI optimize error for item ${itemId}:`, error);
            errorCount++;
            continue;
          }

          if (result?.success && result?.optimizedListing) {
            // Update inventory item with optimized data
            const updatePayload: any = {
              suggested_title: result.optimizedListing.title,
              description: result.optimizedListing.description,
            };

            if (result.optimizedListing.price) {
              updatePayload.suggested_price = result.optimizedListing.price;
            }

            await supabase
              .from('inventory_items')
              .update(updatePayload)
              .eq('id', itemId);

            successCount++;
          } else {
            errorCount++;
          }
        } catch (itemError) {
          console.error(`Error processing item ${itemId}:`, itemError);
          errorCount++;
        }
      }

      toast({
        title: "Bulk AI Optimize Complete",
        description: `Optimized ${successCount} items${errorCount > 0 ? `, ${errorCount} failed` : ''}`
      });

      onBulkUpdateComplete();
      onClose();
    } catch (error) {
      console.error('Bulk AI optimize error:', error);
      toast({
        title: "Bulk AI Optimize Failed",
        description: error.message || "Failed to optimize items",
        variant: "destructive"
      });
    } finally {
      setIsUpdating(false);
    }
  };

  const handleUpdate = async () => {
    if (updateData.aiOptimize) {
      await performBulkAIOptimize();
      return;
    }

    if (Object.keys(updateData).filter(key => key !== 'aiOptimize').length === 0) {
      toast({
        title: "No changes selected",  
        description: "Please select at least one field to update.",
        variant: "destructive"
      });
      return;
    }

    setIsUpdating(true);
    try {
      // Build the update object with only selected fields
      const updates: any = {};
      if (updateData.category) updates.type = updateData.category;
      if (updateData.status) updates.status = updateData.status;

      const { error } = await supabase
        .from('items')
        .update(updates)
        .in('id', selectedItems.map((id) => Number(id)));

      if (error) {
        throw error;
      }

      toast({
        title: "Bulk update successful",
        description: `Updated ${selectedItems.length} items`,
      });

      onBulkUpdateComplete();
      onClose();
      setUpdateData({});
    } catch (error) {
      console.error('Bulk update error:', error);
      toast({
        title: "Update failed",
        description: error.message || "Failed to update items",
        variant: "destructive"
      });
    } finally {
      setIsUpdating(false);
    }
  };

  const clearField = (field: keyof BulkUpdateData) => {
    setUpdateData(prev => {
      const updated = { ...prev };
      delete updated[field];
      return updated;
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Edit3 className="w-5 h-5" />
            Bulk Edit Items
          </DialogTitle>
          <DialogDescription>
            Update multiple inventory items at once. Only selected fields will be changed.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4">
          <div className="p-3 bg-muted/30 rounded-lg">
            <p className="text-sm font-medium">Selected Items</p>
            <Badge variant="outline" className="mt-1">
              {selectedItems.length} items
            </Badge>
          </div>

          <Card>
            <CardContent className="pt-4 space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Category</Label>
                  {updateData.category && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => clearField('category')}
                    >
                      <X className="w-3 h-3" />
                    </Button>
                  )}
                </div>
                <Select 
                  value={updateData.category || ""} 
                  onValueChange={(value) => setUpdateData(prev => ({ ...prev, category: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Keep current category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="book">Book</SelectItem>
                    <SelectItem value="magazine">Magazine</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Status</Label>
                  {updateData.status && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => clearField('status')}
                    >
                      <X className="w-3 h-3" />
                    </Button>
                  )}
                </div>
                <Select 
                  value={updateData.status || ""} 
                  onValueChange={(value) => setUpdateData(prev => ({ ...prev, status: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Keep current status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="processed">Processed</SelectItem>
                    <SelectItem value="listed">Listed</SelectItem>
                    <SelectItem value="sold">Sold</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2 pt-4 border-t">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-primary" />
                    <Label htmlFor="ai-optimize">AI Optimize Listings</Label>
                  </div>
                  <Switch 
                    id="ai-optimize"
                    checked={updateData.aiOptimize || false}
                    onCheckedChange={(checked) => setUpdateData(prev => ({ ...prev, aiOptimize: checked }))}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Generate SEO-optimized titles and descriptions for all selected items
                </p>
              </div>
            </CardContent>
          </Card>

          {Object.keys(updateData).length > 0 && (
            <div className="p-3 bg-primary/5 rounded-lg">
              <p className="text-sm font-medium text-primary">Changes to apply:</p>
              <div className="mt-1 space-y-1">
                {updateData.category && (
                  <p className="text-xs">• Category → {updateData.category}</p>
                )}
                {updateData.status && (
                  <p className="text-xs">• Status → {updateData.status}</p>
                )}
                {updateData.aiOptimize && (
                  <p className="text-xs">• Generate optimized titles & descriptions</p>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-2 pt-4">
          <Button variant="outline" onClick={onClose} className="flex-1" disabled={isUpdating}>
            Cancel
          </Button>
          <Button 
            onClick={handleUpdate} 
            className="flex-1" 
            disabled={isUpdating || Object.keys(updateData).length === 0}
          >
            {isUpdating ? (
              <>
                <div className="animate-spin w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full mr-2" />
                {updateData.aiOptimize ? 'AI Optimizing...' : 'Updating...'}
              </>
            ) : (
              <>
                {updateData.aiOptimize ? <Sparkles className="w-4 h-4 mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                {updateData.aiOptimize ? 'AI Optimize' : 'Update'} {selectedItems.length} Items
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}