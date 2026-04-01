import {
  Children,
  isValidElement,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { createPortal } from "react-dom";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  getCitationHostname,
  isNumericCitationLabel,
  isSafeExternalUrl,
} from "@/lib/citations";
import { cn } from "@/lib/utils";

type ChatMarkdownProps = {
  content: string;
  className?: string;
  tone?: "default" | "inverse";
};

type CitationTooltipPosition = {
  left: number;
  top: number;
  placement: "top" | "bottom";
  maxWidth: number;
};

const CITATION_TOOLTIP_MARGIN = 12;
const CITATION_TOOLTIP_MIN_EDGE_GAP = 12;
const CITATION_TOOLTIP_MAX_WIDTH = 360;

function flattenTextContent(children: ReactNode): string {
  return Children.toArray(children).map((child) => {
    if (typeof child === "string" || typeof child === "number") {
      return String(child);
    }

    if (isValidElement<{ children?: ReactNode }>(child)) {
      return flattenTextContent(child.props.children);
    }

    return "";
  }).join("");
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function CitationLink({
  children,
  href,
  className,
}: {
  children: ReactNode;
  href: string;
  className?: string;
}) {
  const citationLabel = flattenTextContent(children).trim();
  const hostname = getCitationHostname(href);
  const anchorRef = useRef<HTMLAnchorElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState<CitationTooltipPosition | null>(null);

  const updateTooltipPosition = useCallback(() => {
    if (typeof window === "undefined") {
      return;
    }

    const anchor = anchorRef.current;
    if (!anchor) {
      return;
    }

    const rect = anchor.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const maxWidth = Math.min(CITATION_TOOLTIP_MAX_WIDTH, Math.max(220, viewportWidth - CITATION_TOOLTIP_MIN_EDGE_GAP * 2));
    const constrainedLeft = clamp(
      rect.left,
      CITATION_TOOLTIP_MIN_EDGE_GAP,
      viewportWidth - CITATION_TOOLTIP_MIN_EDGE_GAP - maxWidth,
    );

    const estimatedTooltipHeight = 84;
    const spaceAbove = rect.top;
    const spaceBelow = viewportHeight - rect.bottom;
    const placement = spaceAbove >= estimatedTooltipHeight || spaceAbove >= spaceBelow ? "top" : "bottom";
    const top = placement === "top"
      ? rect.top - CITATION_TOOLTIP_MARGIN
      : rect.bottom + CITATION_TOOLTIP_MARGIN;

    setTooltipPosition({
      left: constrainedLeft,
      top,
      placement,
      maxWidth,
    });
  }, []);

  useEffect(() => {
    if (!isOpen || typeof window === "undefined") {
      return;
    }

    updateTooltipPosition();

    const handleViewportChange = () => {
      updateTooltipPosition();
    };

    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);

    return () => {
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
    };
  }, [isOpen, updateTooltipPosition]);

  const tooltip = (
    <span
      className={cn(
        "chat-markdown-citation-tooltip",
        tooltipPosition?.placement === "bottom"
          ? "chat-markdown-citation-tooltip-bottom"
          : "chat-markdown-citation-tooltip-top",
      )}
      style={tooltipPosition
        ? {
          left: `${tooltipPosition.left}px`,
          top: `${tooltipPosition.top}px`,
          maxWidth: `${tooltipPosition.maxWidth}px`,
        }
        : undefined}
      role="tooltip"
    >
      <span className="chat-markdown-citation-host">{hostname}</span>
      <span className="chat-markdown-citation-url">{href}</span>
    </span>
  );

  return (
    <sup className="chat-markdown-citation-sup not-prose">
      <a
        ref={anchorRef}
        href={href}
        target="_blank"
        rel="noreferrer noopener"
        className={cn("chat-markdown-citation", className)}
        aria-label={`Source ${citationLabel}: ${hostname}`}
        onMouseEnter={() => setIsOpen(true)}
        onMouseLeave={() => setIsOpen(false)}
        onFocus={() => setIsOpen(true)}
        onBlur={() => setIsOpen(false)}
        onClick={(event) => {
          event.preventDefault();
          void openUrl(href);
        }}
      >
        <span className="chat-markdown-citation-label">{citationLabel}</span>
      </a>
      {typeof document === "undefined"
        ? tooltip
        : isOpen && tooltipPosition
          ? createPortal(tooltip, document.body)
          : null}
    </sup>
  );
}

const chatMarkdownComponents: Components = {
  a({ children, href, ...props }) {
    if (!href || !isSafeExternalUrl(href)) {
      return <span className="chat-markdown-link-disabled">{children}</span>;
    }

    if (isNumericCitationLabel(flattenTextContent(children))) {
      return <CitationLink href={href} className={props.className}>{children}</CitationLink>;
    }

    return (
      <a
        {...props}
        href={href}
        target="_blank"
        rel="noreferrer noopener"
        className={cn("chat-markdown-link", props.className)}
        onClick={(event) => {
          event.preventDefault();
          void openUrl(href);
        }}
      >
        {children}
      </a>
    );
  },
  pre({ children }) {
    return <pre className="chat-markdown-pre not-prose">{children}</pre>;
  },
  table({ children }) {
    return (
      <div className="chat-markdown-table-wrapper not-prose">
        <table className="chat-markdown-table">{children}</table>
      </div>
    );
  },
  th({ children }) {
    return <th className="chat-markdown-th">{children}</th>;
  },
  td({ children }) {
    return <td className="chat-markdown-td">{children}</td>;
  },
  img() {
    return null;
  },
};

export function ChatMarkdown({ content, className, tone = "default" }: ChatMarkdownProps) {
  return (
    <div className={cn("chat-markdown", tone === "inverse" && "chat-markdown-inverse", className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={chatMarkdownComponents} skipHtml>
        {content}
      </ReactMarkdown>
    </div>
  );
}
