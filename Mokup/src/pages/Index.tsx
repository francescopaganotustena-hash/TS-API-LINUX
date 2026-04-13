import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { DashboardSidebar } from "@/components/dashboard/DashboardSidebar";
import StatsCards from "@/components/dashboard/StatsCards";
import ApiExplorer from "@/components/dashboard/ApiExplorer";
import { motion } from "framer-motion";
import { Bell, Search, User } from "lucide-react";

const Index = () => {
  return (
    <div className="dark">
      <SidebarProvider>
        <div className="min-h-screen flex w-full animated-gradient-bg">
          <DashboardSidebar />
          <div className="flex-1 flex flex-col min-w-0">
            {/* Top bar */}
            <header className="h-14 flex items-center justify-between px-6 border-b border-border/50 backdrop-blur-sm">
              <div className="flex items-center gap-4">
                <SidebarTrigger className="text-muted-foreground hover:text-foreground" />
                <div className="hidden sm:flex items-center gap-2 text-sm text-muted-foreground">
                  <span>Dashboard</span>
                  <span>/</span>
                  <span className="text-foreground">API Explorer</span>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button className="p-2 rounded-lg hover:bg-secondary/50 text-muted-foreground hover:text-foreground transition-colors">
                  <Search className="h-4 w-4" />
                </button>
                <button className="p-2 rounded-lg hover:bg-secondary/50 text-muted-foreground hover:text-foreground transition-colors relative">
                  <Bell className="h-4 w-4" />
                  <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-primary animate-pulse-glow" />
                </button>
                <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center">
                  <User className="h-4 w-4 text-primary" />
                </div>
              </div>
            </header>

            {/* Main content */}
            <main className="flex-1 p-6 overflow-auto">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5 }}
              >
                <div className="mb-6">
                  <h1 className="text-2xl font-semibold text-foreground">API Explorer</h1>
                  <p className="text-sm text-muted-foreground mt-1">
                    Monitor and test your ERP API endpoints in real-time
                  </p>
                </div>

                <StatsCards />
                <ApiExplorer />
              </motion.div>
            </main>
          </div>
        </div>
      </SidebarProvider>
    </div>
  );
};

export default Index;
