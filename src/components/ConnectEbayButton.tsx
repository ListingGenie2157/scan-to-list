import { useState } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Link as LinkIcon } from "lucide-react";
import { toast } from "@/components/ui/use-toast";

const START_FN = "ebay-oauth-start";            // match your deployed name
const ENV = "production";                       // force prod

export const ConnectEbayButton = () => {
  const [loading, setLoading] = useState(false);

  const handleConnect = async () => {
    if (loading) return;

    try {
      setLoading(true);

      // Ensure signed in
      const { data: sess } = await supabase.auth.getSession();
      if (!sess?.session) throw new Error("Sign in first.");

      // Start OAuth (PROD + returnUrl)
      const { data, error } = await supabase.functions.invoke<{ authorizeUrl: string }>(START_FN, {
        body: { environment: ENV, returnUrl: `${window.location.origin}/?ebay=connected` },
      });
      if (error) throw new Error(error.message || "Failed to start eBay OAuth");
      if (!data?.authorizeUrl) throw new Error("No authorization URL received");

      // Redirect current window to avoid any popup blockers entirely
      window.location.assign(data.authorizeUrl);
    } catch (e: any) {
      setLoading(false);
      toast({ title: "Error", description: e?.message || "Failed to connect to eBay", variant: "destructive" });
    }
  };

  return (
    <Button
      variant="outline"
      size="lg"
      className="h-20 flex-col"
      onClick={handleConnect}
      disabled={loading}
    >
      {loading ? <Loader2 className="w-6 h-6 mb-2 animate-spin" /> : <LinkIcon className="w-6 h-6 mb-2" />}
      {loading ? "Connecting…" : "Connect eBay"}
    </Button>
  );
};
