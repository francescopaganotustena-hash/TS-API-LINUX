import { useState } from "react";
import { Check, Copy } from "lucide-react";

interface JsonViewerProps {
  data: object;
}

const JsonViewer = ({ data }: JsonViewerProps) => {
  const [copied, setCopied] = useState(false);
  const json = JSON.stringify(data, null, 2);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(json);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const highlight = (raw: string) => {
    return raw.split("\n").map((line, i) => {
      const highlighted = line
        .replace(/"([^"]+)":/g, '<span class="text-primary">"$1"</span>:')
        .replace(/: "(.*?)"/g, ': <span class="text-method-post">"$1"</span>')
        .replace(/: (\d+\.?\d*)/g, ': <span class="text-method-put">$1</span>')
        .replace(/: (true|false)/g, ': <span class="text-method-patch">$1</span>')
        .replace(/: (null)/g, ': <span class="text-muted-foreground">$1</span>');
      return (
        <div key={i} className="flex">
          <span className="select-none text-muted-foreground/40 w-8 text-right mr-4 text-xs leading-6">
            {i + 1}
          </span>
          <span dangerouslySetInnerHTML={{ __html: highlighted }} />
        </div>
      );
    });
  };

  return (
    <div className="relative group">
      <button
        onClick={handleCopy}
        className="absolute top-0 right-0 p-2 rounded-md opacity-0 group-hover:opacity-100 transition-opacity hover:bg-secondary text-muted-foreground hover:text-foreground"
        aria-label="Copy JSON"
      >
        {copied ? <Check className="h-4 w-4 text-method-post" /> : <Copy className="h-4 w-4" />}
      </button>
      <pre className="font-mono text-xs leading-6 overflow-x-auto">
        <code>{highlight(json)}</code>
      </pre>
    </div>
  );
};

export default JsonViewer;
