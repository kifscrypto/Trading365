'use client'

import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Link from '@tiptap/extension-link'
import TextAlign from '@tiptap/extension-text-align'
import Placeholder from '@tiptap/extension-placeholder'
import { useEffect, useState } from 'react'

interface TipTapEditorProps {
  content: string
  onChange: (html: string) => void
}

/** Returns true if the string looks like HTML (TipTap output) rather than Markdown */
function isHtmlContent(content: string): boolean {
  return /<[a-zA-Z]/.test(content)
}

function ToolbarButton({
  onClick,
  active,
  disabled,
  title,
  children,
}: {
  onClick: () => void
  active?: boolean
  disabled?: boolean
  title: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => { e.preventDefault(); onClick() }}
      disabled={disabled}
      title={title}
      className={`px-2 py-1 rounded text-sm font-medium transition-colors disabled:opacity-30 ${
        active
          ? 'bg-zinc-600 text-zinc-100'
          : 'text-zinc-400 hover:bg-zinc-700 hover:text-zinc-100'
      }`}
    >
      {children}
    </button>
  )
}

function VisualEditor({
  content,
  onChange,
  onSwitchToMarkdown,
}: {
  content: string
  onChange: (html: string) => void
  onSwitchToMarkdown: () => void
}) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        code: false,
        codeBlock: false,
      }),
      Underline,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' },
      }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Placeholder.configure({ placeholder: 'Write your article content here…' }),
    ],
    immediatelyRender: false,
    content,
    onUpdate({ editor }) {
      onChange(editor.getHTML())
    },
    editorProps: {
      attributes: {
        class: 'min-h-[400px] px-4 py-3 text-zinc-100 text-sm leading-relaxed focus:outline-none',
      },
    },
  })

  // Sync content when switching between articles
  useEffect(() => {
    if (!editor) return
    if (editor.getHTML() === content) return
    editor.commands.setContent(content || '', false)
  }, [content])

  if (!editor) return null

  const addLink = () => {
    const url = window.prompt('Enter URL')
    if (!url) return
    editor.chain().focus().extendMarkToLink({ href: url }).setLink({ href: url }).run()
  }

  return (
    <div className="border border-zinc-700 rounded-lg overflow-hidden bg-zinc-800">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-0.5 px-2 py-1.5 border-b border-zinc-700 bg-zinc-900">
        <ToolbarButton onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive('bold')} title="Bold">
          <strong>B</strong>
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive('italic')} title="Italic">
          <em>I</em>
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive('underline')} title="Underline">
          <span className="underline">U</span>
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive('strike')} title="Strikethrough">
          <span className="line-through">S</span>
        </ToolbarButton>

        <span className="w-px h-4 bg-zinc-600 mx-1" />

        <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive('heading', { level: 2 })} title="Heading 2">
          H2
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} active={editor.isActive('heading', { level: 3 })} title="Heading 3">
          H3
        </ToolbarButton>

        <span className="w-px h-4 bg-zinc-600 mx-1" />

        <ToolbarButton onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive('bulletList')} title="Bullet List">
          ≡
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive('orderedList')} title="Ordered List">
          1.
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleBlockquote().run()} active={editor.isActive('blockquote')} title="Blockquote">
          "
        </ToolbarButton>

        <span className="w-px h-4 bg-zinc-600 mx-1" />

        <ToolbarButton onClick={addLink} active={editor.isActive('link')} title="Add Link">
          🔗
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().unsetLink().run()} disabled={!editor.isActive('link')} title="Remove Link">
          ✂
        </ToolbarButton>

        <span className="w-px h-4 bg-zinc-600 mx-1" />

        <ToolbarButton onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()} title="Undo">
          ↩
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()} title="Redo">
          ↪
        </ToolbarButton>

        <span className="flex-1" />

        <button
          type="button"
          onClick={onSwitchToMarkdown}
          className="px-2 py-1 rounded text-xs font-medium text-zinc-400 hover:bg-zinc-700 hover:text-zinc-100 transition-colors ml-1"
          title="Switch to Markdown mode"
        >
          MD
        </button>
      </div>

      {/* Editor body */}
      <EditorContent editor={editor} />
    </div>
  )
}

export default function TipTapEditor({ content, onChange }: TipTapEditorProps) {
  const [mode, setMode] = useState<'visual' | 'markdown'>(() =>
    isHtmlContent(content) ? 'visual' : 'markdown'
  )

  if (mode === 'markdown') {
    return (
      <div className="border border-zinc-700 rounded-lg overflow-hidden bg-zinc-800">
        <div className="flex items-center justify-between px-3 py-1.5 border-b border-zinc-700 bg-zinc-900">
          <span className="text-xs text-zinc-400 font-medium">Markdown — paste directly from Claude</span>
          <button
            type="button"
            onClick={() => setMode('visual')}
            className="px-2 py-1 rounded text-xs font-medium text-zinc-400 hover:bg-zinc-700 hover:text-zinc-100 transition-colors"
          >
            Switch to Visual Editor
          </button>
        </div>
        <textarea
          value={content}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Paste your Markdown here — tables, headings, lists and all..."
          className="w-full min-h-[400px] px-4 py-3 bg-zinc-800 text-zinc-100 text-sm leading-relaxed focus:outline-none resize-y font-mono"
        />
      </div>
    )
  }

  return (
    <VisualEditor
      content={content}
      onChange={onChange}
      onSwitchToMarkdown={() => setMode('markdown')}
    />
  )
}
