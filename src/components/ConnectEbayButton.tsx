import { useState } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Link as LinkIcon } from "lucide-react";

export const ConnectEbayButton = () => {
  const [loading, setLoading] = useState(false);

  const handleConnect = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase.functions.invoke("ebay-oauth-start");
      if (error) throw error;
      const url = (data as any)?.authorizeUrl as string | undefined;
      if (!url) throw new Error("Authorization URL not returned");
      window.location.href = url;
    } catch (err) {
      console.error("Failed to start eBay OAuth:", err);
      alert("Couldn't start eBay connection. Please try again.");
    } finally {
      setLoading(false);
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
      {loading ? (
        <Loader2 className="w-6 h-6 mb-2 animate-spin" />
      ) : (
        <LinkIcon className="w-6 h-6 mb-2" />
      )}
      {loading ? "Connecting…" : "Connect eBay"}
    </Button>
  );
};
