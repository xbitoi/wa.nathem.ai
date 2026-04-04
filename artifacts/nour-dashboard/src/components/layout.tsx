import { Link, useLocation } from "wouter";
import { LayoutDashboard, Users, MessageSquare, Phone, Settings, Send } from "lucide-react";
import { ReactNode } from "react";
import { useGetWhatsappStatus } from "@workspace/api-client-react";

const navigation = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard },
  { name: "Contacts", href: "/contacts", icon: Users },
  { name: "Messages", href: "/messages", icon: MessageSquare },
  { name: "Broadcast", href: "/broadcast", icon: Send },
  { name: "WhatsApp", href: "/whatsapp", icon: Phone },
  { name: "Settings", href: "/settings", icon: Settings },
];

export function Layout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { data: status } = useGetWhatsappStatus();

  return (
    <div className="flex h-screen bg-background dark text-foreground">
      {/* Sidebar */}
      <div className="hidden md:flex w-64 flex-col fixed inset-y-0 z-50 bg-sidebar border-r border-sidebar-border">
        <div className="flex h-16 shrink-0 items-center px-6 border-b border-sidebar-border">
          <div className="text-xl font-bold tracking-tight text-primary flex items-center gap-2">
            <span className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center text-primary border border-primary/20">ن</span>
            نور
          </div>
          <div className="ml-auto text-xs uppercase tracking-wider text-muted-foreground font-mono">
            Ops Center
          </div>
        </div>

        <div className="flex flex-1 flex-col overflow-y-auto pt-6 px-4">
          <nav className="flex-1 space-y-1">
            {navigation.map((item) => {
              const isActive = location === item.href;
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={`group flex items-center px-3 py-2.5 text-sm font-medium rounded-md transition-colors ${
                    isActive
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                  }`}
                  data-testid={`nav-link-${item.name.toLowerCase()}`}
                >
                  <item.icon
                    className={`mr-3 flex-shrink-0 h-5 w-5 ${
                      isActive ? "text-primary" : "text-muted-foreground group-hover:text-sidebar-foreground"
                    }`}
                    aria-hidden="true"
                  />
                  {item.name}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Status Indicator */}
        <div className="p-4 border-t border-sidebar-border">
          <div className="flex items-center gap-3 px-3 py-2 rounded-md bg-sidebar-accent/50 border border-sidebar-border">
            <div className="relative flex h-3 w-3">
              {status?.connected ? (
                <>
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                </>
              ) : (
                <span className="relative inline-flex rounded-full h-3 w-3 bg-destructive"></span>
              )}
            </div>
            <div className="flex flex-col">
              <span className="text-xs font-medium text-sidebar-foreground">
                {status?.connected ? "System Online" : "System Offline"}
              </span>
              {status?.connected && status.phone && (
                <span className="text-[10px] text-muted-foreground font-mono">
                  {status.phone}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex flex-col flex-1 md:pl-64">
        <main className="flex-1 overflow-y-auto focus:outline-none">
          <div className="py-8 px-4 sm:px-6 md:px-8 max-w-7xl mx-auto h-full">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
