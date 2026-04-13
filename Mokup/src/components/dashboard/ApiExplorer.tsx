import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronRight, Copy, Play, Search } from "lucide-react";
import JsonViewer from "./JsonViewer";

interface Endpoint {
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  path: string;
  description: string;
  latency: string;
  status: number;
  response: object;
}

const endpoints: Endpoint[] = [
  {
    method: "GET",
    path: "/api/v2/orders",
    description: "Retrieve all orders with pagination and filters",
    latency: "38ms",
    status: 200,
    response: {
      data: [
        { id: "ORD-2024-1847", customer: "Acme Corp", total: 12450.0, currency: "EUR", status: "fulfilled", items: 5, created_at: "2024-12-15T09:23:11Z" },
        { id: "ORD-2024-1846", customer: "TechFlow Ltd", total: 3200.5, currency: "EUR", status: "processing", items: 2, created_at: "2024-12-14T16:45:02Z" },
      ],
      meta: { page: 1, per_page: 20, total: 1284, total_pages: 65 },
    },
  },
  {
    method: "POST",
    path: "/api/v2/invoices",
    description: "Generate a new invoice from order data",
    latency: "124ms",
    status: 201,
    response: {
      id: "INV-2024-0923",
      order_id: "ORD-2024-1847",
      amount: 12450.0,
      tax: 2739.0,
      total: 15189.0,
      status: "draft",
      pdf_url: "https://erp.example.com/invoices/INV-2024-0923.pdf",
    },
  },
  {
    method: "GET",
    path: "/api/v2/inventory/{sku}",
    description: "Check real-time stock levels for a specific SKU",
    latency: "15ms",
    status: 200,
    response: {
      sku: "WDG-PRO-2024",
      name: "Widget Pro 2024",
      available: 342,
      reserved: 28,
      warehouse: { code: "WH-EU-01", location: "Amsterdam, NL" },
      reorder_point: 50,
      last_updated: "2024-12-15T12:00:00Z",
    },
  },
  {
    method: "PUT",
    path: "/api/v2/customers/{id}",
    description: "Update customer profile and billing information",
    latency: "67ms",
    status: 200,
    response: {
      id: "CUS-8291",
      name: "Acme Corp",
      email: "billing@acme.com",
      plan: "enterprise",
      updated_fields: ["billing_address", "vat_number"],
      updated_at: "2024-12-15T10:30:00Z",
    },
  },
  {
    method: "DELETE",
    path: "/api/v2/webhooks/{id}",
    description: "Remove a registered webhook endpoint",
    latency: "22ms",
    status: 204,
    response: { deleted: true, id: "WHK-4421", message: "Webhook successfully removed" },
  },
  {
    method: "PATCH",
    path: "/api/v2/products/{id}/pricing",
    description: "Partially update product pricing rules",
    latency: "45ms",
    status: 200,
    response: {
      id: "PRD-1120",
      base_price: 89.99,
      discount_rules: [{ min_qty: 10, discount_pct: 5 }, { min_qty: 50, discount_pct: 12 }],
      effective_from: "2025-01-01T00:00:00Z",
    },
  },
];

const methodClass: Record<string, string> = {
  GET: "method-get",
  POST: "method-post",
  PUT: "method-put",
  DELETE: "method-delete",
  PATCH: "method-patch",
};

const ApiExplorer = () => {
  const [selected, setSelected] = useState<number>(0);
  const [search, setSearch] = useState("");

  const filtered = endpoints.filter(
    (e) =>
      e.path.toLowerCase().includes(search.toLowerCase()) ||
      e.description.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 mt-6">
      {/* Endpoints list */}
      <div className="lg:col-span-2 glass-card p-0 overflow-hidden">
        <div className="p-4 border-b border-border">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search endpoints..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm bg-secondary/50 rounded-md border-0 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
            />
          </div>
        </div>
        <div className="divide-y divide-border max-h-[480px] overflow-y-auto">
          {filtered.map((ep, i) => {
            const realIndex = endpoints.indexOf(ep);
            return (
              <motion.button
                key={ep.path + ep.method}
                onClick={() => setSelected(realIndex)}
                className={`w-full text-left px-4 py-3.5 flex items-center gap-3 transition-colors group ${
                  selected === realIndex ? "bg-secondary/80" : "hover:bg-secondary/40"
                }`}
                whileTap={{ scale: 0.995 }}
              >
                <span className={`method-badge ${methodClass[ep.method]} shrink-0`}>
                  {ep.method}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-mono text-foreground truncate">{ep.path}</p>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">{ep.description}</p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
              </motion.button>
            );
          })}
        </div>
      </div>

      {/* Response viewer */}
      <div className="lg:col-span-3 glass-card p-0 overflow-hidden flex flex-col">
        <AnimatePresence mode="wait">
          <motion.div
            key={selected}
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            transition={{ duration: 0.2 }}
            className="flex flex-col flex-1"
          >
            {/* Header */}
            <div className="p-4 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className={`method-badge ${methodClass[endpoints[selected].method]}`}>
                  {endpoints[selected].method}
                </span>
                <span className="text-sm font-mono text-foreground">
                  {endpoints[selected].path}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  {endpoints[selected].latency}
                </span>
                <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-method-post/10 text-method-post">
                  {endpoints[selected].status}
                </span>
                <button className="p-1.5 rounded-md hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground">
                  <Play className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            {/* JSON body */}
            <div className="flex-1 p-4 overflow-auto max-h-[420px]">
              <JsonViewer data={endpoints[selected].response} />
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
};

export default ApiExplorer;
