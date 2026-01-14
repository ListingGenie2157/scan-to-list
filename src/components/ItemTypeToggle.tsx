import { BookOpen, Newspaper, Package } from "lucide-react";
import { cn } from "@/lib/utils";

type ItemType = 'book' | 'magazine' | 'bundle';

interface ItemTypeToggleProps {
  value: ItemType;
  onChange: (value: ItemType) => void;
  className?: string;
  showBundle?: boolean;
}

export function ItemTypeToggle({ value, onChange, className, showBundle = true }: ItemTypeToggleProps) {
  const options: { value: ItemType; label: string; icon: typeof BookOpen }[] = [
    { value: 'book', label: 'Book', icon: BookOpen },
    { value: 'magazine', label: 'Magazine', icon: Newspaper },
    ...(showBundle ? [{ value: 'bundle' as ItemType, label: 'Bundle', icon: Package }] : []),
  ];

  return (
    <div className={cn("flex gap-1 p-1 bg-muted rounded-lg", className)}>
      {options.map((option) => {
        const Icon = option.icon;
        const isSelected = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all",
              isSelected
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-background/50"
            )}
          >
            <Icon className="w-4 h-4" />
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
