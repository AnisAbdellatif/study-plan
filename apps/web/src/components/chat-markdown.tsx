import type { ReactNode } from 'react'
import Markdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'

// Headings would break into the page outline from inside the chat log, so they render as bold paragraphs.
const heading = ({ children }: { children?: ReactNode }) => <p className="font-semibold">{children}</p>

const components: Components = {
  h1: heading,
  h2: heading,
  h3: heading,
  h4: heading,
  h5: heading,
  h6: heading,
  ul: ({ children }) => <ul className="list-disc space-y-1 ps-5">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal space-y-1 ps-5">{children}</ol>,
  // Unsafe URLs (javascript: and the like) arrive here without an href.
  a: ({ href, children }) =>
    href ? (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="font-medium text-indigo-700 underline underline-offset-2 dark:text-indigo-300"
      >
        {children}
      </a>
    ) : (
      children
    ),
  code: ({ children }) => (
    <code className="rounded bg-zinc-100 px-1 py-0.5 font-mono text-[0.85em] dark:bg-zinc-800">
      {children}
    </code>
  ),
  pre: ({ children }) => (
    <pre className="overflow-x-auto rounded-lg bg-zinc-100 p-2 dark:bg-zinc-800 [&_code]:bg-transparent [&_code]:p-0">
      {children}
    </pre>
  ),
  blockquote: ({ children }) => (
    <blockquote className="border-s-2 border-zinc-300 ps-3 text-zinc-700 dark:border-zinc-700 dark:text-zinc-300">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="border-zinc-200 dark:border-zinc-800" />,
  table: ({ children }) => (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left text-xs">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border-b border-zinc-300 px-2 py-1 font-semibold dark:border-zinc-700">{children}</th>
  ),
  td: ({ children }) => (
    <td className="border-b border-zinc-200 px-2 py-1 align-top dark:border-zinc-800">{children}</td>
  ),
}

/**
 * An assistant answer written in Markdown (GitHub flavour: lists, tables, bold, links). Raw HTML and images are
 * dropped, links open in a new tab. Loaded lazily, so the Markdown parser only downloads with the first answer.
 */
export default function ChatMarkdown({ children }: { children: string }) {
  return (
    <div className="space-y-2 break-words">
      <Markdown remarkPlugins={[remarkGfm]} components={components} skipHtml disallowedElements={['img']}>
        {children}
      </Markdown>
    </div>
  )
}
