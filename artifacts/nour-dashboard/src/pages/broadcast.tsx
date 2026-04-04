import { useState } from "react";
import { useBroadcastMessage } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Send, Loader2, Users } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export default function Broadcast() {
  const [content, setContent] = useState("");
  const broadcastMutation = useBroadcastMessage();
  const { toast } = useToast();
  const [result, setResult] = useState<{sent: number, failed: number} | null>(null);

  const handleSend = () => {
    if (!content.trim()) return;
    
    setResult(null);
    broadcastMutation.mutate({ data: { content } }, {
      onSuccess: (res) => {
        setResult(res);
        if (res.success) {
          toast({ title: "Broadcast Complete", description: `Sent to ${res.sent} contacts.` });
          setContent("");
        } else {
          toast({ title: "Broadcast Issue", description: "Completed with failures.", variant: "destructive" });
        }
      },
      onError: () => {
        toast({ title: "Error", description: "Failed to initiate broadcast.", variant: "destructive" });
      }
    });
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Broadcast</h1>
        <p className="text-muted-foreground mt-2">Send mass messages to all active contacts.</p>
      </div>

      <Card className="bg-card/50 backdrop-blur border-border/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            New Broadcast Message
          </CardTitle>
          <CardDescription>
            This message will be sent to all contacts who have interacted with the agent.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <Textarea 
              placeholder="Write your message here..." 
              className="min-h-[150px] resize-y text-base"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              data-testid="textarea-broadcast"
            />
            <div className="flex justify-between items-center text-sm text-muted-foreground">
              <span>{content.length} characters</span>
              <span>Supports WhatsApp formatting (*bold*, _italic_)</span>
            </div>
          </div>
        </CardContent>
        <CardFooter className="bg-muted/10 border-t border-border/50 pt-6">
          <Button 
            onClick={handleSend} 
            disabled={!content.trim() || broadcastMutation.isPending}
            className="w-full sm:w-auto px-8"
            data-testid="btn-send-broadcast"
          >
            {broadcastMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
            Send to All Contacts
          </Button>
        </CardFooter>
      </Card>

      {result && (
        <Alert className={result.failed > 0 ? "bg-destructive/10 border-destructive/20 text-destructive" : "bg-emerald-500/10 border-emerald-500/20 text-emerald-500"}>
          <AlertTitle>Result</AlertTitle>
          <AlertDescription className="mt-2">
            <ul className="list-disc pl-4 space-y-1">
              <li>Successfully sent: <strong>{result.sent}</strong></li>
              <li>Failed: <strong>{result.failed}</strong></li>
            </ul>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
