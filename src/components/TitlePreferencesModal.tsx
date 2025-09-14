import { useState, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { X, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

interface TitlePreferencesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const PRESET_PREFIXES = [
  "NEW",
  "BRAND NEW", 
  "MINT",
  "RARE",
  "VINTAGE",
  "COLLECTIBLE"
];

const PRESET_SUFFIXES = [
  "FREE SHIPPING",
  "FAST SHIPPING", 
  "FREE RETURNS",
  "BEST OFFER",
  "NO RESERVE",
  "MINT CONDITION"
];

export const TitlePreferencesModal = ({ isOpen, onClose }: TitlePreferencesModalProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [prefixes, setPrefixes] = useState<string[]>([]);
  const [suffixes, setSuffixes] = useState<string[]>([]);
  const [customText, setCustomText] = useState("");
  const [newPrefix, setNewPrefix] = useState("");
  const [newSuffix, setNewSuffix] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const fetchUserPreferences = useCallback(async () => {
    if (!user) return;
    
    const { data, error } = await supabase
      .from('user_profiles')
      .select('title_prefixes, title_suffixes, custom_title_text')
      .eq('id', user.id)
      .maybeSingle();

    if (error) {
      console.error('Error fetching preferences:', error);
      return;
    }

    if (data) {
      setPrefixes(data.title_prefixes || []);
      setSuffixes(data.title_suffixes || []);
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
        custom_text: customText
      });

      if (error) throw error;

      toast({
        title: "Preferences saved",
        description: "Your title preferences have been updated.",
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

  const removePrefix = (prefix: string) => {
    setPrefixes(prefixes.filter(p => p !== prefix));
  };

  const removeSuffix = (suffix: string) => {
    setSuffixes(suffixes.filter(s => s !== suffix));
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Title Preferences</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6">
          <p className="text-sm text-muted-foreground">
            Customize phrases that will be automatically added to your AI-generated listing titles.
          </p>

          <Tabs defaultValue="prefixes" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="prefixes">Prefixes</TabsTrigger>
              <TabsTrigger value="suffixes">Suffixes</TabsTrigger>
              <TabsTrigger value="custom">Custom Text</TabsTrigger>
            </TabsList>

            <TabsContent value="prefixes" className="space-y-4">
              <div>
                <Label>Add Prefix</Label>
                <div className="flex gap-2 mt-2">
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
              </div>

              <div>
                <Label>Quick Add Presets</Label>
                <div className="flex flex-wrap gap-2 mt-2">
                  {PRESET_PREFIXES.map((preset) => (
                    <Badge
                      key={preset}
                      variant="outline"
                      className="cursor-pointer hover:bg-accent"
                      onClick={() => addPrefix(preset)}
                    >
                      {preset}
                    </Badge>
                  ))}
                </div>
              </div>

              <div>
                <Label>Active Prefixes</Label>
                <div className="flex flex-wrap gap-2 mt-2">
                  {prefixes.map((prefix) => (
                    <Badge key={prefix} variant="default" className="flex items-center gap-1">
                      {prefix}
                      <X
                        className="h-3 w-3 cursor-pointer"
                        onClick={() => removePrefix(prefix)}
                      />
                    </Badge>
                  ))}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="suffixes" className="space-y-4">
              <div>
                <Label>Add Suffix</Label>
                <div className="flex gap-2 mt-2">
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
              </div>

              <div>
                <Label>Quick Add Presets</Label>
                <div className="flex flex-wrap gap-2 mt-2">
                  {PRESET_SUFFIXES.map((preset) => (
                    <Badge
                      key={preset}
                      variant="outline"
                      className="cursor-pointer hover:bg-accent"
                      onClick={() => addSuffix(preset)}
                    >
                      {preset}
                    </Badge>
                  ))}
                </div>
              </div>

              <div>
                <Label>Active Suffixes</Label>
                <div className="flex flex-wrap gap-2 mt-2">
                  {suffixes.map((suffix) => (
                    <Badge key={suffix} variant="default" className="flex items-center gap-1">
                      {suffix}
                      <X
                        className="h-3 w-3 cursor-pointer"
                        onClick={() => removeSuffix(suffix)}
                      />
                    </Badge>
                  ))}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="custom" className="space-y-4">
              <div>
                <Label htmlFor="custom-text">Custom Text</Label>
                <Textarea
                  id="custom-text"
                  value={customText}
                  onChange={(e) => setCustomText(e.target.value)}
                  placeholder="Enter any custom text to always include in titles..."
                  className="mt-2"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  This text will be included in every AI-generated title. 
                  Tip: Add "FREE SHIPPING" to suffixes to include it in every listing.
                </p>
              </div>
            </TabsContent>
          </Tabs>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={savePreferences} disabled={isLoading}>
              {isLoading ? "Saving..." : "Save Preferences"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};