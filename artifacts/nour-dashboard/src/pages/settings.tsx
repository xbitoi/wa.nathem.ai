import { useEffect, useState, useCallback } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useGetSettings, useUpdateSettings, getGetSettingsQueryKey } from "@workspace/api-client-react";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Save, Eye, EyeOff, RefreshCw, CheckCircle2, AlertCircle } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";

const settingsSchema = z.object({
  ownerName: z.string().min(1, "Required"),
  ownerEmail: z.string().email("Invalid email"),
  ownerPhone: z.string().min(1, "Required"),
  projectName: z.string().min(1, "Required"),
  projectDescription: z.string().min(1, "Required"),
  projectLink: z.string().url("Must be a valid URL"),
  geminiApiKey: z.string().optional(),
  geminiModel: z.string().optional(),
  groqApiKey: z.string().optional(),
  groqModel: z.string().optional(),
  aiModel: z.enum(["gemini", "groq"]),
  agentPersonality: z.string().min(10, "Provide a more detailed personality"),
  autoReply: z.boolean(),
});

type SettingsFormValues = z.infer<typeof settingsSchema>;

interface ModelOption {
  id: string;
  name: string;
  description: string;
}

type FetchStatus = "idle" | "loading" | "success" | "error";

function ModelSelector({
  provider,
  apiKey,
  value,
  onChange,
}: {
  provider: "gemini" | "groq";
  apiKey: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const [models, setModels] = useState<ModelOption[]>([]);
  const [status, setStatus] = useState<FetchStatus>("idle");
  const [error, setError] = useState("");
  const { toast } = useToast();

  const fetchModels = useCallback(async () => {
    if (!apiKey.trim()) {
      toast({ title: "Missing API Key", description: `Enter the ${provider === "gemini" ? "Gemini" : "Groq"} API key first.`, variant: "destructive" });
      return;
    }
    setStatus("loading");
    setError("");
    try {
      const res = await fetch(`/api/settings/models/${provider}?key=${encodeURIComponent(apiKey)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setModels(data.models ?? []);
      setStatus("success");
      if ((data.models ?? []).length === 0) {
        setError("No compatible models found for this key.");
      } else if (!value) {
        onChange(data.models[0].id);
      }
    } catch (e: any) {
      setStatus("error");
      setError(e.message ?? "Unknown error");
    }
  }, [apiKey, provider, value, onChange, toast]);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={fetchModels}
          disabled={status === "loading"}
          className="text-xs gap-1.5"
        >
          {status === "loading" ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <RefreshCw className="h-3 w-3" />
          )}
          {models.length > 0 ? "Refresh Models" : "Fetch Models"}
        </Button>
        {status === "success" && models.length > 0 && (
          <Badge variant="outline" className="text-green-400 border-green-400/30 text-xs gap-1">
            <CheckCircle2 className="h-3 w-3" />
            {models.length} models
          </Badge>
        )}
        {status === "error" && (
          <Badge variant="outline" className="text-red-400 border-red-400/30 text-xs gap-1">
            <AlertCircle className="h-3 w-3" />
            {error}
          </Badge>
        )}
      </div>

      {models.length > 0 && (
        <Select value={value} onValueChange={onChange}>
          <SelectTrigger className="font-mono text-sm">
            <SelectValue placeholder="Select a model..." />
          </SelectTrigger>
          <SelectContent>
            {models.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                <div className="flex flex-col">
                  <span className="font-medium">{m.name}</span>
                  {m.description && (
                    <span className="text-xs text-muted-foreground">{m.description}</span>
                  )}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {models.length === 0 && status !== "loading" && (
        <p className="text-xs text-muted-foreground">
          {status === "idle"
            ? `Click "Fetch Models" to load available ${provider === "gemini" ? "Gemini" : "Groq"} models`
            : error || "No models available"}
        </p>
      )}
    </div>
  );
}

export default function Settings() {
  const { data: settings, isLoading } = useGetSettings();
  const updateMutation = useUpdateSettings();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [showGemini, setShowGemini] = useState(false);
  const [showGroq, setShowGroq] = useState(false);

  const form = useForm<SettingsFormValues>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      ownerName: "", ownerEmail: "", ownerPhone: "",
      projectName: "", projectDescription: "", projectLink: "",
      geminiApiKey: "", geminiModel: "",
      groqApiKey: "", groqModel: "",
      aiModel: "gemini", agentPersonality: "", autoReply: true
    }
  });

  useEffect(() => {
    if (settings) {
      form.reset({
        ...settings,
        geminiApiKey: settings.geminiApiKey || "",
        geminiModel: (settings as any).geminiModel || "",
        groqApiKey: settings.groqApiKey || "",
        groqModel: (settings as any).groqModel || "",
      });
    }
  }, [settings, form]);

  const onSubmit = (data: SettingsFormValues) => {
    updateMutation.mutate({ data: data as any }, {
      onSuccess: (newSettings) => {
        toast({ title: "Settings Saved", description: "Configuration updated successfully." });
        queryClient.setQueryData(getGetSettingsQueryKey(), newSettings);
      },
      onError: () => {
        toast({ title: "Error", description: "Failed to save settings.", variant: "destructive" });
      }
    });
  };

  const geminiApiKey = form.watch("geminiApiKey") ?? "";
  const groqApiKey = form.watch("groqApiKey") ?? "";
  const geminiModel = form.watch("geminiModel") ?? "";
  const groqModel = form.watch("groqModel") ?? "";

  if (isLoading) {
    return <div className="flex justify-center p-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-12">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Configuration</h1>
        <p className="text-muted-foreground mt-2">Manage project details and AI behavior.</p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">

          {/* Owner Info */}
          <Card className="bg-card/50 backdrop-blur border-border/50">
            <CardHeader>
              <CardTitle>Owner Information</CardTitle>
              <CardDescription>Contact details for the project owner.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-6 md:grid-cols-2">
              <FormField control={form.control} name="ownerName" render={({ field }) => (
                <FormItem><FormLabel>Name</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage/></FormItem>
              )} />
              <FormField control={form.control} name="ownerEmail" render={({ field }) => (
                <FormItem><FormLabel>Email</FormLabel><FormControl><Input type="email" {...field} /></FormControl><FormMessage/></FormItem>
              )} />
              <FormField control={form.control} name="ownerPhone" render={({ field }) => (
                <FormItem><FormLabel>Phone</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage/></FormItem>
              )} />
            </CardContent>
          </Card>

          {/* Project Info */}
          <Card className="bg-card/50 backdrop-blur border-border/50">
            <CardHeader>
              <CardTitle>Project Details</CardTitle>
              <CardDescription>Context provided to the AI about the project.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-6">
              <div className="grid gap-6 md:grid-cols-2">
                <FormField control={form.control} name="projectName" render={({ field }) => (
                  <FormItem><FormLabel>Project Name</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage/></FormItem>
                )} />
                <FormField control={form.control} name="projectLink" render={({ field }) => (
                  <FormItem><FormLabel>Project Link</FormLabel><FormControl><Input type="url" {...field} /></FormControl><FormMessage/></FormItem>
                )} />
              </div>
              <FormField control={form.control} name="projectDescription" render={({ field }) => (
                <FormItem><FormLabel>Description</FormLabel><FormControl><Textarea rows={3} {...field} /></FormControl><FormMessage/></FormItem>
              )} />
            </CardContent>
          </Card>

          {/* AI Config */}
          <Card className="bg-card/50 backdrop-blur border-border/50">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>AI Configuration</CardTitle>
                  <CardDescription>API keys, model selection, and agent behavior.</CardDescription>
                </div>
                <FormField control={form.control} name="autoReply" render={({ field }) => (
                  <FormItem className="flex items-center gap-2 space-y-0">
                    <FormLabel className="text-sm text-muted-foreground mt-0">Auto-reply Active</FormLabel>
                    <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} data-testid="switch-autoreply" /></FormControl>
                  </FormItem>
                )} />
              </div>
            </CardHeader>
            <CardContent className="grid gap-8">

              {/* Active Provider */}
              <FormField control={form.control} name="aiModel" render={({ field }) => (
                <FormItem className="max-w-xs">
                  <FormLabel>Active AI Provider</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl><SelectTrigger><SelectValue/></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="gemini">Google Gemini</SelectItem>
                      <SelectItem value="groq">Groq</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage/>
                </FormItem>
              )} />

              {/* Gemini Section */}
              <div className="rounded-lg border border-border/50 p-5 space-y-4">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-blue-400" />
                  <h3 className="font-semibold text-sm">Google Gemini</h3>
                  {form.watch("aiModel") === "gemini" && (
                    <Badge className="text-xs bg-blue-500/20 text-blue-400 border-blue-400/30">Active</Badge>
                  )}
                </div>

                <FormField control={form.control} name="geminiApiKey" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Gemini API Key</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Input type={showGemini ? "text" : "password"} {...field} className="pr-10 font-mono text-sm" placeholder="AIza..." />
                        <button type="button" onClick={() => setShowGemini(!showGemini)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                          {showGemini ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </FormControl>
                    <FormMessage/>
                  </FormItem>
                )} />

                <div className="space-y-1.5">
                  <label className="text-sm font-medium leading-none">Gemini Model</label>
                  <p className="text-sm text-muted-foreground">
                    Free models only (Flash & Gemma families). Enter your API key then click Fetch Models.
                  </p>
                  <ModelSelector
                    provider="gemini"
                    apiKey={geminiApiKey}
                    value={geminiModel}
                    onChange={(v) => form.setValue("geminiModel", v)}
                  />
                  {geminiModel && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Selected: <span className="font-mono text-foreground">{geminiModel}</span>
                    </p>
                  )}
                </div>
              </div>

              {/* Groq Section */}
              <div className="rounded-lg border border-border/50 p-5 space-y-4">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-orange-400" />
                  <h3 className="font-semibold text-sm">Groq</h3>
                  {form.watch("aiModel") === "groq" && (
                    <Badge className="text-xs bg-orange-500/20 text-orange-400 border-orange-400/30">Active</Badge>
                  )}
                </div>

                <FormField control={form.control} name="groqApiKey" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Groq API Key</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Input type={showGroq ? "text" : "password"} {...field} className="pr-10 font-mono text-sm" placeholder="gsk_..." />
                        <button type="button" onClick={() => setShowGroq(!showGroq)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                          {showGroq ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </FormControl>
                    <FormMessage/>
                  </FormItem>
                )} />

                <div className="space-y-1.5">
                  <label className="text-sm font-medium leading-none">Groq Model</label>
                  <p className="text-sm text-muted-foreground">
                    Free Llama, Mixtral & Gemma models. Enter your API key then click Fetch Models.
                  </p>
                  <ModelSelector
                    provider="groq"
                    apiKey={groqApiKey}
                    value={groqModel}
                    onChange={(v) => form.setValue("groqModel", v)}
                  />
                  {groqModel && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Selected: <span className="font-mono text-foreground">{groqModel}</span>
                    </p>
                  )}
                </div>
              </div>

              {/* Personality */}
              <FormField control={form.control} name="agentPersonality" render={({ field }) => (
                <FormItem>
                  <FormLabel>System Prompt / Personality</FormLabel>
                  <FormDescription>Instructs the agent on how to behave, tone, and constraints.</FormDescription>
                  <FormControl><Textarea rows={6} className="font-mono text-sm" {...field} /></FormControl>
                  <FormMessage/>
                </FormItem>
              )} />
            </CardContent>
            <CardFooter className="bg-muted/10 border-t border-border/50 pt-6">
              <Button type="submit" disabled={updateMutation.isPending} data-testid="btn-save-settings">
                {updateMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Save Configuration
              </Button>
            </CardFooter>
          </Card>

        </form>
      </Form>
    </div>
  );
}
