import { useState } from "react";
import { useGetContacts, useGetContact, getGetContactQueryKey } from "@workspace/api-client-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Search, ShieldAlert, ArrowUpRight, ArrowDownLeft } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";

export default function Contacts() {
  const [search, setSearch] = useState("");
  const [selectedContactId, setSelectedContactId] = useState<number | null>(null);

  const { data, isLoading } = useGetContacts({ search });

  return (
    <div className="space-y-6 h-full flex flex-col">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Contacts</h1>
        <p className="text-muted-foreground mt-2">Manage people interacting with the agent.</p>
      </div>

      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Search phone or name..." 
            className="pl-9 bg-card/50"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            data-testid="input-search-contacts"
          />
        </div>
      </div>

      <div className="border border-border/50 rounded-md bg-card/50 backdrop-blur flex-1 overflow-auto">
        <Table>
          <TableHeader className="bg-muted/50 sticky top-0 z-10">
            <TableRow>
              <TableHead>Phone / Name</TableHead>
              <TableHead>Messages</TableHead>
              <TableHead>Last Seen</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-12" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-8 w-20 ml-auto" /></TableCell>
                </TableRow>
              ))
            ) : data?.contacts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                  No contacts found.
                </TableCell>
              </TableRow>
            ) : (
              data?.contacts.map((contact) => (
                <TableRow key={contact.id} className="cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => setSelectedContactId(contact.id)}>
                  <TableCell>
                    <div className="font-medium font-mono">{contact.phone}</div>
                    {contact.name && <div className="text-xs text-muted-foreground">{contact.name}</div>}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="font-mono">{contact.messageCount}</Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDistanceToNow(new Date(contact.lastSeen), { addSuffix: true })}
                  </TableCell>
                  <TableCell>
                    {contact.isBlocked ? (
                      <Badge variant="destructive" className="flex items-center gap-1 w-fit">
                        <ShieldAlert className="h-3 w-3" /> Blocked
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-emerald-500 border-emerald-500/20 bg-emerald-500/10">Active</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" onClick={(e) => {
                      e.stopPropagation();
                      setSelectedContactId(contact.id);
                    }} data-testid={`btn-view-contact-${contact.id}`}>View</Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <ContactSlideOver 
        contactId={selectedContactId} 
        onClose={() => setSelectedContactId(null)} 
      />
    </div>
  );
}

function ContactSlideOver({ contactId, onClose }: { contactId: number | null, onClose: () => void }) {
  const { data, isLoading } = useGetContact(contactId as number, { 
    query: { enabled: !!contactId, queryKey: getGetContactQueryKey(contactId as number) } 
  });

  return (
    <Sheet open={!!contactId} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="sm:max-w-md w-full border-l border-border bg-card p-0 flex flex-col">
        {isLoading ? (
          <div className="p-6 space-y-6">
            <Skeleton className="h-8 w-1/2" />
            <Skeleton className="h-4 w-1/3" />
            <div className="space-y-4 mt-8">
              <Skeleton className="h-16 w-3/4" />
              <Skeleton className="h-16 w-3/4 ml-auto" />
            </div>
          </div>
        ) : data ? (
          <>
            <SheetHeader className="p-6 border-b border-border/50 bg-muted/20">
              <SheetTitle className="font-mono text-xl">{data.contact.phone}</SheetTitle>
              <SheetDescription>
                {data.contact.name || "Unknown Name"} • First seen {new Date(data.contact.firstSeen).toLocaleDateString()}
              </SheetDescription>
            </SheetHeader>
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {data.messages.length === 0 ? (
                <div className="text-center text-muted-foreground text-sm">No messages yet.</div>
              ) : (
                data.messages.map((msg) => {
                  const isInbound = msg.direction === 'inbound';
                  return (
                    <div key={msg.id} className={`flex flex-col max-w-[80%] ${isInbound ? 'items-start mr-auto' : 'items-end ml-auto'}`}>
                      <div className={`px-4 py-2 rounded-2xl ${
                        isInbound 
                          ? 'bg-secondary text-secondary-foreground rounded-tl-sm' 
                          : 'bg-primary text-primary-foreground rounded-tr-sm'
                      }`}>
                        <p className="text-sm whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                      </div>
                      <div className="flex items-center gap-1 mt-1 px-1">
                        <span className="text-[10px] text-muted-foreground">
                          {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        {!isInbound && msg.aiModel && (
                          <span className="text-[10px] text-primary/70 font-mono flex items-center gap-0.5">
                            • {msg.aiModel}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
