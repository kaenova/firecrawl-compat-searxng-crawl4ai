import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card";
import { Select } from "@/components/ui/Select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/Table";
import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface MetricsResponse {
  summary: {
    totalRequests: number;
    successCount: number;
    failedCount: number;
    averageLatencyMs: number;
    p95LatencyMs: number;
    p99LatencyMs: number;
    requestsPerEndpoint: Record<string, number>;
  };
  timeSeries: {
    timestamp: string;
    count: number;
    avgLatencyMs: number;
    errorCount: number;
  }[];
}

interface ActivityLog {
  id: string;
  timestamp: string;
  method: string;
  path: string;
  status: number;
  durationMs: number;
}

interface ActivityResponse {
  logs: ActivityLog[];
  total: number;
  page: number;
  limit: number;
}

const ranges = [
  { label: "Last 15 minutes", value: "15m" },
  { label: "Last 1 hour", value: "1h" },
  { label: "Last 6 hours", value: "6h" },
  { label: "Last 24 hours", value: "24h" },
];

const granularities = [
  { label: "1 minute", value: "1m" },
  { label: "5 minutes", value: "5m" },
  { label: "15 minutes", value: "15m" },
  { label: "1 hour", value: "1h" },
];

export default function Dashboard() {
  const [metrics, setMetrics] = useState<MetricsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState("1h");
  const [granularity, setGranularity] = useState("5m");
  const [recent, setRecent] = useState<ActivityLog[]>([]);
  const [recentLoading, setRecentLoading] = useState(true);

  const fetchMetrics = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/metrics?granularity=${granularity}`);
      if (!res.ok) throw new Error("Failed to fetch metrics");
      const data = await res.json();
      setMetrics(data);
    } catch (_e) {
      setMetrics(null);
    } finally {
      setLoading(false);
    }
  };

  const fetchRecent = async () => {
    setRecentLoading(true);
    try {
      const res = await fetch(`/api/activity?limit=10`);
      if (!res.ok) throw new Error("Failed to fetch activity");
      const data: ActivityResponse = await res.json();
      setRecent(data.logs);
    } catch (_e) {
      setRecent([]);
    } finally {
      setRecentLoading(false);
    }
  };

  useEffect(() => {
    fetchMetrics();
    fetchRecent();
  }, [granularity]);

  const stats = metrics?.summary || {
    totalRequests: 0,
    successCount: 0,
    failedCount: 0,
    averageLatencyMs: 0,
  };

  const successRate =
    stats.totalRequests > 0
      ? Math.round((stats.successCount / stats.totalRequests) * 100)
      : 0;

  const timeSeries = metrics?.timeSeries || [];

  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Requests
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {loading ? "Loading..." : stats.totalRequests.toLocaleString()}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Success Rate
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {loading ? "Loading..." : `${successRate}%`}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Avg Latency
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {loading
                ? "Loading..."
                : `${Math.round(stats.averageLatencyMs)} ms`}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Error Count
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {loading ? "Loading..." : stats.failedCount.toLocaleString()}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Range</span>
          <Select value={range} onChange={(e) => setRange(e.target.value)}>
            {ranges.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Granularity</span>
          <Select
            value={granularity}
            onChange={(e) => setGranularity(e.target.value)}
          >
            {granularities.map((g) => (
              <option key={g.value} value={g.value}>
                {g.label}
              </option>
            ))}
          </Select>
        </div>
        <Button variant="outline" size="sm" onClick={fetchMetrics}>
          Refresh
        </Button>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Latency Over Time</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={timeSeries}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="timestamp"
                  tickFormatter={(v) =>
                    new Date(v).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  }
                />
                <YAxis />
                <Tooltip
                  labelFormatter={(v) => new Date(v as string).toLocaleString()}
                  formatter={(value: number) => [`${Math.round(value)} ms`, "Avg Latency"]}
                />
                <Line
                  type="monotone"
                  dataKey="avgLatencyMs"
                  stroke="#2563eb"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Throughput Over Time</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={timeSeries}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="timestamp"
                  tickFormatter={(v) =>
                    new Date(v).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  }
                />
                <YAxis />
                <Tooltip
                  labelFormatter={(v) => new Date(v as string).toLocaleString()}
                  formatter={(value: number) => [value, "Requests"]}
                />
                <Bar dataKey="count" fill="#2563eb" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Recent Requests */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Requests</CardTitle>
        </CardHeader>
        <CardContent>
          {recentLoading ? (
            <div className="py-8 text-center text-muted-foreground">
              Loading...
            </div>
          ) : recent.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              No recent requests
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Path</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Duration</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recent.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell>
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{log.method}</Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {log.path}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          log.status >= 400 ? "destructive" : "default"
                        }
                      >
                        {log.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{log.durationMs} ms</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
