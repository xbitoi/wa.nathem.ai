import { useGetWhatsappStatus, useGetWhatsappQr, useDisconnectWhatsapp } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Phone, QrCode, LogOut, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { useEffect, useState } from "react";

export default function Whatsapp() {
  const { data: status, isLoading: statusLoading, refetch: refetchStatus } = useGetWhatsappStatus();
  const { data: qrData, isLoading: qrLoading, refetch: refetchQr } = useGetWhatsappQr();
  const disconnectMutation = useDisconnectWhatsapp();
  const { toast } = useToast();

  const isConnected = status?.connected;
  const isQrReady = !isConnected && qrData?.qr;

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (!isConnected) {
      interval = setInterval(() => {
        refetchStatus();
        refetchQr();
      }, 5000);
    }
    return () => clearInterval(interval);
  }, [isConnected, refetchStatus, refetchQr]);

  const handleDisconnect = () => {
    disconnectMutation.mutate(undefined, {
      onSuccess: () => {
        toast({ title: "Disconnected", description: "WhatsApp session terminated." });
        refetchStatus();
      },
      onError: () => {
        toast({ title: "Error", description: "Failed to disconnect.", variant: "destructive" });
      }
    });
  };

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">WhatsApp Connection</h1>
        <p className="text-muted-foreground mt-2">Link your WhatsApp account to the agent.</p>
      </div>

      {statusLoading ? (
        <Card className="bg-card/50 backdrop-blur border-border/50">
          <CardHeader><Skeleton className="h-6 w-32" /></CardHeader>
          <CardContent><Skeleton className="h-40 w-full" /></CardContent>
        </Card>
      ) : isConnected ? (
        <Card className="bg-card/50 backdrop-blur border-border/50 overflow-hidden relative">
          <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500" />
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-full bg-emerald-500/10 text-emerald-500">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <div>
                <CardTitle className="text-emerald-500">Session Active</CardTitle>
                <CardDescription>Agent is fully operational</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4 p-4 bg-muted/30 rounded-lg border border-border/50">
              <div>
                <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Connected Phone</div>
                <div className="font-mono text-lg">{status?.phone}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Account Name</div>
                <div className="font-medium text-lg">{status?.name || 'Unknown'}</div>
              </div>
            </div>
          </CardContent>
          <CardFooter className="bg-muted/10 border-t border-border/50 pt-6">
            <Button 
              variant="destructive" 
              onClick={handleDisconnect} 
              disabled={disconnectMutation.isPending}
              className="w-full sm:w-auto"
              data-testid="btn-disconnect"
            >
              {disconnectMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <LogOut className="h-4 w-4 mr-2" />}
              Disconnect Session
            </Button>
          </CardFooter>
        </Card>
      ) : (
        <Card className="bg-card/50 backdrop-blur border-border/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <QrCode className="h-5 w-5" />
              Link Device
            </CardTitle>
            <CardDescription>
              Open WhatsApp on your phone, tap Menu or Settings and select Linked Devices. Tap on Link a Device and point your phone to this screen to capture the code.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center justify-center py-8 min-h-[300px]">
            {isQrReady ? (
              <div className="p-4 bg-white rounded-xl shadow-sm border">
                <img src={qrData.qr || ''} alt="WhatsApp QR Code" className="w-64 h-64" />
              </div>
            ) : (
              <div className="flex flex-col items-center text-muted-foreground gap-4">
                <Loader2 className="h-8 w-8 animate-spin" />
                <p>Generating QR Code...</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Alert className="bg-primary/5 border-primary/20 text-primary">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Important</AlertTitle>
        <AlertDescription className="text-sm opacity-90 mt-1">
          The WhatsApp connection relies on Baileys multi-device. Do not disconnect from your phone to keep the agent running.
        </AlertDescription>
      </Alert>
    </div>
  );
}
