import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ExternalLink, TrendingUp, TrendingDown, DollarSign, Package, Calendar } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/components/ui/use-toast";

interface EbayPricingData {
  suggestedPrice: number;
  analytics: {
    count: number;
    median: number;
    average: number;
    min: number;
    max: number;
    range: number;
    q1: number;
    q3: number;
  };
  items: Array<{
    title: string;
    price: number;
    currency: string;
    condition: string;
    sellingState: string;
    itemWebUrl: string;
    image?: string;
    seller?: string;
    categories?: string[];
  }>;
  confidence: 'high' | 'medium' | 'low';
}

interface EbayPricingModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: {
    id: string;
    title: string | null;
    isbn: string | null;
  } | null;
}

export function EbayPricingModal({ isOpen, onClose, item }: EbayPricingModalProps) {
  const [loading, setLoading] = useState(false);
  const [pricingData, setPricingData] = useState<EbayPricingData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const fetchEbayPricing = async () => {
    if (!item) return;
    
    setLoading(true);
    setError(null);
    setPricingData(null);
    
    try {
      const payload: any = {};
      
      if (item.isbn) {
        payload.isbn = item.isbn;
      } else if (item.title) {
        payload.query = item.title;
      } else {
        throw new Error("No ISBN or title available for pricing lookup");
      }

      const { data, error } = await supabase.functions.invoke('ebay-pricing', {
        body: payload
      });

      if (error) {
        const status = (error as any)?.status;
        const context = (error as any)?.context as any;
        const code = context?.code;
        let message = context?.error || error.message || 'Failed to get eBay pricing data';

        if (code === 'EBAY_NOT_CONNECTED') {
          message = 'Connect your eBay account to fetch pricing data.';
        } else if (code === 'EBAY_REFRESH_FAILED') {
          message = 'Your eBay session expired. Please reconnect eBay.';
        } else if (code === 'EBAY_UNAUTHORIZED' || code === 'EBAY_FORBIDDEN') {
          message = 'eBay authorization failed. Please reconnect eBay.';
        } else if (status === 401 && message.includes('Unauthorized')) {
          message = 'You must sign in to fetch pricing data.';
        }

        setError(message);
        toast({
          title: 'Pricing Error',
          description: message,
          variant: 'destructive'
        });
        return;
      }
      
      if (data.analytics?.count === 0) {
        setError("No sold listings found for this item");
        return;
      }

      setPricingData(data);
    } catch (err: any) {
      console.error('eBay pricing error:', err);
      setError(err.message || 'Failed to get eBay pricing data');
      toast({
        title: "Pricing Error",
        description: "Could not fetch eBay pricing data. Make sure eBay is connected.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const getConfidenceBadge = (confidence: string) => {
    const variants = {
      high: "bg-success/10 text-success border-success/20",
      medium: "bg-warning/10 text-warning border-warning/20", 
      low: "bg-destructive/10 text-destructive border-destructive/20"
    };
    return (
      <Badge variant="outline" className={variants[confidence as keyof typeof variants]}>
        {confidence.toUpperCase()} CONFIDENCE
      </Badge>
    );
  };

  const formatPrice = (price: number) => `$${price.toFixed(2)}`;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <DollarSign className="w-5 h-5" />
            eBay Sold Comps - {item?.title || 'Item'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {!pricingData && !loading && !error && (
            <div className="text-center py-8">
              <Package className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground mb-4">
                Get pricing data from recent eBay sold listings
              </p>
              <Button onClick={fetchEbayPricing}>
                Get eBay Pricing
              </Button>
            </div>
          )}

          {loading && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <Skeleton className="h-6 w-32" />
                <Skeleton className="h-6 w-24" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[1, 2, 3].map(i => (
                  <Card key={i}>
                    <CardContent className="p-4">
                      <Skeleton className="h-4 w-20 mb-2" />
                      <Skeleton className="h-8 w-16" />
                    </CardContent>
                  </Card>
                ))}
              </div>
              <div className="space-y-2">
                {[1, 2, 3].map(i => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            </div>
          )}

          {error && (
            <div className="text-center py-8">
              <div className="text-destructive mb-4">{error}</div>
              <Button variant="outline" onClick={fetchEbayPricing}>
                Try Again
              </Button>
            </div>
          )}

          {pricingData && (
            <>
              {/* Pricing Summary */}
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-semibold">Pricing Analysis</h3>
                {getConfidenceBadge(pricingData.confidence)}
              </div>

              {/* Key Metrics */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card>
                  <CardContent className="p-4 text-center">
                    <div className="text-sm text-muted-foreground">Suggested Price</div>
                    <div className="text-2xl font-bold text-primary">
                      {formatPrice(pricingData.suggestedPrice)}
                    </div>
                    <div className="text-xs text-muted-foreground">Median</div>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardContent className="p-4 text-center">
                    <div className="text-sm text-muted-foreground">Average</div>
                    <div className="text-xl font-semibold">
                      {formatPrice(pricingData.analytics.average)}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-4 text-center">
                    <div className="text-sm text-muted-foreground">Price Range</div>
                    <div className="text-sm font-medium">
                      {formatPrice(pricingData.analytics.min)} - {formatPrice(pricingData.analytics.max)}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      ${pricingData.analytics.range.toFixed(2)} spread
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-4 text-center">
                    <div className="text-sm text-muted-foreground">Data Points</div>
                    <div className="text-xl font-semibold">
                      {pricingData.analytics.count}
                    </div>
                    <div className="text-xs text-muted-foreground">sold items</div>
                  </CardContent>
                </Card>
              </div>

              {/* Recent Sold Items */}
              <div>
                <h4 className="font-semibold mb-3 flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  Recent Sold Listings ({pricingData.items.length})
                </h4>
                
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {pricingData.items.slice(0, 10).map((soldItem, index) => (
                    <Card key={index} className="hover:shadow-md transition-shadow">
                      <CardContent className="p-3">
                        <div className="flex gap-3">
                          {soldItem.image && (
                            <img 
                              src={soldItem.image} 
                              alt="Item"
                              className="w-12 h-12 object-cover rounded flex-shrink-0"
                            />
                          )}
                          
                          <div className="flex-1 min-w-0">
                            <div className="flex justify-between items-start gap-2 mb-1">
                              <h5 className="font-medium text-sm line-clamp-2 flex-1">
                                {soldItem.title}
                              </h5>
                              <div className="text-right flex-shrink-0">
                                <div className="font-bold text-primary">
                                  {formatPrice(soldItem.price)}
                                </div>
                                {soldItem.price > pricingData.analytics.median ? (
                                  <TrendingUp className="w-3 h-3 text-success inline ml-1" />
                                ) : (
                                  <TrendingDown className="w-3 h-3 text-muted-foreground inline ml-1" />
                                )}
                              </div>
                            </div>
                            
                            <div className="flex items-center justify-between text-xs text-muted-foreground">
                              <span>Condition: {soldItem.condition || 'N/A'}</span>
                              {soldItem.seller && <span>Seller: {soldItem.seller}</span>}
                            </div>
                          </div>
                          
                          {soldItem.itemWebUrl && (
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => window.open(soldItem.itemWebUrl, '_blank')}
                            >
                              <ExternalLink className="w-3 h-3" />
                            </Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2 pt-4 border-t">
                <Button variant="outline" onClick={fetchEbayPricing}>
                  Refresh Data
                </Button>
                <Button onClick={onClose}>
                  Close
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}