import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";

type PricingStrategy = "ACTIVE_LISTINGS" | "COVER_MULTIPLIER" | "FLAT" | "MIN_OF";

interface BulkPricingOptionsProps {
  items: any[];
  onPrices: (results: PriceResult[]) => void;
  loading?: boolean;
}

interface PriceResult {
  index: number;
  price: number;
  links: {
    soldComps: string;
  };
}

export interface BulkPricingConfig {
  strategy: PricingStrategy;
  multiplier: number;
  flat: number;
  floor: number;
  ceiling: number;
  round99: boolean;
  includeShipping: boolean;
  limitPerItem: number;
}

export function BulkPricingOptions({ items, onPrices, loading = false }: BulkPricingOptionsProps) {
  const [strategy, setStrategy] = useState<PricingStrategy>("ACTIVE_LISTINGS");
  const [multiplier, setMultiplier] = useState(0.8);
  const [flat, setFlat] = useState(10.0);
  const [floor, setFloor] = useState(5.0);
  const [ceiling, setCeiling] = useState(100.0);
  const [round99, setRound99] = useState(true);
  const [includeShipping, setIncludeShipping] = useState(false);
  const [limitPerItem, setLimitPerItem] = useState(50);

  const applyPricing = async () => {
    // TODO: Implement pricing logic using the strategy and parameters
    // This would call your pricing API/function and return results
    const results: PriceResult[] = items.map((item, index) => ({
      index,
      price: 10.00, // Placeholder - implement actual pricing logic
      links: {
        soldComps: `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(item.title || '')}&LH_Sold=1&LH_Complete=1`
      }
    }));
    
    onPrices(results);
  };

  return (
    <Card>
      <CardContent className="grid gap-3 p-4">
        <div>
          <Label className="mb-2 block">Pricing strategy</Label>
          <RadioGroup value={strategy} onValueChange={(v) => setStrategy(v as PricingStrategy)} className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <div className="flex items-center space-x-2"><RadioGroupItem value="ACTIVE_LISTINGS" id="s1" /><Label htmlFor="s1">Active listings</Label></div>
            <div className="flex items-center space-x-2"><RadioGroupItem value="COVER_MULTIPLIER" id="s2" /><Label htmlFor="s2">Cover × Multiplier</Label></div>
            <div className="flex items-center space-x-2"><RadioGroupItem value="FLAT" id="s3" /><Label htmlFor="s3">Flat</Label></div>
            <div className="flex items-center space-x-2"><RadioGroupItem value="MIN_OF" id="s4" /><Label htmlFor="s4">Min of above</Label></div>
          </RadioGroup>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          <div>
            <Label>Multiplier</Label>
            <Input type="number" step="0.05" value={multiplier} onChange={(e) => setMultiplier(parseFloat(e.target.value))} />
          </div>
          <div>
            <Label>Flat</Label>
            <Input type="number" step="0.5" value={flat} onChange={(e) => setFlat(parseFloat(e.target.value))} />
          </div>
          <div>
            <Label>Floor</Label>
            <Input type="number" step="0.5" value={floor} onChange={(e) => setFloor(parseFloat(e.target.value))} />
          </div>
          <div>
            <Label>Ceiling</Label>
            <Input type="number" step="1" value={ceiling} onChange={(e) => setCeiling(parseFloat(e.target.value))} />
          </div>
          <div className="flex items-center space-x-2 mt-6">
            <Switch checked={round99} onCheckedChange={setRound99} id="r99" /><Label htmlFor="r99">Round to .99</Label>
          </div>
          <div className="flex items-center space-x-2 mt-6">
            <Switch checked={includeShipping} onCheckedChange={setIncludeShipping} id="ship" /><Label htmlFor="ship">Include shipping</Label>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Results per item</Label>
            <Input type="number" min={10} max={100} value={limitPerItem} onChange={(e) => setLimitPerItem(parseInt(e.target.value || "50"))} />
          </div>
        </div>

        <Button onClick={applyPricing} disabled={loading}>{loading ? "Calculating…" : "Apply pricing"}</Button>
        <div className="text-xs text-muted-foreground">Active listings are not sold comps. Use the Sold Comps button per row to verify before listing.</div>
      </CardContent>
    </Card>
  );
}