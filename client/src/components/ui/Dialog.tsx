import { cn } from "@/lib/utils";
import { X } from "lucide-react";
import {
  HTMLAttributes,
  ReactNode,
  createContext,
  useContext,
  useState,
} from "react";

interface DialogContextValue {
  open: boolean;
  setOpen: (v: boolean) => void;
}

const DialogContext = createContext<DialogContextValue | null>(null);

function useDialog() {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error("Dialog parts must be used inside Dialog");
  return ctx;
}

export function Dialog({
  children,
  open,
  onOpenChange,
}: {
  children: ReactNode;
  open?: boolean;
  onOpenChange?: (v: boolean) => void;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = open !== undefined ? open : internalOpen;
  const setIsOpen = onOpenChange || setInternalOpen;
  return (
    <DialogContext.Provider value={{ open: isOpen, setOpen: setIsOpen }}>
      {children}
    </DialogContext.Provider>
  );
}

export function DialogTrigger({
  children,
  asChild,
}: {
  children: ReactNode;
  asChild?: boolean;
}) {
  const { setOpen } = useDialog();
  if (asChild) {
    return (
      <span onClick={() => setOpen(true)} className="cursor-pointer">
        {children}
      </span>
    );
  }
  return (
    <button onClick={() => setOpen(true)} className="cursor-pointer">
      {children}
    </button>
  );
}

export function DialogContent({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const { open, setOpen } = useDialog();
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div
        className={cn(
          "relative w-full max-w-lg rounded-lg border bg-card p-6 shadow-lg",
          className
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={() => setOpen(false)}
          className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
        >
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </button>
        {children}
      </div>
    </div>
  );
}

export function DialogHeader({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex flex-col space-y-1.5 text-center sm:text-left",
        className
      )}
      {...props}
    />
  );
}

export function DialogTitle({
  className,
  ...props
}: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h2
      className={cn(
        "text-lg font-semibold leading-none tracking-tight",
        className
      )}
      {...props}
    />
  );
}

export function DialogDescription({
  className,
  ...props
}: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className={cn("text-sm text-muted-foreground", className)} {...props} />
  );
}
