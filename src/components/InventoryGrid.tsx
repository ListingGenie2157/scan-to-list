import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Filter, Package, Clock, CheckCircle, DollarSign, Calendar, BookOpen } from "lucide-react";

interface InventoryItem {
  id: string;
  title: string;
  author: string;
  status: "pending" | "processed" | "listed" | "sold";
  category: "book" | "magazine";
  estimatedValue: number;
  dateAdded: string;
  imageUrl: string;
  confidence: number;
}

export const InventoryGrid = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  // Mock inventory data
  const mockInventory: InventoryItem[] = [
    {
      id: "1",
      title: "Harry Potter and the Philosopher's Stone",
      author: "J.K. Rowling",
      status: "processed",
      category: "book",
      estimatedValue: 45.99,
      dateAdded: "2024-01-10",
      imageUrl: "/placeholder.svg",
      confidence: 95
    },
    {
      id: "2", 
      title: "National Geographic - January 1985",
      author: "National Geographic Society",
      status: "listed",
      category: "magazine",
      estimatedValue: 12.50,
      dateAdded: "2024-01-09",
      imageUrl: "/placeholder.svg",
      confidence: 88
    },
    {
      id: "3",
      title: "The Great Gatsby",
      author: "F. Scott Fitzgerald",
      status: "pending",
      category: "book", 
      estimatedValue: 28.75,
      dateAdded: "2024-01-08",
      imageUrl: "/placeholder.svg",
      confidence: 92
    },
    {
      id: "4",
      title: "Time Magazine - December 1969",
      author: "Time Inc.",
      status: "sold",
      category: "magazine",
      estimatedValue: 25.00,
      dateAdded: "2024-01-07",
      imageUrl: "/placeholder.svg",
      confidence: 90
    },
    {
      id: "5",
      title: "To Kill a Mockingbird",
      author: "Harper Lee",
      status: "processed",
      category: "book",
      estimatedValue: 18.99,
      dateAdded: "2024-01-06",
      imageUrl: "/placeholder.svg",
      confidence: 97
    },
    {
      id: "6",
      title: "Popular Science - March 1977",
      author: "Popular Science",
      status: "pending",
      category: "magazine",
      estimatedValue: 8.50,
      dateAdded: "2024-01-05",
      imageUrl: "/placeholder.svg",
      confidence: 85
    }
  ];

  const filteredInventory = mockInventory.filter(item => {
    const matchesSearch = item.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         item.author.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "all" || item.status === statusFilter;
    const matchesCategory = categoryFilter === "all" || item.category === categoryFilter;
    
    return matchesSearch && matchesStatus && matchesCategory;
  });

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "processed": return <CheckCircle className="w-4 h-4 text-success" />;
      case "listed": return <Package className="w-4 h-4 text-primary" />;
      case "sold": return <DollarSign className="w-4 h-4 text-success" />;
      default: return <Clock className="w-4 h-4 text-warning" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const variants = {
      processed: "bg-success/10 text-success border-success/20",
      listed: "bg-primary/10 text-primary border-primary/20",
      sold: "bg-success/10 text-success border-success/20",
      pending: "bg-warning/10 text-warning border-warning/20"
    };
    
    return (
      <Badge variant="outline" className={variants[status as keyof typeof variants]}>
        {status}
      </Badge>
    );
  };

  const getCategoryIcon = (category: string) => {
    return category === "book" ? 
      <BookOpen className="w-4 h-4 text-muted-foreground" /> : 
      <Calendar className="w-4 h-4 text-muted-foreground" />;
  };

  return (
    <div className="space-y-6">
      {/* Filters */}
      <Card className="shadow-card">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search by title or author..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-40">
                <Filter className="w-4 h-4 mr-2" />
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="processed">Processed</SelectItem>
                <SelectItem value="listed">Listed</SelectItem>
                <SelectItem value="sold">Sold</SelectItem>
              </SelectContent>
            </Select>

            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="book">Books</SelectItem>
                <SelectItem value="magazine">Magazines</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Results Summary */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Showing {filteredInventory.length} of {mockInventory.length} items
        </p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm">
            Export Selected
          </Button>
          <Button variant="outline" size="sm">
            Bulk Actions
          </Button>
        </div>
      </div>

      {/* Inventory Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredInventory.map((item) => (
          <Card key={item.id} className="shadow-card hover:shadow-elevated transition-shadow cursor-pointer">
            <CardContent className="p-4">
              <div className="space-y-3">
                {/* Image */}
                <div className="aspect-[3/4] bg-muted rounded-lg flex items-center justify-center">
                  <BookOpen className="w-8 h-8 text-muted-foreground" />
                </div>

                {/* Content */}
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-medium text-sm leading-tight line-clamp-2">{item.title}</h3>
                    {getCategoryIcon(item.category)}
                  </div>
                  
                  <p className="text-sm text-muted-foreground line-clamp-1">{item.author}</p>
                  
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-lg">${item.estimatedValue}</span>
                    <div className="flex items-center gap-1">
                      {getStatusIcon(item.status)}
                      {getStatusBadge(item.status)}
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Added {new Date(item.dateAdded).toLocaleDateString()}</span>
                    <span className="flex items-center gap-1">
                      <div className="w-2 h-2 bg-success rounded-full" />
                      {item.confidence}% confidence
                    </span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2 pt-2">
                  <Button variant="outline" size="sm" className="flex-1">
                    Edit
                  </Button>
                  <Button variant="default" size="sm" className="flex-1">
                    Create Listing
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {filteredInventory.length === 0 && (
        <Card className="shadow-card">
          <CardContent className="p-8 text-center">
            <Package className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="font-medium mb-2">No items found</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Try adjusting your search criteria or upload some photos to get started.
            </p>
            <Button variant="gradient">
              Upload Photos
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
};