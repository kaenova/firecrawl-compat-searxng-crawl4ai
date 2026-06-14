import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { useEffect, useRef, useState } from "react";

interface ApiResponse {
  status: number;
  time: number;
  body: unknown;
}

export default function ApiPlayground() {
  const [activeTab, setActiveTab] = useState("firecrawl");
  const [subTab, setSubTab] = useState("search");
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<ApiResponse | null>(null);

  // Firecrawl state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchLimit, setSearchLimit] = useState(10);
  const [scrapeUrl, setScrapeUrl] = useState("");
  const [scrapeFormats, setScrapeFormats] = useState<string[]>(["markdown"]);

  // Crawl4AI state
  const [crawlUrl, setCrawlUrl] = useState("");
  const [crawlTaskId, setCrawlTaskId] = useState("");
  const [crawlStatus, setCrawlStatus] = useState<string>("");
  const [crawlResult, setCrawlResult] = useState<ApiResponse | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // SearXNG state
  const [searxQuery, setSearxQuery] = useState("");

  const formatJson = (obj: unknown) => JSON.stringify(obj, null, 2);

  const send = async (
    method: string,
    url: string,
    body?: unknown
  ): Promise<ApiResponse> => {
    const start = performance.now();
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const end = performance.now();
    let json: unknown;
    try {
      json = await res.json();
    } catch {
      json = null;
    }
    return { status: res.status, time: Math.round(end - start), body: json };
  };

  const handleFirecrawlSearch = async () => {
    if (!searchQuery.trim()) return;
    setLoading(true);
    const res = await send("POST", "/v2/search", {
      query: searchQuery,
      limit: searchLimit,
    });
    setResponse(res);
    setLoading(false);
  };

  const handleFirecrawlScrape = async () => {
    if (!scrapeUrl.trim()) return;
    setLoading(true);
    const res = await send("POST", "/v2/scrape", {
      url: scrapeUrl,
      formats: scrapeFormats,
    });
    setResponse(res);
    setLoading(false);
  };

  const handleCrawl4aiSubmit = async () => {
    if (!crawlUrl.trim()) return;
    setLoading(true);
    setCrawlStatus("Submitting...");
    setCrawlResult(null);
    const res = await send("POST", "/api/proxy/crawl4ai/crawl/job", {
      url: crawlUrl,
    });
    setResponse(res);
    if (res.status >= 200 && res.status < 300) {
      const body = res.body as { task_id?: string };
      if (body.task_id) {
        setCrawlTaskId(body.task_id);
        startPolling(body.task_id);
      } else {
        setCrawlStatus("No task_id returned");
      }
    } else {
      setCrawlStatus("Submission failed");
    }
    setLoading(false);
  };

  const startPolling = (taskId: string) => {
    if (pollRef.current) clearInterval(pollRef.current);
    setCrawlStatus("Polling...");
    pollRef.current = setInterval(async () => {
      const res = await fetch(`/api/proxy/crawl4ai/crawl/job/${taskId}`);
      const data = await res.json();
      const status = (data as { status?: string }).status || "";
      setCrawlStatus(status);
      if (status === "completed" || status === "failed") {
        if (pollRef.current) clearInterval(pollRef.current);
        setCrawlResult({
          status: res.status,
          time: 0,
          body: data,
        });
      }
    }, 2000);
  };

  const handleSearxngSearch = async () => {
    if (!searxQuery.trim()) return;
    setLoading(true);
    const res = await send(
      "GET",
      `/api/proxy/searxng/search?q=${encodeURIComponent(searxQuery)}`
    );
    setResponse(res);
    setLoading(false);
  };

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  return (
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="overflow-x-auto">
          <TabsList>
            <TabsTrigger value="firecrawl">Firecrawl Proxy</TabsTrigger>
            <TabsTrigger value="crawl4ai">Crawl4AI</TabsTrigger>
            <TabsTrigger value="searxng">SearXNG</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="firecrawl">
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button
                variant={subTab === "search" ? "default" : "outline"}
                className="h-10"
                onClick={() => setSubTab("search")}
              >
                Search
              </Button>
              <Button
                variant={subTab === "scrape" ? "default" : "outline"}
                className="h-10"
                onClick={() => setSubTab("scrape")}
              >
                Scrape
              </Button>
            </div>

            {subTab === "search" ? (
              <div className="space-y-2">
                <label className="text-sm font-medium">Query</label>
                <Input
                  className="text-base w-full"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search query..."
                />
                <label className="text-sm font-medium">Limit</label>
                <Input
                  className="text-base w-full"
                  type="number"
                  value={searchLimit}
                  onChange={(e) => setSearchLimit(Number(e.target.value))}
                  placeholder="10"
                />
                <Button
                  className="h-10"
                  onClick={handleFirecrawlSearch}
                  disabled={loading || !searchQuery.trim()}
                >
                  {loading ? "Sending..." : "Send"}
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                <label className="text-sm font-medium">URL</label>
                <Input
                  className="text-base w-full"
                  value={scrapeUrl}
                  onChange={(e) => setScrapeUrl(e.target.value)}
                  placeholder="https://example.com"
                />
                <label className="text-sm font-medium">Formats</label>
                <div className="flex flex-wrap gap-2">
                  {["markdown", "html", "rawHtml"].map((f) => (
                    <label key={f} className="flex items-center gap-1 text-sm">
                      <input
                        type="checkbox"
                        checked={scrapeFormats.includes(f)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setScrapeFormats((prev) => [...prev, f]);
                          } else {
                            setScrapeFormats((prev) =>
                              prev.filter((x) => x !== f)
                            );
                          }
                        }}
                      />
                      {f}
                    </label>
                  ))}
                </div>
                <Button
                  className="h-10"
                  onClick={handleFirecrawlScrape}
                  disabled={loading || !scrapeUrl.trim()}
                >
                  {loading ? "Sending..." : "Send"}
                </Button>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="crawl4ai">
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">URL</label>
              <Input
                className="text-base w-full"
                value={crawlUrl}
                onChange={(e) => setCrawlUrl(e.target.value)}
                placeholder="https://example.com"
              />
              <Button
                className="h-10"
                onClick={handleCrawl4aiSubmit}
                disabled={loading || !crawlUrl.trim()}
              >
                {loading ? "Sending..." : "Submit & Poll"}
              </Button>
            </div>
            {crawlTaskId && (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-muted-foreground">Task ID:</span>
                <Badge variant="secondary">{crawlTaskId}</Badge>
                <span className="text-muted-foreground">Status:</span>
                <Badge
                  variant={
                    crawlStatus === "completed"
                      ? "default"
                      : crawlStatus === "failed"
                      ? "destructive"
                      : "secondary"
                  }
                >
                  {crawlStatus || "idle"}
                </Badge>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="searxng">
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Query</label>
              <Input
                className="text-base w-full"
                value={searxQuery}
                onChange={(e) => setSearxQuery(e.target.value)}
                placeholder="Search query..."
              />
              <Button
                className="h-10"
                onClick={handleSearxngSearch}
                disabled={loading || !searxQuery.trim()}
              >
                {loading ? "Sending..." : "Send"}
              </Button>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* Response area */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium">Response</h3>
          <div className="flex items-center gap-2">
            {response && (
              <>
                <Badge
                  variant={response.status >= 400 ? "destructive" : "default"}
                >
                  {response.status}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {response.time} ms
                </span>
              </>
            )}
            <Button
              variant="outline"
              className="h-10"
              onClick={() => {
                setResponse(null);
                setCrawlResult(null);
              }}
            >
              Clear
            </Button>
          </div>
        </div>
        <pre className="min-h-[200px] md:min-h-[400px] overflow-auto rounded-lg border bg-muted p-4 text-xs font-mono">
          {response
            ? formatJson(response.body)
            : crawlResult
            ? formatJson(crawlResult.body)
            : "No response yet"}
        </pre>
      </div>
    </div>
  );
}
