import { useState } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Link as LinkIcon } from "lucide-react";

export const ConnectEbayButton = () => {
  const [loading, setLoading] = useState(false);

  const handleConnect = async () => {
    try {
      console.log("Starting eBay connection process...");
      setLoading(true);
      
      console.log("Invoking ebay-oauth-start function...");
      const { data, error } = await supabase.functions.invoke("ebay-oauth-start");
      
      console.log("Function response:", { data, error });
      
      if (error) {
        console.error("Function error:", error);
        throw error;
      }
      
      const url = (data as any)?.authorizeUrl as string | undefined;
      console.log("Authorization URL received:", url);
      
      if (!url) {
        console.error("No authorization URL in response:", data);
        throw new Error("Authorization URL not returned");
      }
      
      console.log("Redirecting to eBay...");
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
