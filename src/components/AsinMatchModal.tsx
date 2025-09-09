import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ExternalLink, Search, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface InventoryItem {
  id: string;
  title: string | null;
  author: string | null;
  isbn: string | null;
  issue_number: string | null;
  series_title?: string | null;
  type?: string | null;
  amazon_asin?: string | null;
  amazon_title?: string | null;
  amazon_match_confidence?: number | null;
}

interface AsinMatchModalProps {
  item: InventoryItem | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function AsinMatchModal({ item, isOpen, onClose, onSuccess }: AsinMatchModalProps) {
  const { toast } = useToast();
  const [asin, setAsin] = useState("");
  const [suggestedAsin, setSuggestedAsin] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // Reset form when modal opens/closes or item changes
  useEffect(() => {
    if (isOpen && item) {
      setAsin(item.amazon_asin || "");
      
      // Auto-suggest ASIN for books with ISBN-13
      if (item.type === 'book' && item.isbn && item.isbn.length === 13) {
        // Convert ISBN-13 to ISBN-10 for Amazon lookup
        const isbn10 = convertIsbn13To10(item.isbn);
        setSuggestedAsin(isbn10 || "");
      } else {
        setSuggestedAsin("");
      }
    } else {
      setAsin("");
      setSuggestedAsin("");
    }
  }, [isOpen, item]);

  const convertIsbn13To10 = (isbn13: string): string | null => {
    if (!isbn13 || isbn13.length !== 13 || !isbn13.startsWith('978')) {
      return null;
    }

    // Remove the 978 prefix and the last check digit
    const isbn9 = isbn13.slice(3, 12);
    
    // Calculate ISBN-10 check digit
    let sum = 0;
    for (let i = 0; i < 9; i++) {
      sum += parseInt(isbn9[i]) * (10 - i);
    }
    
    const checkDigit = 11 - (sum % 11);
    const finalDigit = checkDigit === 11 ? '0' : checkDigit === 10 ? 'X' : checkDigit.toString();
    
    return isbn9 + finalDigit;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!item || !asin.trim()) return;

    setIsLoading(true);
    try {
      const { error } = await supabase
        .from('inventory_items')
        .update({
          amazon_asin: asin.trim(),
          amazon_match_confidence: 95, // High confidence for manual entry
          amazon_title: `Amazon ASIN: ${asin.trim()}`,
          updated_at: new Date().toISOString()
        })
        .eq('id', item.id);

      if (error) throw error;

      toast({
        title: "ASIN Matched Successfully!",
        description: `Amazon ASIN ${asin.trim()} has been saved for this item.`,
      });

      onSuccess?.();
      onClose();
    } catch (error) {
      console.error('Error saving ASIN:', error);
      toast({
        title: "Error Saving ASIN",
        description: "Failed to save Amazon ASIN. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const getSearchLinks = () => {
    if (!item) return [];

    const links = [];
    
    if (item.type === 'book') {
      // Amazon search for books
      const bookQuery = `${item.title || ''} ${item.author || ''}`.trim();
      if (bookQuery) {
        links.push({
          name: "Amazon Books",
          url: `https://www.amazon.com/s?k=${encodeURIComponent(bookQuery)}&i=stripbooks`
        });
      }
      
      // ISBN search if available
      if (item.isbn) {
        links.push({
          name: "Amazon ISBN Search",
          url: `https://www.amazon.com/s?k=${encodeURIComponent(item.isbn)}&i=stripbooks`
        });
      }
    } else if (item.type === 'magazine') {
      // Amazon search for magazines
      const magQuery = `${item.series_title || item.title || ''} ${item.issue_number || ''}`.trim();
      if (magQuery) {
        links.push({
          name: "Amazon Magazines",
          url: `https://www.amazon.com/s?k=${encodeURIComponent(magQuery)}&i=magazines`
        });
      }
    }

    return links;
  };

  if (!item) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Match Amazon ASIN (Optional)</DialogTitle>
          <DialogDescription>
            This is optional. It links your item to its Amazon product page for better cross-platform integration.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Item Info */}
          <div className="bg-muted/50 p-3 rounded-lg space-y-2">
            <h4 className="font-medium text-sm">{item.title || 'Unknown Title'}</h4>
            {item.author && (
              <p className="text-xs text-muted-foreground">By {item.author}</p>
            )}
            {item.isbn && (
              <Badge variant="outline" className="text-xs">ISBN: {item.isbn}</Badge>
            )}
            {item.type && (
              <Badge variant="outline" className="text-xs capitalize">{item.type}</Badge>
            )}
          </div>

          {/* Suggested ASIN for books */}
          {suggestedAsin && (
            <div className="bg-blue-50 dark:bg-blue-950/20 p-3 rounded-lg">
              <Label className="text-sm font-medium text-blue-700 dark:text-blue-300">
                Suggested ASIN (from ISBN)
              </Label>
              <div className="flex items-center gap-2 mt-1">
                <code className="text-sm bg-white dark:bg-gray-800 px-2 py-1 rounded">
                  {suggestedAsin}
                </code>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setAsin(suggestedAsin)}
                >
                  Use This
                </Button>
              </div>
            </div>
          )}

          {/* ASIN Input */}
          <div className="space-y-2">
            <Label htmlFor="asin">Amazon ASIN</Label>
            <Input
              id="asin"
              value={asin}
              onChange={(e) => setAsin(e.target.value)}
              placeholder="B07EXAMPLE or 1234567890"
              maxLength={20}
              required
            />
            <p className="text-xs text-muted-foreground">
              Enter the Amazon Standard Identification Number (ASIN) for this item.
            </p>
          </div>

          {/* Search Links */}
          {getSearchLinks().length > 0 && (
            <div className="space-y-2">
              <Label className="text-sm">Find on Amazon:</Label>
              <div className="flex flex-wrap gap-2">
                {getSearchLinks().map((link) => (
                  <Button
                    key={link.name}
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => window.open(link.url, '_blank')}
                    className="text-xs"
                  >
                    <Search className="w-3 h-3 mr-1" />
                    {link.name}
                    <ExternalLink className="w-3 h-3 ml-1" />
                  </Button>
                ))}
              </div>
            </div>
          )}

          {/* Current ASIN Status */}
          {item.amazon_asin && (
            <div className="bg-green-50 dark:bg-green-950/20 p-3 rounded-lg">
              <Label className="text-sm font-medium text-green-700 dark:text-green-300">
                Current ASIN
              </Label>
              <div className="flex items-center gap-2 mt-1">
                <code className="text-sm bg-white dark:bg-gray-800 px-2 py-1 rounded">
                  {item.amazon_asin}
                </code>
                <Badge variant="outline" className="text-xs">
                  {item.amazon_match_confidence}% confidence
                </Badge>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-4">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">
              Cancel
            </Button>
            <Button 
              type="submit" 
              className="flex-1" 
              disabled={isLoading || !asin.trim()}
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                "Match ASIN"
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}