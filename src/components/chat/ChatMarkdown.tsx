import { openUrl } from "@tauri-apps/plugin-opener";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

type ChatMarkdownProps = {
  content: string;
  className?: string;
};

function isSafeExternalUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

const chatMarkdownComponents: Components = {
  a({ children, href, ...props }) {
    if (!href || !isSafeExternalUrl(href)) {
      return <span className="chat-markdown-link-disabled">{children}</span>;
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

export function ChatMarkdown({ content, className }: ChatMarkdownProps) {
  return (
    <div className={cn("chat-markdown", className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={chatMarkdownComponents} skipHtml>
        {content}
      </ReactMarkdown>
    </div>
  );
}
