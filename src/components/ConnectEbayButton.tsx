// ============================================================================
// File: src/components/ConnectEbayButton.tsx  (same-tab, iOS-safe)
// ============================================================================
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Link as LinkIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/use-toast";

type EbayOAuthStartResponse = {
  authorizeUrl: string;
};

export function ConnectEbayButton() {
  const [loading, setLoading] = useState(false);

  const startOAuth = async () => {
    if (loading) return; // why: avoid duplicate invocations on rapid taps/clicks
    try {
      setLoading(true);
      const { data, error } = await supabase.functions.invoke<EbayOAuthStartResponse>(
        "ebay-oauth-start",
        {
          body: {
            // why: strip hash to avoid polluting OAuth return URL
            returnUrl: window.location.href.split("#")[0],
          },
        }
      );
      if (error || !data?.authorizeUrl) {
        throw new Error(error?.message || "No authorization URL");
      }
      // same tab to satisfy iOS gesture rules
      window.location.href = data.authorizeUrl;
      return;
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      toast({
        title: "eBay connect failed",
        description: message || "Please try again.",
        variant: "destructive",
      });
      setLoading(false);
    }
  };

  return (
    <Button
      variant="gradient"
      size="lg"
      onClick={startOAuth}
      disabled={loading}
      aria-busy={loading}
      className="h-20 flex-col"
    >
      {loading ? (
        <Loader2 className="w-6 h-6 mb-2 animate-spin" aria-hidden="true" />
      ) : (
        <LinkIcon className="w-6 h-6 mb-2" aria-hidden="true" />
      )}
      {loading ? "Connecting…" : "Connect eBay"}
    </Button>
  );
}

