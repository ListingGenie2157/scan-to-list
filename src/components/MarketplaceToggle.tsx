import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useMarketplaceSetting } from "@/hooks/useMarketplaceSetting";

export const MarketplaceToggle = () => {
  const { marketplace, setMarketplace } = useMarketplaceSetting();

  return (
    <div className="flex items-center gap-3">
      <Label htmlFor="marketplace-toggle" className="text-sm font-medium">
        eBay
      </Label>
      <Switch
        id="marketplace-toggle"
        checked={marketplace === 'amazon'}
        onCheckedChange={(checked) => setMarketplace(checked ? 'amazon' : 'ebay')}
      />
      <Label htmlFor="marketplace-toggle" className="text-sm font-medium">
        Amazon
      </Label>
    </div>
  );
};