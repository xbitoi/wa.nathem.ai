import { useState } from "react";
import { useGetMessages } from "@workspace/api-client-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { ArrowUpRight, ArrowDownLeft, Filter } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";

export default function Messages() {
  const [direction, setDirection] = useState<"inbound" | "outbound" | "all">("all");
  
  const { data, isLoading } = useGetMessages({ 
    direction: direction === "all" ? undefined : direction 
  });

  return (
    <div className="space-y-6 h-full flex flex-col">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Message Log</h1>
        <p className="text-muted-foreground mt-2">Comprehensive history of all interactions.</p>
      </div>

      <div className="flex items-center gap-4">
        <Select value={direction} onValueChange={(v: any) => setDirection(v)}>
          <SelectTrigger className="w-[180px] bg-card/50" data-testid="select-direction">
            <Filter className="w-4 h-4 mr-2 text-muted-foreground" />
            <SelectValue placeholder="Filter by direction" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Directions</SelectItem>
            <SelectItem value="inbound">Inbound (Received)</SelectItem>
            <SelectItem value="outbound">Outbound (Sent)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="border border-border/50 rounded-md bg-card/50 backdrop-blur flex-1 overflow-auto">
        <Table>
          <TableHeader className="bg-muted/50 sticky top-0 z-10">
            <TableRow>
              <TableHead className="w-12"></TableHead>
              <TableHead className="w-[200px]">Contact</TableHead>
              <TableHead>Content</TableHead>
              <TableHead className="w-[150px]">Model</TableHead>
              <TableHead className="w-[150px] text-right">Time</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-6 w-6 rounded-full" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-full max-w-md" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-4 w-20 ml-auto" /></TableCell>
                </TableRow>
              ))
            ) : data?.messages.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                  No messages found.
                </TableCell>
              </TableRow>
            ) : (
              data?.messages.map((msg) => (
                <TableRow key={msg.id} className="group">
                  <TableCell>
                    <div className={`p-1.5 rounded-full w-fit ${msg.direction === 'inbound' ? 'bg-blue-500/10 text-blue-500' : 'bg-emerald-500/10 text-emerald-500'}`}>
                      {msg.direction === 'inbound' ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="font-medium font-mono text-sm">{msg.contactPhone}</div>
                    {msg.contactName && <div className="text-xs text-muted-foreground">{msg.contactName}</div>}
                  </TableCell>
                  <TableCell className="max-w-md">
                    <p className="text-sm truncate" title={msg.content}>{msg.content}</p>
                  </TableCell>
                  <TableCell>
                    {msg.aiModel ? (
                      <Badge variant="outline" className="font-mono text-[10px] uppercase">{msg.aiModel}</Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right text-sm text-muted-foreground whitespace-nowrap">
                    {new Date(msg.timestamp).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
