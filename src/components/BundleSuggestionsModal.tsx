import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Package, TrendingUp, Users, Sparkles, Loader2, DollarSign } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

interface BundleSuggestion {
  bundle_type: string;
  bundle_name: string;
  item_ids: string[];
  estimated_bundle_price: number;
  individual_total: number;
  savings_percentage: number;
  target_market: string;
  selling_points: string[];
}

interface BundleSuggestionsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const BundleSuggestionsModal = ({ isOpen, onClose }: BundleSuggestionsModalProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [suggestions, setSuggestions] = useState<BundleSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedItems, setSelectedItems] = useState<{[key: string]: any}>({});

  useEffect(() => {
    if (isOpen && user) {
      fetchBundleSuggestions();
    }
  }, [isOpen, user]);

  const fetchBundleSuggestions = async () => {
    if (!user) return;
    
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('analyze-inventory-bundles', {
        body: { userId: user.id }
      });

      if (error) throw error;

      if (data?.success) {
        setSuggestions(data.suggestions || []);
        
        // Fetch item details for display
        const allItemIds = data.suggestions.flatMap((s: BundleSuggestion) => s.item_ids);
        if (allItemIds.length > 0) {
          const { data: items } = await supabase
            .from('inventory_items')
            .select('id, title, author, suggested_price')
            .in('id', allItemIds);
          
          if (items) {
            const itemsMap = items.reduce((acc, item) => {
              acc[item.id] = item;
              return acc;
            }, {} as {[key: string]: any});
            setSelectedItems(itemsMap);
          }
        }
      }
    } catch (error) {
      console.error('Error fetching bundle suggestions:', error);
      toast({
        title: "Error",
        description: "Failed to fetch bundle suggestions. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const createBundle = async (suggestion: BundleSuggestion) => {
    if (!user) return;
    
    try {
      // Create bundle in database
      const { data: bundle, error: bundleError } = await supabase
        .from('bundles')
        .insert({
          user_id: user.id,
          bundle_name: suggestion.bundle_name,
          bundle_type: suggestion.bundle_type,
          total_items: suggestion.item_ids.length,
          bundle_price: suggestion.estimated_bundle_price
        })
        .select()
        .single();

      if (bundleError) throw bundleError;

      // Update inventory items to link to bundle
      const { error: updateError } = await supabase
        .from('inventory_items')
        .update({ 
          bundle_id: bundle.id,
          status: 'bundled'
        })
        .in('id', suggestion.item_ids);

      if (updateError) throw updateError;

      toast({
        title: "Bundle Created!",
        description: `${suggestion.bundle_name} has been created with ${suggestion.item_ids.length} items.`,
      });

      // Refresh suggestions
      fetchBundleSuggestions();
    } catch (error) {
      console.error('Error creating bundle:', error);
      toast({
        title: "Error",
        description: "Failed to create bundle. Please try again.",
        variant: "destructive",
      });
    }
  };

  const getBundleTypeIcon = (type: string) => {
    switch (type) {
      case 'series': return <Package className="h-4 w-4" />;
      case 'author': return <Users className="h-4 w-4" />;
      case 'genre': return <TrendingUp className="h-4 w-4" />;
      default: return <Sparkles className="h-4 w-4" />;
    }
  };

  const getBundleTypeColor = (type: string) => {
    switch (type) {
      case 'series': return 'bg-blue-500/10 text-blue-600 border-blue-200';
      case 'author': return 'bg-green-500/10 text-green-600 border-green-200';
      case 'genre': return 'bg-purple-500/10 text-purple-600 border-purple-200';
      case 'publisher': return 'bg-orange-500/10 text-orange-600 border-orange-200';
      case 'era': return 'bg-pink-500/10 text-pink-600 border-pink-200';
      default: return 'bg-gray-500/10 text-gray-600 border-gray-200';
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Bundle Suggestions
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6">
          <p className="text-sm text-muted-foreground">
            AI-generated bundle opportunities based on your inventory. Group similar items to increase sales and reduce listing time.
          </p>

          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin" />
              <span className="ml-2">Analyzing your inventory...</span>
            </div>
          ) : suggestions.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center">
                <Package className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-lg font-medium">No Bundle Opportunities Found</p>
                <p className="text-sm text-muted-foreground mt-2">
                  Add more items to your inventory to see bundle suggestions.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {suggestions.map((suggestion, index) => (
                <Card key={index} className="relative">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Badge className={getBundleTypeColor(suggestion.bundle_type)}>
                          {getBundleTypeIcon(suggestion.bundle_type)}
                          {suggestion.bundle_type.charAt(0).toUpperCase() + suggestion.bundle_type.slice(1)}
                        </Badge>
                        <CardTitle className="text-lg">{suggestion.bundle_name}</CardTitle>
                      </div>
                      <div className="text-right">
                        <div className="text-2xl font-bold text-green-600">
                          ${suggestion.estimated_bundle_price}
                        </div>
                        <div className="text-xs text-muted-foreground line-through">
                          ${suggestion.individual_total}
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                  
                  <CardContent className="space-y-4">
                    <div className="grid md:grid-cols-2 gap-4">
                      <div>
                        <h4 className="font-medium mb-2">Bundle Details</h4>
                        <div className="text-sm space-y-1">
                          <p><strong>Items:</strong> {suggestion.item_ids.length}</p>
                          <p><strong>Target Market:</strong> {suggestion.target_market}</p>
                          <p><strong>Savings:</strong> {suggestion.savings_percentage}% off individual prices</p>
                        </div>
                      </div>
                      
                      <div>
                        <h4 className="font-medium mb-2">Selling Points</h4>
                        <ul className="text-sm space-y-1">
                          {suggestion.selling_points.map((point, i) => (
                            <li key={i} className="flex items-start gap-1">
                              <span className="text-green-500 mt-0.5">•</span>
                              {point}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>

                    <Separator />

                    <div>
                      <h4 className="font-medium mb-2">Items in Bundle</h4>
                      <div className="grid gap-2 max-h-32 overflow-y-auto">
                        {suggestion.item_ids.map((itemId) => {
                          const item = selectedItems[itemId];
                          return item ? (
                            <div key={itemId} className="flex justify-between items-center text-sm bg-muted/50 p-2 rounded">
                              <span>
                                <strong>{item.title}</strong>
                                {item.author && ` by ${item.author}`}
                              </span>
                              <span className="text-muted-foreground">
                                ${item.suggested_price}
                              </span>
                            </div>
                          ) : null;
                        })}
                      </div>
                    </div>

                    <div className="flex justify-end gap-2 pt-2">
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => {
                          // TODO: Show detailed bundle preview
                        }}
                      >
                        Preview Bundle
                      </Button>
                      <Button 
                        size="sm"
                        onClick={() => createBundle(suggestion)}
                        className="bg-green-600 hover:bg-green-700"
                      >
                        <DollarSign className="h-4 w-4 mr-1" />
                        Create Bundle
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          <div className="flex justify-end">
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};