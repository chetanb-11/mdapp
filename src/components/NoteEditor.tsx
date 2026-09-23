import { useEffect, useRef } from "react";
import {
  BlockNoteSchema,
  createCodeBlockSpec,
  SyntaxHighlightingExtension,
} from "@blocknote/core";
import { BlockNoteView } from "@blocknote/mantine";
import { useCreateBlockNote } from "@blocknote/react";

// Required BlockNote styles
import "@blocknote/core/fonts/inter.css";
import "@blocknote/mantine/style.css";

// Shiki — custom bundle created inline below instead of shiki-codegen,
// so we control exactly which languages ship.
import { createHighlighterCore } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";

// ── Shiki Syntax Highlighter Extension ──────────────────────────
const syntaxHighlighter = SyntaxHighlightingExtension({
  createHighlighter: () =>
    createHighlighterCore({
      themes: [
        import("shiki/themes/dark-plus.mjs"),
        import("shiki/themes/light-plus.mjs"),
      ],
      langs: [
        import("shiki/langs/cpp.mjs"),
        import("shiki/langs/java.mjs"),
        import("shiki/langs/python.mjs"),
        import("shiki/langs/javascript.mjs"),
        import("shiki/langs/typescript.mjs"),
        import("shiki/langs/sql.mjs"),
      ],
      engine: createJavaScriptRegexEngine(),
    }),
});

// ── Code Block Spec with supported languages ────────────────────
const codeBlockSpec = createCodeBlockSpec({
  indentLineWithTab: true,
  defaultLanguage: "python",
  supportedLanguages: {
    cpp: { name: "C++", aliases: ["c++", "cc"] },
    java: { name: "Java" },
    python: { name: "Python", aliases: ["py"] },
    javascript: { name: "JavaScript", aliases: ["js"] },
    typescript: { name: "TypeScript", aliases: ["ts"] },
    sql: { name: "SQL" },
    text: { name: "Plain Text" },
  },
});

// ── Custom Schema ───────────────────────────────────────────────
const schema = BlockNoteSchema.create({
  blockSpecs: {
    ...BlockNoteSchema.create().blockSpecs,
    codeBlock: codeBlockSpec,
  },
});

// ── Props ───────────────────────────────────────────────────────
interface NoteEditorProps {
  initialMarkdown: string;
  onChange: (markdown: string) => void;
}

// ── NoteEditor Component ────────────────────────────────────────
export default function NoteEditor({ initialMarkdown, onChange }: NoteEditorProps) {
  const initializedRef = useRef(false);

  // Parse initial markdown into blocks (done once per file open).
  // useCreateBlockNote expects initialContent synchronously, so we
  // need to create the editor first then load content.
  const editor = useCreateBlockNote({
    schema,
    extensions: [syntaxHighlighter],
  });

  // Load markdown content on mount (runs once per key change in parent)
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    const loadContent = async () => {
      try {
        if (initialMarkdown.trim()) {
          const blocks = await editor.tryParseMarkdownToBlocks(initialMarkdown);
          editor.replaceBlocks(editor.document, blocks);
        }
      } catch (err) {
        console.error("Failed to parse markdown:", err);
      }
    };

    loadContent();
  }, [editor, initialMarkdown]);

  // Handle editor changes → serialize to markdown → call parent onChange
  const handleChange = async () => {
    try {
      const md = await editor.blocksToMarkdownLossy(editor.document);
      onChange(md);
    } catch (err) {
      console.error("Failed to serialize markdown:", err);
    }
  };

  return (
    <BlockNoteView
      editor={editor}
      theme="dark"
      onChange={handleChange}
    />
  );
}
