import { cn } from "@/lib/utils";
import { ReactNode, createContext, useContext, useState } from "react";

interface TabsContextValue {
  value: string;
  setValue: (v: string) => void;
}

const TabsContext = createContext<TabsContextValue | null>(null);

function useTabs() {
  const ctx = useContext(TabsContext);
  if (!ctx) throw new Error("Tabs parts must be used inside Tabs");
  return ctx;
}

export function Tabs({
  defaultValue,
  value,
  onValueChange,
  children,
}: {
  defaultValue?: string;
  value?: string;
  onValueChange?: (v: string) => void;
  children: ReactNode;
}) {
  const [internalValue, setInternalValue] = useState(defaultValue || "");
  const activeValue = value !== undefined ? value : internalValue;
  const setActiveValue = onValueChange || setInternalValue;
  return (
    <TabsContext.Provider value={{ value: activeValue, setValue: setActiveValue }}>
      {children}
    </TabsContext.Provider>
  );
}

export function TabsList({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "inline-flex h-9 items-center justify-center rounded-lg bg-muted p-1 text-muted-foreground",
        className
      )}
    >
      {children}
    </div>
  );
}

export function TabsTrigger({
  value,
  children,
  className,
}: {
  value: string;
  children: ReactNode;
  className?: string;
}) {
  const { value: active, setValue } = useTabs();
  const isActive = active === value;
  return (
    <button
      onClick={() => setValue(value)}
      className={cn(
        "inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
        isActive
          ? "bg-background text-foreground shadow"
          : "hover:bg-background/50 hover:text-foreground",
        className
      )}
    >
      {children}
    </button>
  );
}

export function TabsContent({
  value,
  children,
  className,
}: {
  value: string;
  children: ReactNode;
  className?: string;
}) {
  const { value: active } = useTabs();
  if (active !== value) return null;
  return (
    <div className={cn("mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2", className)}>
      {children}
    </div>
  );
}
