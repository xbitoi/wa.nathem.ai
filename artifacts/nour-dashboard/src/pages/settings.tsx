import { useEffect } from "react";
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
import { Loader2, Save, Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

const settingsSchema = z.object({
  ownerName: z.string().min(1, "Required"),
  ownerEmail: z.string().email("Invalid email"),
  ownerPhone: z.string().min(1, "Required"),
  projectName: z.string().min(1, "Required"),
  projectDescription: z.string().min(1, "Required"),
  projectLink: z.string().url("Must be a valid URL"),
  geminiApiKey: z.string().optional(),
  groqApiKey: z.string().optional(),
  aiModel: z.enum(["gemini", "groq"]),
  agentPersonality: z.string().min(10, "Provide a more detailed personality"),
  autoReply: z.boolean(),
});

type SettingsFormValues = z.infer<typeof settingsSchema>;

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
      geminiApiKey: "", groqApiKey: "",
      aiModel: "gemini", agentPersonality: "", autoReply: true
    }
  });

  useEffect(() => {
    if (settings) {
      form.reset({
        ...settings,
        geminiApiKey: settings.geminiApiKey || "",
        groqApiKey: settings.groqApiKey || "",
      });
    }
  }, [settings, form]);

  const onSubmit = (data: SettingsFormValues) => {
    updateMutation.mutate({ data }, {
      onSuccess: (newSettings) => {
        toast({ title: "Settings Saved", description: "Configuration updated successfully." });
        queryClient.setQueryData(getGetSettingsQueryKey(), newSettings);
      },
      onError: () => {
        toast({ title: "Error", description: "Failed to save settings.", variant: "destructive" });
      }
    });
  };

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
                  <CardDescription>API keys and agent behavior.</CardDescription>
                </div>
                <FormField control={form.control} name="autoReply" render={({ field }) => (
                  <FormItem className="flex items-center gap-2 space-y-0">
                    <FormLabel className="text-sm text-muted-foreground mt-0">Auto-reply Active</FormLabel>
                    <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} data-testid="switch-autoreply" /></FormControl>
                  </FormItem>
                )} />
              </div>
            </CardHeader>
            <CardContent className="grid gap-6">
              <FormField control={form.control} name="aiModel" render={({ field }) => (
                <FormItem className="max-w-xs">
                  <FormLabel>Active Model</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl><SelectTrigger><SelectValue/></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="gemini">Google Gemini</SelectItem>
                      <SelectItem value="groq">Groq (Llama 3)</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage/>
                </FormItem>
              )} />

              <div className="grid gap-6 md:grid-cols-2">
                <FormField control={form.control} name="geminiApiKey" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Gemini API Key</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Input type={showGemini ? "text" : "password"} {...field} className="pr-10 font-mono text-sm" />
                        <button type="button" onClick={() => setShowGemini(!showGemini)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                          {showGemini ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </FormControl>
                    <FormMessage/>
                  </FormItem>
                )} />
                <FormField control={form.control} name="groqApiKey" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Groq API Key</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Input type={showGroq ? "text" : "password"} {...field} className="pr-10 font-mono text-sm" />
                        <button type="button" onClick={() => setShowGroq(!showGroq)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                          {showGroq ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </FormControl>
                    <FormMessage/>
                  </FormItem>
                )} />
              </div>

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
