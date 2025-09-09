// ============================================================================
// File: src/components/ConnectEbayButton.tsx  (same-tab, iOS-safe)
// ============================================================================
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Link as LinkIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/use-toast";

export function ConnectEbayButton() {
  const [loading, setLoading] = useState(false);

  const startOAuth = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase.functions.invoke("ebay-oauth-start", {
        body: { returnUrl: window.location.href.split("#")[0] },
      });
      if (error || !data?.authorizeUrl) throw new Error(error?.message || "No authorization URL");
      window.location.href = data.authorizeUrl; // same tab
    } catch (e: any) {
      toast({ title: "eBay connect failed", description: e.message, variant: "destructive" });
      setLoading(false);
    }
  };

  return (
    <Button 
      variant="gradient" 
      size="lg" 
      onClick={startOAuth} 
      disabled={loading}
      className="h-20 flex-col"
    >
      {loading ? <Loader2 className="w-6 h-6 mb-2 animate-spin" /> : <LinkIcon className="w-6 h-6 mb-2" />}
      {loading ? "Connecting…" : "Connect eBay"}
    </Button>
  );
}

