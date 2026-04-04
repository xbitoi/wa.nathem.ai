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
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground mt-2">Overview of agent activity and system metrics.</p>
      </div>

      {/* Top Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Contacts"
          value={stats?.totalContacts}
          icon={Users}
          loading={statsLoading}
          description={`${stats?.activeContacts || 0} active recently`}
        />
        <StatCard
          title="Messages Processed"
          value={stats?.totalMessages}
          icon={MessageSquare}
          loading={statsLoading}
          description={`${stats?.todayMessages || 0} today`}
        />
        <StatCard
          title="Sent by AI"
          value={stats?.messagesSent}
          icon={Send}
          loading={statsLoading}
          description="Outbound responses"
        />
        <StatCard
          title="Received"
          value={stats?.messagesReceived}
          icon={Activity}
          loading={statsLoading}
          description="Inbound requests"
        />
      </div>

      <div className="grid gap-6 md:grid-cols-7">
        {/* Chart */}
        <Card className="md:col-span-4 lg:col-span-5 bg-card/50 backdrop-blur border-border/50">
          <CardHeader>
            <CardTitle>Activity History</CardTitle>
            <CardDescription>7-day message volume</CardDescription>
          </CardHeader>
          <CardContent className="h-[350px]">
            {activityLoading ? (
              <Skeleton className="w-full h-full" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={activity} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis 
                    dataKey="date" 
                    tickFormatter={(val) => new Date(val).toLocaleDateString(undefined, { weekday: 'short' })}
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis 
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
                    labelStyle={{ color: 'hsl(var(--foreground))' }}
                  />
                  <Legend iconType="circle" />
                  <Bar dataKey="inbound" name="Inbound" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="outbound" name="Outbound" fill="hsl(var(--chart-1))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Side Panel: Status & Recent */}
        <div className="md:col-span-3 lg:col-span-2 space-y-6">
          <Card className="bg-card/50 backdrop-blur border-border/50">
            <CardHeader className="pb-4">
              <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">System Status</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4">
                <div className={`p-3 rounded-full ${status?.connected ? 'bg-emerald-500/10 text-emerald-500' : 'bg-destructive/10 text-destructive'}`}>
                  {status?.connected ? <Phone className="h-6 w-6" /> : <PhoneOff className="h-6 w-6" />}
                </div>
                <div>
                  <div className="font-semibold text-lg">{status?.connected ? 'Connected' : 'Disconnected'}</div>
                  <div className="text-sm text-muted-foreground font-mono">{status?.phone || 'No active session'}</div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card/50 backdrop-blur border-border/50 flex-1">
            <CardHeader>
              <CardTitle>Recent Activity</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {messagesLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <Skeleton className="h-8 w-8 rounded-full" />
                      <div className="space-y-2 flex-1">
                        <Skeleton className="h-4 w-full" />
                        <Skeleton className="h-3 w-2/3" />
                      </div>
                    </div>
                  ))
                ) : recentMessages?.messages.length === 0 ? (
                  <div className="text-center text-muted-foreground py-4 text-sm">No recent messages</div>
                ) : (
                  recentMessages?.messages.map((msg) => (
                    <div key={msg.id} className="flex items-start gap-3 border-b border-border/50 pb-3 last:border-0 last:pb-0">
                      <div className={`mt-0.5 p-1.5 rounded-full ${msg.direction === 'inbound' ? 'bg-blue-500/10 text-blue-500' : 'bg-emerald-500/10 text-emerald-500'}`}>
                        {msg.direction === 'inbound' ? <ArrowDownLeft className="h-3 w-3" /> : <ArrowUpRight className="h-3 w-3" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{msg.contactName || msg.contactPhone}</p>
                        <p className="text-xs text-muted-foreground truncate">{msg.content}</p>
                      </div>
                      <div className="text-[10px] text-muted-foreground whitespace-nowrap">
                        {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
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
      <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-8 w-20" />
        ) : (
          <div className="text-3xl font-bold">{value?.toLocaleString() || 0}</div>
        )}
        {description && (
          <p className="text-xs text-muted-foreground mt-1">{description}</p>
        )}
      </CardContent>
    </Card>
  );
}
