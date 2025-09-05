import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DollarSign, ExternalLink, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/components/ui/use-toast";

interface ItemLike {
  isbn?: string;
  issn?: string;
  title?: string;
  condition?: "New" | "Used";
}

interface Props {
  item: ItemLike;
  open: boolean;
  onClose: () => void;
  onApply: (price: number) => void;
}

function makeSoldCompsLink(q: string) {
  const u = new URL("https://www.ebay.com/sch/i.html");
  u.searchParams.set("_nkw", q);
  u.searchParams.set("LH_Sold", "1");
  u.searchParams.set("LH_Complete", "1");
  return u.toString();
}

export default function EbayPricingModal({ item, open, onClose, onApply }: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [limit, setLimit] = useState(50);
  const [includeShipping, setIncludeShipping] = useState(true);
  const [data, setData] = useState<null | {
    suggestedPrice: number;
    count: number;
    analytics: null | {
      average: number; median: number; min: number; max: number;
      P10: number; P25: number; P50: number; P75: number; P90: number;
    };
    links?: { soldComps?: string; activeSearch?: string };
  }>(null);

  const query = useMemo(() => (item.isbn || item.issn || item.title || "").toString().trim(), [item]);
  const condition = item.condition ?? "Used";
  const soldCompsHref = makeSoldCompsLink(query || "book");

  async function fetchPrice() {
    if (!query) {
      toast({ title: "Missing search term", description: "Provide ISBN/ISSN or a title.", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const payload: any = { condition, limit, includeShipping };
      if (item.isbn || item.issn) payload.isbn = query; else payload.query = query;
      const { data: res, error } = await supabase.functions.invoke("ebay-app-search", { body: payload });
      if (error) throw new Error(error.message);
      setData(res);
    } catch (e: any) {
      toast({ title: "Pricing failed", description: e.message ?? String(e), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>eBay Pricing</DialogTitle>
          <DialogDescription>Active listings only. Not sold comps. Use the link below to verify.</DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Badge variant="secondary">{condition}</Badge>
            <span className="text-sm text-muted-foreground">{query || "(no query)"}</span>
          </div>
          <a href={soldCompsHref} target="_blank" rel="noreferrer" className="inline-flex items-center text-sm underline">
            Check sold comps <ExternalLink className="ml-1 h-3 w-3" />
          </a>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-2">
          <div>
            <Label>Results per item</Label>
            <Input type="number" min={10} max={100} value={limit} onChange={(e) => setLimit(parseInt(e.target.value || "50"))} />
          </div>
          <div className="flex items-end gap-2">
            <Button variant="secondary" onClick={() => setIncludeShipping((v) => !v)} className="w-40">
              {includeShipping ? "Includes shipping" : "Price only"}
            </Button>
            <Button onClick={fetchPrice} disabled={loading}>
              {loading ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <DollarSign className="mr-2 h-4 w-4" />} 
              {loading ? "Fetching…" : "Get price"}
            </Button>
          </div>
        </div>

        {loading && <Skeleton className="h-24 w-full" />}

        {!loading && data && (
          <div className="grid gap-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs text-muted-foreground">Suggested</div>
                <div className="text-3xl font-semibold">
                  ${Number(data.suggestedPrice ?? 0).toFixed(2)}
                </div>
              </div>
              <Button onClick={() => onApply(Number(data.suggestedPrice ?? 0))}>Apply</Button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              <Card><CardContent className="p-3 text-center"><div className="text-xs">Count</div><div className="font-medium">{data.count}</div></CardContent></Card>
              <Card><CardContent className="p-3 text-center"><div className="text-xs">Median</div><div className="font-medium">{data.analytics ? `$${data.analytics.median.toFixed(2)}` : "—"}</div></CardContent></Card>
              <Card><CardContent className="p-3 text-center"><div className="text-xs">Avg</div><div className="font-medium">{data.analytics ? `$${data.analytics.average.toFixed(2)}` : "—"}</div></CardContent></Card>
              <Card><CardContent className="p-3 text-center"><div className="text-xs">Low</div><div className="font-medium">{data.analytics ? `$${data.analytics.min.toFixed(2)}` : "—"}</div></CardContent></Card>
              <Card><CardContent className="p-3 text-center"><div className="text-xs">High</div><div className="font-medium">{data.analytics ? `$${data.analytics.max.toFixed(2)}` : "—"}</div></CardContent></Card>
            </div>

            <div className="text-xs text-muted-foreground">Active listings data via eBay Browse API. Verify with sold comps before listing.</div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
