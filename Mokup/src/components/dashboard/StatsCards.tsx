import { motion } from "framer-motion";
import { Activity, Clock, AlertTriangle, Zap } from "lucide-react";
import { LineChart, Line, ResponsiveContainer } from "recharts";

const sparkData = (base: number, variance: number) =>
  Array.from({ length: 12 }, (_, i) => ({
    v: base + Math.sin(i * 0.8) * variance + Math.random() * variance * 0.5,
  }));

const stats = [
  {
    label: "Total Requests",
    value: "1,284,392",
    change: "+12.5%",
    positive: true,
    icon: Activity,
    glow: "",
    data: sparkData(800, 200),
    color: "hsl(250, 85%, 65%)",
  },
  {
    label: "Avg Latency",
    value: "42ms",
    change: "-8.3%",
    positive: true,
    icon: Clock,
    glow: "glow-info",
    data: sparkData(50, 15),
    color: "hsl(210, 100%, 56%)",
  },
  {
    label: "Error Rate",
    value: "0.12%",
    change: "+0.02%",
    positive: false,
    icon: AlertTriangle,
    glow: "glow-danger",
    data: sparkData(0.1, 0.05),
    color: "hsl(0, 72%, 55%)",
  },
  {
    label: "Uptime",
    value: "99.98%",
    change: "stable",
    positive: true,
    icon: Zap,
    glow: "glow-success",
    data: sparkData(99.9, 0.05),
    color: "hsl(152, 60%, 52%)",
  },
];

const StatsCards = () => (
  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
    {stats.map((stat, i) => (
      <motion.div
        key={stat.label}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: i * 0.08, duration: 0.4 }}
        className={`glow-card ${stat.glow} p-5 group cursor-default`}
      >
        <div className="relative z-10 flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              {stat.label}
            </p>
            <p className="text-2xl font-semibold text-foreground">{stat.value}</p>
            <p className={`text-xs font-medium ${stat.positive ? "text-method-post" : "text-method-delete"}`}>
              {stat.change}
            </p>
          </div>
          <stat.icon className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
        </div>
        <div className="relative z-10 mt-3 h-10">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={stat.data}>
              <Line
                type="monotone"
                dataKey="v"
                stroke={stat.color}
                strokeWidth={1.5}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </motion.div>
    ))}
  </div>
);

export default StatsCards;
