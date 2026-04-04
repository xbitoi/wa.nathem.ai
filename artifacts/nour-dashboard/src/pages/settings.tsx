import { useEffect, useState, useCallback } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useGetSettings, useUpdateSettings, getGetSettingsQueryKey, useClearMessages, useClearContacts } from "@workspace/api-client-react";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Save, Eye, EyeOff, RefreshCw, CheckCircle2, AlertCircle, Trash2, MessageSquareOff, UsersRound } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

const settingsSchema = z.object({
  ownerName: z.string().optional(),
  ownerEmail: z.union([z.string().email("Invalid email"), z.literal("")]).optional(),
  ownerPhone: z.string().optional(),
  adminPhone: z.string().optional(),
  projectName: z.string().optional(),
  projectDescription: z.string().optional(),
  projectLink: z.union([z.string().url("Must be a valid URL"), z.literal("")]).optional(),
  geminiApiKey: z.string().optional(),
  geminiModel: z.string().optional(),
  groqApiKey: z.string().optional(),
  groqModel: z.string().optional(),
  aiModel: z.enum(["gemini", "groq"]),
  agentPersonality: z.string().optional(),
  autoReply: z.boolean(),
  maintenanceMode: z.boolean(),
  maintenanceMessage: z.string().optional(),
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

  const clearMessagesMutation = useClearMessages({
    mutation: {
      onSuccess: (data) => {
        toast({ title: "✅ تم مسح الرسائل", description: data.message });
        queryClient.invalidateQueries();
      },
      onError: () => toast({ title: "خطأ", description: "فشل مسح الرسائل", variant: "destructive" }),
    },
  });

  const clearContactsMutation = useClearContacts({
    mutation: {
      onSuccess: (data) => {
        toast({ title: "✅ تم مسح البيانات", description: data.message });
        queryClient.invalidateQueries();
      },
      onError: () => toast({ title: "خطأ", description: "فشل مسح البيانات", variant: "destructive" }),
    },
  });

  const form = useForm<SettingsFormValues>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      ownerName: "", ownerEmail: "", ownerPhone: "", adminPhone: "",
      projectName: "", projectDescription: "", projectLink: "",
      geminiApiKey: "", geminiModel: "",
      groqApiKey: "", groqModel: "",
      aiModel: "gemini", agentPersonality: "", autoReply: true,
      maintenanceMode: false,
      maintenanceMessage: "⚙️ النظام في وضع الصيانة حالياً. سيعود قريباً — We'll be back soon.",
    }
  });

  useEffect(() => {
    if (settings) {
      form.reset({
        ...settings,
        ownerName: settings.ownerName || "",
        ownerEmail: settings.ownerEmail || "",
        ownerPhone: settings.ownerPhone || "",
        adminPhone: (settings as any).adminPhone || "",
        projectName: settings.projectName || "",
        projectDescription: settings.projectDescription || "",
        projectLink: settings.projectLink || "",
        geminiApiKey: settings.geminiApiKey || "",
        geminiModel: (settings as any).geminiModel || "",
        groqApiKey: settings.groqApiKey || "",
        groqModel: (settings as any).groqModel || "",
        agentPersonality: settings.agentPersonality || "",
        maintenanceMode: (settings as any).maintenanceMode ?? false,
        maintenanceMessage: (settings as any).maintenanceMessage || "⚙️ النظام في وضع الصيانة حالياً. سيعود قريباً — We'll be back soon.",
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
    <div className="space-y-5 max-w-4xl mx-auto pb-12">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">الإعدادات</h1>
        <p className="text-muted-foreground mt-1 text-sm">إعداد تفاصيل المشروع وسلوك الذكاء الاصطناعي.</p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">

          {/* Owner Info */}
          <Card className="bg-card/50 backdrop-blur border-border/50">
            <CardHeader>
              <CardTitle>Owner Information</CardTitle>
              <CardDescription>Contact details shared with managers. All fields are optional — only filled fields are shown to the AI.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-6 md:grid-cols-2">
              <FormField control={form.control} name="ownerName" render={({ field }) => (
                <FormItem>
                  <FormLabel>Name <span className="text-muted-foreground text-xs">(optional)</span></FormLabel>
                  <FormControl><Input placeholder="e.g. Ahmed Benali" {...field} /></FormControl>
                  <FormMessage/>
                </FormItem>
              )} />
              <FormField control={form.control} name="ownerEmail" render={({ field }) => (
                <FormItem>
                  <FormLabel>Email <span className="text-muted-foreground text-xs">(optional)</span></FormLabel>
                  <FormControl><Input type="email" placeholder="you@example.com" {...field} /></FormControl>
                  <FormMessage/>
                </FormItem>
              )} />
              <FormField control={form.control} name="ownerPhone" render={({ field }) => (
                <FormItem>
                  <FormLabel>WhatsApp Phone <span className="text-muted-foreground text-xs">(optional)</span></FormLabel>
                  <FormControl><Input placeholder="e.g. 212612345678" {...field} /></FormControl>
                  <FormMessage/>
                </FormItem>
              )} />
              <FormField control={form.control} name="adminPhone" render={({ field }) => (
                <FormItem>
                  <div className="flex items-center gap-2">
                    <FormLabel>Admin Phone</FormLabel>
                    <Badge variant="outline" className="text-xs text-amber-400 border-amber-400/30">كيرا</Badge>
                  </div>
                  <FormControl><Input placeholder="e.g. 212612345678" {...field} /></FormControl>
                  <FormDescription className="text-xs">
                    This number receives system alerts and can use admin mode by sending "أنا كيرا"
                  </FormDescription>
                  <FormMessage/>
                </FormItem>
              )} />
            </CardContent>
          </Card>

          {/* Project Info */}
          <Card className="bg-card/50 backdrop-blur border-border/50">
            <CardHeader>
              <CardTitle>Project Details</CardTitle>
              <CardDescription>Extra context provided to the AI. All fields are optional.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-6">
              <div className="grid gap-6 md:grid-cols-2">
                <FormField control={form.control} name="projectName" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Project Name <span className="text-muted-foreground text-xs">(optional)</span></FormLabel>
                    <FormControl><Input placeholder="Yazaki AI" {...field} /></FormControl>
                    <FormMessage/>
                  </FormItem>
                )} />
                <FormField control={form.control} name="projectLink" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Project Link <span className="text-muted-foreground text-xs">(optional)</span></FormLabel>
                    <FormControl><Input type="url" placeholder="https://..." {...field} /></FormControl>
                    <FormMessage/>
                  </FormItem>
                )} />
              </div>
              <FormField control={form.control} name="projectDescription" render={({ field }) => (
                <FormItem>
                  <FormLabel>Description <span className="text-muted-foreground text-xs">(optional)</span></FormLabel>
                  <FormControl><Textarea rows={3} {...field} /></FormControl>
                  <FormMessage/>
                </FormItem>
              )} />
            </CardContent>
          </Card>

          {/* Maintenance Mode */}
          <Card className={`backdrop-blur border-2 ${form.watch("maintenanceMode") ? "border-orange-500/60 bg-orange-500/5" : "border-border/50 bg-card/50"}`}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`h-3 w-3 rounded-full ${form.watch("maintenanceMode") ? "bg-orange-500 animate-pulse" : "bg-green-500"}`} />
                  <div>
                    <CardTitle>Maintenance Mode</CardTitle>
                    <CardDescription>
                      {form.watch("maintenanceMode")
                        ? "Bot is paused — only the admin can chat."
                        : "Bot is active and responding normally."}
                    </CardDescription>
                  </div>
                </div>
                <FormField control={form.control} name="maintenanceMode" render={({ field }) => (
                  <FormItem className="flex items-center gap-2 space-y-0">
                    <FormLabel className={`text-sm mt-0 font-semibold ${field.value ? "text-orange-400" : "text-green-400"}`}>
                      {field.value ? "⛔ Paused" : "✅ Active"}
                    </FormLabel>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        data-testid="switch-maintenance"
                        className={field.value ? "data-[state=checked]:bg-orange-500" : ""}
                      />
                    </FormControl>
                  </FormItem>
                )} />
              </div>
            </CardHeader>
            <CardContent>
              <FormField control={form.control} name="maintenanceMessage" render={({ field }) => (
                <FormItem>
                  <FormLabel>Message sent to users during maintenance</FormLabel>
                  <FormDescription>This exact text is sent to anyone who messages while the bot is paused. The admin is not affected.</FormDescription>
                  <FormControl>
                    <Textarea rows={2} {...field} />
                  </FormControl>
                  <FormMessage/>
                </FormItem>
              )} />
              <p className="text-xs text-muted-foreground mt-3">
                💡 You can also toggle maintenance from WhatsApp by sending <span className="font-mono bg-muted px-1 rounded">وقف</span> or <span className="font-mono bg-muted px-1 rounded">تشغيل</span> after authenticating as admin.
              </p>
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

      {/* ─── Data Management Card (outside Form) ─────────────────── */}
      <Card className="border-destructive/40">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-destructive/10">
              <Trash2 className="h-5 w-5 text-destructive" />
            </div>
            <div>
              <CardTitle className="text-destructive">إدارة البيانات</CardTitle>
              <CardDescription>حذف الرسائل والجهات. هذه العمليات لا يمكن التراجع عنها.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">

          {/* Clear messages */}
          <div className="rounded-lg border border-border/60 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <MessageSquareOff className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium text-sm">مسح جميع الرسائل</span>
            </div>
            <p className="text-sm text-muted-foreground">يحذف كل سجل الرسائل مع الإبقاء على قائمة جهات الاتصال.</p>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" className="w-full border-destructive/40 text-destructive hover:bg-destructive/10" disabled={clearMessagesMutation.isPending}>
                  {clearMessagesMutation.isPending ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : <Trash2 className="mr-2 h-3 w-3" />}
                  مسح الرسائل
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>مسح جميع الرسائل؟</AlertDialogTitle>
                  <AlertDialogDescription>
                    سيتم حذف كل سجل المحادثات نهائياً. جهات الاتصال ستبقى في النظام لكن بدون رسائل. هذا الإجراء لا يمكن التراجع عنه.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>إلغاء</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    onClick={() => clearMessagesMutation.mutate({})}
                  >
                    نعم، احذف الرسائل
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>

          {/* Clear all data */}
          <div className="rounded-lg border border-border/60 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <UsersRound className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium text-sm">مسح كل البيانات</span>
            </div>
            <p className="text-sm text-muted-foreground">يحذف جميع جهات الاتصال وكل رسائلها — إعادة ضبط كاملة.</p>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm" className="w-full" disabled={clearContactsMutation.isPending}>
                  {clearContactsMutation.isPending ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : <Trash2 className="mr-2 h-3 w-3" />}
                  مسح كل البيانات
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>مسح كل البيانات؟</AlertDialogTitle>
                  <AlertDialogDescription>
                    سيتم حذف <strong>جميع جهات الاتصال وجميع الرسائل</strong> نهائياً. النظام سيعود كأنه جديد. هذا الإجراء لا يمكن التراجع عنه إطلاقاً.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>إلغاء</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    onClick={() => clearContactsMutation.mutate()}
                  >
                    نعم، احذف كل شيء
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>

        </CardContent>
      </Card>

    </div>
  );
}
