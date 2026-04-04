import { useGetStats, useGetActivity, useGetMessages, useGetWhatsappStatus } from "@workspace/api-client-react";
import { Users, MessageSquare, Send, Activity, Phone, PhoneOff, ArrowUpRight, ArrowDownLeft } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";

export default function Dashboard() {
  const { data: stats, isLoading: statsLoading } = useGetStats();
  const { data: activity, isLoading: activityLoading } = useGetActivity();
  const { data: recentMessages, isLoading: messagesLoading } = useGetMessages({ limit: 5 });
  const { data: status } = useGetWhatsappStatus();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">لوحة التحكم</h1>
        <p className="text-muted-foreground mt-1 text-sm">نظرة عامة على نشاط الوكيل.</p>
      </div>

      {/* System Status — shown prominently on mobile */}
      <Card className="md:hidden bg-card/50 backdrop-blur border-border/50 overflow-hidden relative">
        <div className={`absolute top-0 left-0 w-1 h-full ${status?.connected ? "bg-emerald-500" : "bg-destructive"}`} />
        <CardContent className="pt-4 pb-4">
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-full ${status?.connected ? "bg-emerald-500/10 text-emerald-500" : "bg-destructive/10 text-destructive"}`}>
              {status?.connected ? <Phone className="h-5 w-5" /> : <PhoneOff className="h-5 w-5" />}
            </div>
            <div>
              <div className="font-semibold">{status?.connected ? "الوكيل يعمل" : "الوكيل متوقف"}</div>
              <div className="text-xs text-muted-foreground font-mono">{status?.phone || "لا توجد جلسة نشطة"}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Top Stats — 2 col on mobile, 4 col on desktop */}
      <div className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4">
        <StatCard title="جهات الاتصال" value={stats?.totalContacts} icon={Users} loading={statsLoading} description={`${stats?.activeContacts || 0} نشط`} />
        <StatCard title="الرسائل" value={stats?.totalMessages} icon={MessageSquare} loading={statsLoading} description={`${stats?.todayMessages || 0} اليوم`} />
        <StatCard title="مرسلة بالذكاء" value={stats?.messagesSent} icon={Send} loading={statsLoading} description="ردود صادرة" />
        <StatCard title="مستقبلة" value={stats?.messagesReceived} icon={Activity} loading={statsLoading} description="طلبات واردة" />
      </div>

      <div className="grid gap-5 md:grid-cols-7">
        {/* Chart */}
        <Card className="md:col-span-4 lg:col-span-5 bg-card/50 backdrop-blur border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-base md:text-lg">نشاط الرسائل</CardTitle>
            <CardDescription className="text-xs">حجم الرسائل خلال 7 أيام</CardDescription>
          </CardHeader>
          <CardContent className="h-[220px] md:h-[300px]">
            {activityLoading ? (
              <Skeleton className="w-full h-full" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={activity} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(val) => new Date(val).toLocaleDateString("ar", { weekday: "short" })}
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))" }}
                    labelStyle={{ color: "hsl(var(--foreground))" }}
                  />
                  <Legend iconType="circle" iconSize={8} />
                  <Bar dataKey="inbound" name="واردة" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="outbound" name="صادرة" fill="hsl(var(--chart-1))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Right Panel */}
        <div className="md:col-span-3 lg:col-span-2 space-y-5">
          {/* System Status — desktop only */}
          <Card className="hidden md:block bg-card/50 backdrop-blur border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">حالة النظام</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4">
                <div className={`p-3 rounded-full ${status?.connected ? "bg-emerald-500/10 text-emerald-500" : "bg-destructive/10 text-destructive"}`}>
                  {status?.connected ? <Phone className="h-5 w-5" /> : <PhoneOff className="h-5 w-5" />}
                </div>
                <div>
                  <div className="font-semibold">{status?.connected ? "متصل" : "غير متصل"}</div>
                  <div className="text-sm text-muted-foreground font-mono">{status?.phone || "لا توجد جلسة"}</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Recent Activity */}
          <Card className="bg-card/50 backdrop-blur border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm md:text-base">آخر النشاطات</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {messagesLoading ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <Skeleton className="h-7 w-7 rounded-full" />
                      <div className="space-y-1.5 flex-1">
                        <Skeleton className="h-3 w-full" />
                        <Skeleton className="h-2.5 w-2/3" />
                      </div>
                    </div>
                  ))
                ) : recentMessages?.messages.length === 0 ? (
                  <div className="text-center text-muted-foreground py-4 text-sm">لا توجد رسائل حديثة</div>
                ) : (
                  recentMessages?.messages.map((msg) => (
                    <div key={msg.id} className="flex items-start gap-2.5 border-b border-border/50 pb-3 last:border-0 last:pb-0">
                      <div className={`mt-0.5 p-1.5 rounded-full flex-shrink-0 ${msg.direction === "inbound" ? "bg-blue-500/10 text-blue-500" : "bg-emerald-500/10 text-emerald-500"}`}>
                        {msg.direction === "inbound" ? <ArrowDownLeft className="h-3 w-3" /> : <ArrowUpRight className="h-3 w-3" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">{msg.contactName || msg.contactPhone}</p>
                        <p className="text-[11px] text-muted-foreground truncate mt-0.5">{msg.content}</p>
                      </div>
                      <div className="text-[10px] text-muted-foreground whitespace-nowrap flex-shrink-0">
                        {new Date(msg.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, icon: Icon, loading, description }: any) {
  return (
    <Card className="bg-card/50 backdrop-blur border-border/50">
      <CardHeader className="flex flex-row items-center justify-between pb-1.5 space-y-0 pt-4 px-4">
        <CardTitle className="text-xs md:text-sm font-medium text-muted-foreground leading-tight">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
      </CardHeader>
      <CardContent className="px-4 pb-4">
        {loading ? (
          <Skeleton className="h-7 w-16" />
        ) : (
          <div className="text-2xl md:text-3xl font-bold">{value?.toLocaleString() || 0}</div>
        )}
        {description && <p className="text-[11px] md:text-xs text-muted-foreground mt-1">{description}</p>}
      </CardContent>
    </Card>
  );
}
