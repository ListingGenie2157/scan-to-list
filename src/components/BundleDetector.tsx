import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Package, Check, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/components/ui/use-toast";

interface BundleDetectorProps {
  photoId: string;
  detectedItems: Array<{
    title: string;
    author?: string;
    isbn?: string;
    confidence: number;
  }>;
  onBundleCreated: (bundleId: string) => void;
  onSkip: () => void;
}

export function BundleDetector({ photoId, detectedItems, onBundleCreated, onSkip }: BundleDetectorProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [bundleName, setBundleName] = useState("");
  const [bundlePrice, setBundlePrice] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [selectedItems, setSelectedItems] = useState(detectedItems.map((_, i) => i));

  const handleCreateBundle = async () => {
    if (!user || selectedItems.length < 2) return;
    
    setIsCreating(true);
    try {
      // Create bundle
      const { data: bundle, error: bundleError } = await supabase
        .from('bundles')
        .insert({
          user_id: user.id,
          bundle_name: bundleName || `Bundle of ${selectedItems.length} items`,
          bundle_type: 'photo_detected',
          bundle_price: bundlePrice ? parseFloat(bundlePrice) : null,
          total_items: selectedItems.length,
        })
        .select()
        .single();

      if (bundleError) throw bundleError;

      // Create inventory items for each selected item
      const inventoryItems = selectedItems.map(index => {
        const item = detectedItems[index];
        return {
          user_id: user.id,
          photo_id: photoId,
          bundle_id: bundle.id,
          title: item.title,
          author: item.author || null,
          isbn: item.isbn || null,
          confidence_score: item.confidence,
          status: 'photographed',
          suggested_category: 'book', // Default, can be updated via OCR
        };
      });

      const { error: itemsError } = await supabase
        .from('inventory_items')
        .insert(inventoryItems);

      if (itemsError) throw itemsError;

      toast({ 
        title: 'Bundle created', 
        description: `Created bundle with ${selectedItems.length} items` 
      });
      
      onBundleCreated(bundle.id);
    } catch (error) {
      console.error('Error creating bundle:', error);
      toast({ 
        title: 'Error', 
        description: 'Failed to create bundle', 
        variant: 'destructive' 
      });
    } finally {
      setIsCreating(false);
    }
  };

  const toggleItemSelection = (index: number) => {
    setSelectedItems(prev => 
      prev.includes(index) 
        ? prev.filter(i => i !== index)
        : [...prev, index]
    );
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Package className="w-5 h-5 text-orange-600" />
          <CardTitle>Multiple Items Detected</CardTitle>
        </div>
        <p className="text-sm text-muted-foreground">
          We found {detectedItems.length} items in this photo. Create a bundle or process them individually.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Detected Items */}
        <div className="space-y-2">
          <Label>Select items to include in bundle:</Label>
          {detectedItems.map((item, index) => (
            <Card 
              key={index} 
              className={`cursor-pointer transition-colors ${
                selectedItems.includes(index) 
                  ? 'ring-2 ring-primary bg-primary/5' 
                  : 'hover:bg-muted/50'
              }`}
              onClick={() => toggleItemSelection(index)}
            >
              <CardContent className="p-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h4 className="font-medium text-sm">{item.title}</h4>
                    {item.author && (
                      <p className="text-xs text-muted-foreground">by {item.author}</p>
                    )}
                    {item.isbn && (
                      <p className="text-xs text-muted-foreground">ISBN: {item.isbn}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">
                      {Math.round(item.confidence * 100)}% confidence
                    </Badge>
                    {selectedItems.includes(index) ? (
                      <Check className="w-4 h-4 text-success" />
                    ) : (
                      <X className="w-4 h-4 text-muted-foreground" />
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Bundle Details */}
        {selectedItems.length >= 2 && (
          <div className="space-y-3 border-t pt-4">
            <div className="space-y-2">
              <Label htmlFor="bundleName">Bundle Name (optional)</Label>
              <Input
                id="bundleName"
                value={bundleName}
                onChange={(e) => setBundleName(e.target.value)}
                placeholder={`Bundle of ${selectedItems.length} items`}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="bundlePrice">Bundle Price (optional)</Label>
              <Input
                id="bundlePrice"
                type="number"
                step="0.01"
                value={bundlePrice}
                onChange={(e) => setBundlePrice(e.target.value)}
                placeholder="0.00"
              />
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 justify-end pt-4 border-t">
          <Button 
            variant="outline" 
            onClick={onSkip}
            disabled={isCreating}
          >
            Process Individually
          </Button>
          <Button 
            onClick={handleCreateBundle}
            disabled={selectedItems.length < 2 || isCreating}
          >
            {isCreating ? 'Creating...' : `Create Bundle (${selectedItems.length} items)`}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}