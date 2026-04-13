import {
  LayoutDashboard,
  Code2,
  Activity,
  Database,
  Settings,
  Key,
  FileJson,
  Bell,
  HelpCircle,
  LogOut,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";

const mainNav = [
  { title: "Dashboard", icon: LayoutDashboard, active: true },
  { title: "API Explorer", icon: Code2 },
  { title: "Analytics", icon: Activity },
  { title: "Database", icon: Database },
  { title: "Schemas", icon: FileJson },
];

const configNav = [
  { title: "API Keys", icon: Key },
  { title: "Webhooks", icon: Bell },
  { title: "Settings", icon: Settings },
];

export function DashboardSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";

  return (
    <Sidebar collapsible="icon">
      <SidebarContent>
        {/* Logo */}
        <div className="p-4 flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center shrink-0">
            <Code2 className="h-4 w-4 text-primary-foreground" />
          </div>
          {!collapsed && (
            <div>
              <p className="text-sm font-semibold text-foreground">ERP API</p>
              <p className="text-[10px] text-muted-foreground">v2.4.1</p>
            </div>
          )}
        </div>

        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainNav.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    className={`${
                      item.active
                        ? "bg-secondary text-foreground"
                        : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                    } transition-colors`}
                  >
                    <item.icon className="h-4 w-4 mr-2" />
                    {!collapsed && <span className="text-sm">{item.title}</span>}
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Configuration</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {configNav.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton className="text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors">
                    <item.icon className="h-4 w-4 mr-2" />
                    {!collapsed && <span className="text-sm">{item.title}</span>}
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton className="text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors">
              <HelpCircle className="h-4 w-4 mr-2" />
              {!collapsed && <span className="text-sm">Documentation</span>}
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
