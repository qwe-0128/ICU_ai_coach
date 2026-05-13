import React from 'react'

// ============ Simple Markdown Renderer ============
// Renders DeepSeek AI responses (headings, bold, lists, code, paragraphs)

export function Markdown({ content }: { content: string }) {
  if (!content) return null

  const lines = content.split('\n')
  const elements: React.JSX.Element[] = []
  let i = 0
  let inCodeBlock = false
  let codeLines: string[] = []

  while (i < lines.length) {
    const line = lines[i]

    // Code block fence
    if (line.trimStart().startsWith('```')) {
      if (inCodeBlock) {
        elements.push(
          <pre key={`code-${i}`} className="markdown-code-block">
            <code>{codeLines.join('\n')}</code>
          </pre>
        )
        codeLines = []
        inCodeBlock = false
        i++
        continue
      } else {
        inCodeBlock = true
        i++
        continue
      }
    }

    if (inCodeBlock) {
      codeLines.push(line)
      i++
      continue
    }

    // Empty line → skip
    if (line.trim() === '') {
      i++
      continue
    }

    // Heading
    const headingMatch = line.match(/^(#{1,6})\s+(.+)/)
    if (headingMatch) {
      const level = headingMatch[1].length
      const text = headingMatch[2]
      if (level === 1) elements.push(<h1 key={`h-${i}`} className="markdown-h1">{parseInlineMarkdown(text)}</h1>)
      else if (level === 2) elements.push(<h2 key={`h-${i}`} className="markdown-h2">{parseInlineMarkdown(text)}</h2>)
      else if (level === 3) elements.push(<h3 key={`h-${i}`} className="markdown-h3">{parseInlineMarkdown(text)}</h3>)
      else if (level === 4) elements.push(<h4 key={`h-${i}`} className="markdown-h4">{parseInlineMarkdown(text)}</h4>)
      else if (level === 5) elements.push(<h5 key={`h-${i}`} className="markdown-h5">{parseInlineMarkdown(text)}</h5>)
      else elements.push(<h6 key={`h-${i}`} className="markdown-h6">{parseInlineMarkdown(text)}</h6>)
      i++
      continue
    }

    // Unordered list
    const ulMatch = line.match(/^(\s*)[-*+]\s+(.+)/)
    if (ulMatch) {
      const items: string[] = []
      while (i < lines.length) {
        const m = lines[i].match(/^(\s*)[-*+]\s+(.+)/)
        if (!m) break
        items.push(m[2])
        i++
      }
      elements.push(
        <ul key={`ul-${i}`} className="markdown-ul">
          {items.map((item, idx) => (
            <li key={idx} className="markdown-li">{parseInlineMarkdown(item)}</li>
          ))}
        </ul>
      )
      continue
    }

    // Ordered list
    const olMatch = line.match(/^(\s*)\d+\.\s+(.+)/)
    if (olMatch) {
      const items: string[] = []
      while (i < lines.length) {
        const m = lines[i].match(/^(\s*)\d+\.\s+(.+)/)
        if (!m) break
        items.push(m[2])
        i++
      }
      elements.push(
        <ol key={`ol-${i}`} className="markdown-ol">
          {items.map((item, idx) => (
            <li key={idx} className="markdown-li">{parseInlineMarkdown(item)}</li>
          ))}
        </ol>
      )
      continue
    }

    // Horizontal rule
    if (/^[-*_]{3,}\s*$/.test(line.trim())) {
      elements.push(<hr key={`hr-${i}`} className="markdown-hr" />)
      i++
      continue
    }

    // Blockquote
    if (line.trimStart().startsWith('>')) {
      const quoteLines: string[] = []
      while (i < lines.length) {
        const m = lines[i].match(/^>\s?(.*)/)
        if (!m) break
        quoteLines.push(m[1] || '')
        i++
      }
      elements.push(
        <blockquote key={`bq-${i}`} className="markdown-blockquote">
          {parseInlineMarkdown(quoteLines.join('\n'))}
        </blockquote>
      )
      continue
    }

    // Regular paragraph
    const paraLines: string[] = [line]
    i++
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !lines[i].trimStart().startsWith('```') &&
      !lines[i].match(/^(#{1,6}\s)/) &&
      !lines[i].match(/^(\s*)[-*+]\s+/) &&
      !lines[i].match(/^(\s*)\d+\.\s+/) &&
      !/^[-*_]{3,}\s*$/.test(lines[i].trim()) &&
      !lines[i].trimStart().startsWith('>')
    ) {
      paraLines.push(lines[i])
      i++
    }
    elements.push(
      <p key={`p-${i}`} className="markdown-p">{parseInlineMarkdown(paraLines.join('\n'))}</p>
    )
  }

  if (inCodeBlock && codeLines.length > 0) {
    elements.push(
      <pre key="code-final" className="markdown-code-block">
        <code>{codeLines.join('\n')}</code>
      </pre>
    )
  }

  return <div className="markdown-content">{elements}</div>
}

// Parse inline: **bold**, *italic*, `code`, ~~strike~~
function parseInlineMarkdown(text: string): React.ReactNode {
  const tokens: Array<{ type: string; text: string; key: number }> = []
  const regex = /(`[^`]+`)|(\*\*[^*]+\*\*)|(__[^_]+__)|(?<!\*)\*[^*]+\*(?!\*)|(?<!_)_[^_]+_(?!_)|(~~[^~]+~~)/g
  let lastIdx = 0
  let match: RegExpExecArray | null
  let keyGen = 0

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIdx) {
      tokens.push({ type: 'text', text: text.slice(lastIdx, match.index), key: keyGen++ })
    }
    const full = match[0]
    if (full.startsWith('`') && full.endsWith('`')) {
      tokens.push({ type: 'code', text: full.slice(1, -1), key: keyGen++ })
    } else if ((full.startsWith('**') && full.endsWith('**')) || (full.startsWith('__') && full.endsWith('__'))) {
      tokens.push({ type: 'bold', text: full.slice(2, -2), key: keyGen++ })
    } else if (full.startsWith('~~') && full.endsWith('~~')) {
      tokens.push({ type: 'strike', text: full.slice(2, -2), key: keyGen++ })
    } else {
      tokens.push({ type: 'italic', text: full.slice(1, -1), key: keyGen++ })
    }
    lastIdx = match.index + full.length
  }
  if (lastIdx < text.length) {
    tokens.push({ type: 'text', text: text.slice(lastIdx), key: keyGen++ })
  }

  if (tokens.length === 0) return text

  return (
    <>
      {tokens.map(t => {
        switch (t.type) {
          case 'code': return <code key={t.key} className="markdown-inline-code">{t.text}</code>
          case 'bold': return <strong key={t.key} className="markdown-strong">{t.text}</strong>
          case 'italic': return <em key={t.key} className="markdown-em">{t.text}</em>
          case 'strike': return <del key={t.key} className="markdown-del">{t.text}</del>
          default: return <React.Fragment key={t.key}>{t.text}</React.Fragment>
        }
      })}
    </>
  )
}