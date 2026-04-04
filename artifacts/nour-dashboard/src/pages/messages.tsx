import { useState } from "react";
import { useGetMessages } from "@workspace/api-client-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { ArrowUpRight, ArrowDownLeft, Filter } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function Messages() {
  const [direction, setDirection] = useState<"inbound" | "outbound" | "all">("all");
  const { data, isLoading } = useGetMessages({ direction: direction === "all" ? undefined : direction });

  return (
    <div className="space-y-5 h-full flex flex-col">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">سجل الرسائل</h1>
        <p className="text-muted-foreground mt-1 text-sm">تاريخ كامل لجميع التفاعلات.</p>
      </div>

      <div className="flex items-center gap-3">
        <Select value={direction} onValueChange={(v: any) => setDirection(v)}>
          <SelectTrigger className="w-[160px] bg-card/50" data-testid="select-direction">
            <Filter className="w-4 h-4 mr-2 text-muted-foreground" />
            <SelectValue placeholder="تصفية" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">جميع الرسائل</SelectItem>
            <SelectItem value="inbound">واردة</SelectItem>
            <SelectItem value="outbound">صادرة</SelectItem>
          </SelectContent>
        </Select>

        {data && (
          <span className="text-sm text-muted-foreground">{data.messages.length} رسالة</span>
        )}
      </div>

      {/* Desktop Table */}
      <div className="hidden md:block border border-border/50 rounded-md bg-card/50 backdrop-blur flex-1 overflow-auto">
        <Table>
          <TableHeader className="bg-muted/50 sticky top-0 z-10">
            <TableRow>
              <TableHead className="w-12"></TableHead>
              <TableHead className="w-[200px]">جهة الاتصال</TableHead>
              <TableHead>المحتوى</TableHead>
              <TableHead className="w-[150px]">النموذج</TableHead>
              <TableHead className="w-[150px] text-right">الوقت</TableHead>
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
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">لا توجد رسائل.</TableCell>
              </TableRow>
            ) : (
              data?.messages.map((msg) => (
                <TableRow key={msg.id} className="group">
                  <TableCell>
                    <div className={`p-1.5 rounded-full w-fit ${msg.direction === "inbound" ? "bg-blue-500/10 text-blue-500" : "bg-emerald-500/10 text-emerald-500"}`}>
                      {msg.direction === "inbound" ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
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
                    {new Date(msg.timestamp).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Mobile Card List */}
      <div className="md:hidden flex-1 space-y-2.5 overflow-auto">
        {isLoading ? (
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-card/50 border border-border/50 rounded-xl p-4 space-y-2">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-3 w-16" />
            </div>
          ))
        ) : data?.messages.length === 0 ? (
          <div className="text-center text-muted-foreground py-12 text-sm">لا توجد رسائل.</div>
        ) : (
          data?.messages.map((msg) => {
            const isInbound = msg.direction === "inbound";
            return (
              <div key={msg.id} className="bg-card/50 border border-border/50 rounded-xl p-3.5 flex gap-3">
                {/* Direction Icon */}
                <div className={`mt-0.5 p-2 rounded-full flex-shrink-0 h-fit ${isInbound ? "bg-blue-500/10 text-blue-500" : "bg-emerald-500/10 text-emerald-500"}`}>
                  {isInbound ? <ArrowDownLeft className="h-3.5 w-3.5" /> : <ArrowUpRight className="h-3.5 w-3.5" />}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="font-mono text-xs font-medium text-foreground truncate">
                      {msg.contactName || msg.contactPhone}
                    </span>
                    <span className="text-[10px] text-muted-foreground flex-shrink-0">
                      {new Date(msg.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                  <p className="text-sm text-foreground/90 leading-snug line-clamp-2">{msg.content}</p>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className={`text-[10px] font-medium ${isInbound ? "text-blue-400" : "text-emerald-400"}`}>
                      {isInbound ? "واردة" : "صادرة"}
                    </span>
                    {msg.aiModel && (
                      <Badge variant="outline" className="font-mono text-[9px] uppercase py-0 px-1 h-4">{msg.aiModel}</Badge>
                    )}
                    <span className="text-[10px] text-muted-foreground mr-auto">
                      {new Date(msg.timestamp).toLocaleDateString("ar", { month: "short", day: "numeric" })}
                    </span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
