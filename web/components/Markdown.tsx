"use client";

import { memo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

function Markdown({ children }: { children: string }) {
  return (
    <div className="[&_li>p]:my-0">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: (p) => <p className="my-1 leading-relaxed" {...p} />,
          strong: (p) => <strong className="font-bold" {...p} />,
          h1: (p) => <h1 className="text-[20px] font-extrabold mt-3 mb-0.5" {...p} />,
          h2: (p) => <h2 className="text-[18px] font-extrabold mt-3 mb-0.5" {...p} />,
          h3: (p) => <h3 className="text-[16px] font-bold mt-2 mb-0.5" {...p} />,
          ul: (p) => <ul className="list-disc pl-5 my-1 space-y-0" {...p} />,
          ol: (p) => <ol className="list-decimal pl-5 my-1 space-y-0" {...p} />,
          li: (p) => <li className="leading-snug" {...p} />,
          a: (p) => <a className="text-toss-blue underline" {...p} />,
          code: (p) => <code className="bg-toss-bg rounded px-1 py-0.5 text-[13px]" {...p} />,
          hr: () => <hr className="my-3 border-toss-line" />,
          table: (p) => (
            <div className="overflow-x-auto my-2">
              <table className="w-full text-[14px] border-collapse" {...p} />
            </div>
          ),
          thead: (p) => <thead className="bg-toss-bg" {...p} />,
          th: (p) => <th className="border border-toss-line px-2.5 py-1.5 text-left font-bold" {...p} />,
          td: (p) => <td className="border border-toss-line px-2.5 py-1.5 align-top" {...p} />,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}

export default memo(Markdown);
