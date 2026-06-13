import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import {
  Select,
} from "@/components/ui/Select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/Table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/Dialog";
import { Search } from "lucide-react";
import { useEffect, useState } from "react";

interface ActivityLog {
  id: string;
  timestamp: string;
  method: string;
  path: string;
  status: number;
  durationMs: number;
  requestBody?: unknown;
  responseBody?: unknown;
  error?: string;
}

interface ActivityResponse {
  logs: ActivityLog[];
  total: number;
  page: number;
  limit: number;
}

const methods = ["ALL", "GET", "POST"];
const paths = [
  "ALL",
  "/v2/search",
  "/v2/scrape",
  "/v2/health",
  "/api/metrics",
  "/api/activity",
  "/api/proxy/crawl4ai/crawl/job",
  "/api/proxy/searxng/search",
];

export default function RequestActivity() {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [loading, setLoading] = useState(false);

  const [search, setSearch] = useState("");
  const [method, setMethod] = useState("ALL");
  const [path, setPath] = useState("ALL");
  const [status, setStatus] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");

  const [selectedLog, setSelectedLog] = useState<ActivityLog | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const totalPages = Math.ceil(total / limit);

  const buildQuery = () => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("limit", String(limit));
    if (search.trim()) params.set("search", search.trim());
    if (method !== "ALL") params.set("method", method);
    if (path !== "ALL") params.set("path", path);
    if (status.trim()) params.set("status", status.trim());
    if (startTime) params.set("startTime", new Date(startTime).toISOString());
    if (endTime) params.set("endTime", new Date(endTime).toISOString());
    return params.toString();
  };

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/activity?${buildQuery()}`);
      if (!res.ok) throw new Error("Failed to fetch");
      const data: ActivityResponse = await res.json();
      setLogs(data.logs);
      setTotal(data.total);
    } catch (_e) {
      setLogs([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [page, limit]);

  const handleApplyFilters = () => {
    setPage(1);
    fetchLogs();
  };

  const handleRowClick = (log: ActivityLog) => {
    setSelectedLog(log);
    setDialogOpen(true);
  };

  const formatJson = (obj: unknown) =>
    obj ? JSON.stringify(obj, null, 2) : "N/A";

  return (
    <div className="space-y-6">
      {/* Search bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Search in request & response..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleApplyFilters()}
        />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Method</label>
          <Select value={method} onChange={(e) => setMethod(e.target.value)}>
            {methods.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Path</label>
          <Select value={path} onChange={(e) => setPath(e.target.value)}>
            {paths.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Status</label>
          <Input
            type="number"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            placeholder="e.g. 200"
            className="w-24"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Start</label>
          <Input
            type="datetime-local"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">End</label>
          <Input
            type="datetime-local"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
          />
        </div>
        <Button onClick={handleApplyFilters}>Apply Filters</Button>
      </div>

      {/* Table */}
      <div className="rounded-lg border">
        {loading ? (
          <div className="py-12 text-center text-muted-foreground">
            Loading...
          </div>
        ) : logs.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground">
            No logs found
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Path</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Duration (ms)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((log) => (
                <TableRow
                  key={log.id}
                  className="cursor-pointer"
                  onClick={() => handleRowClick(log)}
                >
                  <TableCell>
                    {new Date(log.timestamp).toLocaleString()}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{log.method}</Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs max-w-xs truncate">
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
                  <TableCell>{log.durationMs}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">
          Page {page} of {totalPages || 1} ({total} total)
        </span>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Prev
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            Next
          </Button>
        </div>
      </div>

      {/* Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[80vh] overflow-auto max-w-3xl">
          <DialogHeader>
            <DialogTitle>Request Details</DialogTitle>
            <DialogDescription>
              {selectedLog && (
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="secondary">{selectedLog.method}</Badge>
                  <span className="font-mono text-xs">{selectedLog.path}</span>
                  <Badge
                    variant={
                      selectedLog.status >= 400 ? "destructive" : "default"
                    }
                  >
                    {selectedLog.status}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {selectedLog.durationMs} ms
                  </span>
                </div>
              )}
            </DialogDescription>
          </DialogHeader>
          {selectedLog && (
            <div className="space-y-4">
              <div>
                <h4 className="text-sm font-medium mb-1">Request Body</h4>
                <pre className="rounded-md border bg-muted p-3 text-xs font-mono overflow-auto max-h-48">
                  {formatJson(selectedLog.requestBody)}
                </pre>
              </div>
              <div>
                <h4 className="text-sm font-medium mb-1">Response Body</h4>
                <pre className="rounded-md border bg-muted p-3 text-xs font-mono overflow-auto max-h-48">
                  {formatJson(selectedLog.responseBody)}
                </pre>
              </div>
              {selectedLog.error && (
                <div>
                  <h4 className="text-sm font-medium mb-1 text-destructive">
                    Error
                  </h4>
                  <pre className="rounded-md border bg-destructive/10 p-3 text-xs font-mono overflow-auto max-h-48 text-destructive">
                    {selectedLog.error}
                  </pre>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
