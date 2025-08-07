import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { BookOpen, DollarSign, Sparkles, Loader2 } from "lucide-react";
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

interface CreateListingModalProps {
  item: InventoryItem | null;
  isOpen: boolean;
  onClose: () => void;
}

export function CreateListingModal({ item, isOpen, onClose }: CreateListingModalProps) {
  const { toast } = useToast();
  const [isGeneratingListing, setIsGeneratingListing] = useState(false);
  const [listingData, setListingData] = useState({
    title: item?.title || item?.suggested_title || "",
    price: item?.suggested_price?.toString() || "",
    description: item?.author ? `By ${item?.author}${item?.publisher ? ` - ${item?.publisher}` : ''}${item?.publication_year ? ` (${item?.publication_year})` : ''}` : "",
    condition: item?.condition_assessment || "good",
    category: item?.suggested_category || (item?.genre?.toLowerCase().includes('magazine') ? 'magazine' : 'book')
  });

  const generateOptimizedListing = async () => {
    if (!item) return;
    
    setIsGeneratingListing(true);
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
        // Handle both string and object responses from the AI
        let title = data.optimizedListing.title;
        let description = data.optimizedListing.description;
        
        // If the response contains JSON markup, extract and parse it
        if (typeof data.optimizedListing.description === 'string') {
          let jsonString = data.optimizedListing.description.trim();
          
          // Remove markdown code block if present
          if (jsonString.startsWith('```json')) {
            jsonString = jsonString.replace(/^```json\s*/, '').replace(/\s*```$/, '');
          }
          
          // Try to parse as JSON
          if (jsonString.startsWith('{')) {
            try {
              const parsed = JSON.parse(jsonString);
              title = parsed.title || title;
              description = parsed.description || description;
            } catch (e) {
              console.warn('Failed to parse JSON description, using as-is');
              // If parsing fails, use the original description without the JSON markup
              description = data.optimizedListing.description.replace(/^```json\s*/, '').replace(/\s*```$/, '');
            }
          }
        }
        
        setListingData(prev => ({
          ...prev,
          title: title,
          description: description
        }));
        
        toast({
          title: "Listing Generated!",
          description: "SEO-optimized title and description have been generated.",
        });
      } else {
        throw new Error('Failed to generate optimized listing');
      }
    } catch (error) {
      console.error('Error generating listing:', error);
      toast({
        title: "Generation Failed",
        description: error.message || "Could not generate optimized listing. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsGeneratingListing(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log('Creating listing for item:', item?.id, 'with data:', listingData);
    // TODO: Implement actual listing creation
    onClose();
  };

  if (!item) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Listing</DialogTitle>
          <DialogDescription>
            Create a marketplace listing for this item with customizable details and pricing.
          </DialogDescription>
        </DialogHeader>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Item Preview */}
          <div className="space-y-4">
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
            
            <div className="space-y-2">
              <h3 className="font-medium">Original Details</h3>
              <p className="text-sm text-muted-foreground">
                <strong>Title:</strong> {item.title || 'Unknown'}
              </p>
              <p className="text-sm text-muted-foreground">
                <strong>Author:</strong> {item.author || 'Unknown'}
              </p>
              <p className="text-sm text-muted-foreground">
                <strong>Suggested Price:</strong> ${item.suggested_price?.toFixed(2) || '0.00'}
              </p>
              <div className="flex items-center gap-2">
                <Badge variant="outline">{item.suggested_category}</Badge>
                <Badge variant="outline" className="bg-success/10 text-success border-success/20">
                  {item.confidence_score || 0}% confidence
                </Badge>
              </div>
            </div>
          </div>

          {/* Listing Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="font-medium">Listing Details</h3>
              <Button 
                type="button" 
                variant="outline" 
                size="sm"
                onClick={generateOptimizedListing}
                disabled={isGeneratingListing}
              >
                {isGeneratingListing ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4 mr-2" />
                )}
                {isGeneratingListing ? 'Generating...' : 'AI Optimize'}
              </Button>
            </div>

            <div className="space-y-2">
              <Label htmlFor="title">Listing Title</Label>
              <Input
                id="title"
                value={listingData.title}
                onChange={(e) => setListingData({...listingData, title: e.target.value})}
                placeholder="Enter listing title"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="price">Price ($)</Label>
              <Input
                id="price"
                type="number"
                step="0.01"
                value={listingData.price}
                onChange={(e) => setListingData({...listingData, price: e.target.value})}
                placeholder="0.00"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="condition">Condition</Label>
              <Select value={listingData.condition} onValueChange={(value) => setListingData({...listingData, condition: value})}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="new">New</SelectItem>
                  <SelectItem value="like-new">Like New</SelectItem>
                  <SelectItem value="good">Good</SelectItem>
                  <SelectItem value="fair">Fair</SelectItem>
                  <SelectItem value="poor">Poor</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="category">Category</Label>
              <Select value={listingData.category} onValueChange={(value) => setListingData({...listingData, category: value})}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="book">Book</SelectItem>
                  <SelectItem value="magazine">Magazine</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={listingData.description}
                onChange={(e) => setListingData({...listingData, description: e.target.value})}
                placeholder="Describe the item condition, special features, etc."
                rows={4}
              />
            </div>

            <div className="flex gap-2 pt-4">
              <Button type="button" variant="outline" onClick={onClose} className="flex-1">
                Cancel
              </Button>
              <Button type="submit" className="flex-1">
                <DollarSign className="w-4 h-4 mr-2" />
                Create Listing
              </Button>
            </div>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}