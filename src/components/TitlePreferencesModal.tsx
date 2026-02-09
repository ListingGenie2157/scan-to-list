import { useState, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { X, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

interface TitlePreferencesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const CONDITION_KEYWORDS = [
  "New", "Vintage", "Rare", "Collectible", "Classic", "Mint", "Original"
];

const SHIPPING_KEYWORDS = [
  "Free Shipping", "Fast Shipping", "Free Returns"
];

export const TitlePreferencesModal = ({ isOpen, onClose }: TitlePreferencesModalProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [prefixes, setPrefixes] = useState<string[]>([]);
  const [suffixes, setSuffixes] = useState<string[]>([]);
  const [titleKeywords, setTitleKeywords] = useState<string[]>([]);
  const [shippingKeywords, setShippingKeywords] = useState<string[]>([]);
  const [customText, setCustomText] = useState("");
  const [newPrefix, setNewPrefix] = useState("");
  const [newSuffix, setNewSuffix] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const fetchUserPreferences = useCallback(async () => {
    if (!user) return;
    
    const { data, error } = await supabase
      .from('user_profiles')
      .select('title_prefixes, title_suffixes, custom_title_text, title_keywords, shipping_keywords')
      .eq('id', user.id)
      .maybeSingle();

    if (error) {
      console.error('Error fetching preferences:', error);
      return;
    }

    if (data) {
      setPrefixes(data.title_prefixes || []);
      setSuffixes(data.title_suffixes || []);
      setTitleKeywords(data.title_keywords || []);
      setShippingKeywords(data.shipping_keywords || []);
      setCustomText(data.custom_title_text || "");
    }
  }, [user]);

  useEffect(() => {
    if (isOpen && user) {
      fetchUserPreferences();
    }
  }, [isOpen, user, fetchUserPreferences]);

  const savePreferences = async () => {
    if (!user) return;
    
    setIsLoading(true);
    try {
      const { error } = await supabase.rpc('update_title_preferences', {
        user_id_param: user.id,
        prefixes,
        suffixes,
        custom_text: customText,
        keywords: titleKeywords,
        shipping_kw: shippingKeywords
      });

      if (error) throw error;

      toast({
        title: "Preferences saved",
        description: "Your listing preferences have been updated.",
      });
      onClose();
    } catch (error) {
      console.error('Error saving preferences:', error);
      toast({
        title: "Error",
        description: "Failed to save preferences. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const toggleKeyword = (keyword: string, list: string[], setList: (v: string[]) => void) => {
    if (list.includes(keyword)) {
      setList(list.filter(k => k !== keyword));
    } else {
      setList([...list, keyword]);
    }
  };

  const addPrefix = (prefix: string) => {
    if (prefix && !prefixes.includes(prefix.toUpperCase())) {
      setPrefixes([...prefixes, prefix.toUpperCase()]);
      setNewPrefix("");
    }
  };

  const addSuffix = (suffix: string) => {
    if (suffix && !suffixes.includes(suffix.toUpperCase())) {
      setSuffixes([...suffixes, suffix.toUpperCase()]);
      setNewSuffix("");
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Listing Preferences</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6">
          <p className="text-sm text-muted-foreground">
            Customize what gets included in your AI-generated listing titles. Only selected keywords will appear.
          </p>

          {/* Condition Keywords */}
          <div className="space-y-3">
            <Label className="text-base font-medium">Condition Keywords</Label>
            <p className="text-xs text-muted-foreground">
              Select keywords to include in your titles. Nothing is added by default.
            </p>
            <div className="flex flex-wrap gap-2">
              {CONDITION_KEYWORDS.map((keyword) => {
                const isSelected = titleKeywords.includes(keyword);
                return (
                  <Badge
                    key={keyword}
                    variant={isSelected ? "default" : "outline"}
                    className={`cursor-pointer transition-colors ${
                      isSelected ? "" : "hover:bg-accent"
                    }`}
                    onClick={() => toggleKeyword(keyword, titleKeywords, setTitleKeywords)}
                  >
                    {keyword}
                    {isSelected && <X className="h-3 w-3 ml-1" />}
                  </Badge>
                );
              })}
            </div>
          </div>

          {/* Shipping Keywords */}
          <div className="space-y-3">
            <Label className="text-base font-medium">Shipping Keywords</Label>
            <p className="text-xs text-muted-foreground">
              Select shipping-related phrases to append to titles.
            </p>
            <div className="flex flex-wrap gap-2">
              {SHIPPING_KEYWORDS.map((keyword) => {
                const isSelected = shippingKeywords.includes(keyword);
                return (
                  <Badge
                    key={keyword}
                    variant={isSelected ? "default" : "outline"}
                    className={`cursor-pointer transition-colors ${
                      isSelected ? "" : "hover:bg-accent"
                    }`}
                    onClick={() => toggleKeyword(keyword, shippingKeywords, setShippingKeywords)}
                  >
                    {keyword}
                    {isSelected && <X className="h-3 w-3 ml-1" />}
                  </Badge>
                );
              })}
            </div>
          </div>

          {/* Custom Prefixes */}
          <div className="space-y-3">
            <Label className="text-base font-medium">Custom Prefixes</Label>
            <div className="flex gap-2">
              <Input
                value={newPrefix}
                onChange={(e) => setNewPrefix(e.target.value)}
                placeholder="Enter custom prefix..."
                onKeyPress={(e) => e.key === 'Enter' && addPrefix(newPrefix)}
              />
              <Button onClick={() => addPrefix(newPrefix)} size="sm">
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            {prefixes.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {prefixes.map((prefix) => (
                  <Badge key={prefix} variant="default" className="flex items-center gap-1">
                    {prefix}
                    <X className="h-3 w-3 cursor-pointer" onClick={() => setPrefixes(prefixes.filter(p => p !== prefix))} />
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* Custom Suffixes */}
          <div className="space-y-3">
            <Label className="text-base font-medium">Custom Suffixes</Label>
            <div className="flex gap-2">
              <Input
                value={newSuffix}
                onChange={(e) => setNewSuffix(e.target.value)}
                placeholder="Enter custom suffix..."
                onKeyPress={(e) => e.key === 'Enter' && addSuffix(newSuffix)}
              />
              <Button onClick={() => addSuffix(newSuffix)} size="sm">
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            {suffixes.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {suffixes.map((suffix) => (
                  <Badge key={suffix} variant="default" className="flex items-center gap-1">
                    {suffix}
                    <X className="h-3 w-3 cursor-pointer" onClick={() => setSuffixes(suffixes.filter(s => s !== suffix))} />
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* Custom Text */}
          <div className="space-y-3">
            <Label className="text-base font-medium">Custom Text</Label>
            <Textarea
              value={customText}
              onChange={(e) => setCustomText(e.target.value)}
              placeholder="Enter any custom text to always include in titles..."
            />
            <p className="text-xs text-muted-foreground">
              This text will be included in every AI-generated title.
            </p>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={savePreferences} disabled={isLoading}>
              {isLoading ? "Saving..." : "Save Preferences"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
