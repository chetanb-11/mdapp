import { useState, useCallback, useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import Sidebar from "./components/Sidebar";
import NoteEditor from "./components/NoteEditor";
import {
  FileText,
  FolderOpen,
  Plus,
  ExternalLink,
  Copy,
  Check,
} from "lucide-react";

// ── Types ───────────────────────────────────────────────────────
export interface FileEntry {
  name: string;
  path: string;
  is_dir: boolean;
  children: FileEntry[];
}

export type SaveStatus = "idle" | "saved" | "saving" | "unsaved";

// ── App ─────────────────────────────────────────────────────────
export default function App() {
  const [rootDir, setRootDir] = useState<string | null>(null);
  const [fileTree, setFileTree] = useState<FileEntry[]>([]);
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [activeFileName, setActiveFileName] = useState<string>("");
  const [markdown, setMarkdown] = useState<string>("");
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [pathCopied, setPathCopied] = useState<boolean>(false);

  // Debounce timer ref for auto-save
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Open Folder ─────────────────────────────────────────────
  const handleOpenFolder = useCallback(async () => {
    try {
      const selected = await open({ directory: true, multiple: false });
      if (selected && typeof selected === "string") {
        setRootDir(selected);
        const tree = await invoke<FileEntry[]>("list_markdown_files", {
          rootDir: selected,
        });
        setFileTree(tree);
        setActiveFile(null);
        setActiveFileName("");
        setMarkdown("");
        setSaveStatus("idle");
      }
    } catch (err) {
      console.error("Failed to open folder:", err);
    }
  }, []);

  // ── Refresh tree (re-scan current directory) ────────────────
  const refreshTree = useCallback(async () => {
    if (!rootDir) return;
    try {
      const tree = await invoke<FileEntry[]>("list_markdown_files", {
        rootDir,
      });
      setFileTree(tree);
    } catch (err) {
      console.error("Failed to refresh tree:", err);
    }
  }, [rootDir]);

  // ── Open a file ─────────────────────────────────────────────
  const handleFileSelect = useCallback(async (filePath: string, fileName: string) => {
    // Flush any pending save before switching files
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }

    try {
      const content = await invoke<string>("read_markdown_file", {
        filePath,
      });
      setActiveFile(filePath);
      setActiveFileName(fileName);
      setMarkdown(content);
      setSaveStatus("saved");
    } catch (err) {
      console.error("Failed to read file:", err);
    }
  }, []);

  // ── Create New File ─────────────────────────────────────────
  const handleCreateFile = useCallback(
    async (fileName?: string) => {
      try {
        if (rootDir) {
          const name = fileName?.trim() || "Untitled.md";
          const newPath = await invoke<string>("create_markdown_file", {
            parentDir: rootDir,
            fileName: name,
          });

          // Refresh the tree to include the new file
          const tree = await invoke<FileEntry[]>("list_markdown_files", {
            rootDir,
          });
          setFileTree(tree);

          // Extract pure file name from path
          const pureName = newPath.split(/[\\/]/).pop() || name;
          await handleFileSelect(newPath, pureName);
        } else {
          // If no folder is open yet, show a native Save Dialog to pick location
          const chosenPath = await save({
            title: "Create New Markdown Note",
            defaultPath: fileName ? fileName : "Untitled.md",
            filters: [{ name: "Markdown", extensions: ["md"] }],
          });

          if (chosenPath && typeof chosenPath === "string") {
            const pureName = chosenPath.split(/[\\/]/).pop() || "Untitled.md";
            const initialTitle = pureName.replace(/\.md$/i, "");
            const initialContent = `# ${initialTitle}\n\n`;

            await invoke("save_markdown_file", {
              filePath: chosenPath,
              content: initialContent,
            });

            // Set parent folder as rootDir
            const parentDirectory = chosenPath.replace(/[\\/][^\\/]+$/, "");
            setRootDir(parentDirectory);

            const tree = await invoke<FileEntry[]>("list_markdown_files", {
              rootDir: parentDirectory,
            });
            setFileTree(tree);

            await handleFileSelect(chosenPath, pureName);
          }
        }
      } catch (err) {
        console.error("Failed to create file:", err);
        throw err;
      }
    },
    [rootDir, handleFileSelect],
  );

  // ── Locate in Windows Explorer ───────────────────────────────
  const handleLocateFile = useCallback(async (filePath?: string | null) => {
    const target = filePath || activeFile;
    if (!target) return;
    try {
      await invoke("reveal_in_explorer", { filePath: target });
    } catch (err) {
      console.error("Failed to locate file in explorer:", err);
    }
  }, [activeFile]);

  // ── Copy File Path ──────────────────────────────────────────
  const handleCopyPath = useCallback(async () => {
    if (!activeFile) return;
    try {
      await navigator.clipboard.writeText(activeFile);
      setPathCopied(true);
      setTimeout(() => setPathCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy path:", err);
    }
  }, [activeFile]);

  // ── Keyboard Shortcut: Ctrl+N for New File ─────────────────
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "n") {
        e.preventDefault();
        handleCreateFile();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleCreateFile]);

  // ── Auto-save (debounced 500ms) ─────────────────────────────
  const handleContentChange = useCallback(
    (newMarkdown: string) => {
      if (!activeFile) return;

      setMarkdown(newMarkdown);
      setSaveStatus("unsaved");

      // Clear existing timer
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }

      // Debounce: write to disk after 500ms of inactivity
      saveTimerRef.current = setTimeout(async () => {
        setSaveStatus("saving");
        try {
          await invoke("save_markdown_file", {
            filePath: activeFile,
            content: newMarkdown,
          });
          setSaveStatus("saved");
        } catch (err) {
          console.error("Failed to save file:", err);
          setSaveStatus("unsaved");
        }
      }, 500);
    },
    [activeFile],
  );

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, []);

  // ── Render ──────────────────────────────────────────────────
  return (
    <div className="app-layout">
      <Sidebar
        fileTree={fileTree}
        activeFile={activeFile}
        onOpenFolder={handleOpenFolder}
        onFileSelect={handleFileSelect}
        onRefresh={refreshTree}
        onCreateFile={handleCreateFile}
        onLocateFile={handleLocateFile}
        rootDir={rootDir}
      />

      <div className="main-content">
        {/* Title bar */}
        {activeFile && (
          <div className="titlebar fade-in">
            <div className="titlebar-left">
              <FileText size={15} style={{ color: "var(--accent)", flexShrink: 0 }} />
              <span className="titlebar-filename">{activeFileName}</span>
              <span className="titlebar-path" title={activeFile}>
                {activeFile}
              </span>

              {/* Locate in Explorer Action Button */}
              <button
                className="titlebar-locate-btn"
                onClick={() => handleLocateFile(activeFile)}
                title="Locate file in Windows File Explorer"
              >
                <ExternalLink size={12} />
                <span>Locate in Explorer</span>
              </button>

              {/* Copy Path Action Button */}
              <button
                className="titlebar-locate-btn"
                onClick={handleCopyPath}
                title="Copy absolute file path"
              >
                {pathCopied ? <Check size={12} style={{ color: "var(--success)" }} /> : <Copy size={12} />}
                <span>{pathCopied ? "Copied!" : "Copy Path"}</span>
              </button>
            </div>

            <div className="titlebar-right">
              <div className={`save-status ${saveStatus}`}>
                {saveStatus === "saved" && "✓ Saved"}
                {saveStatus === "saving" && "Saving…"}
                {saveStatus === "unsaved" && "● Unsaved"}
                {saveStatus === "idle" && ""}
              </div>
            </div>
          </div>
        )}

        {/* Editor or empty state */}
        {activeFile ? (
          <div className="editor-container">
            <div className="editor-wrapper">
              <NoteEditor
                key={activeFile}
                initialMarkdown={markdown}
                onChange={handleContentChange}
              />
            </div>
          </div>
        ) : (
          <div className="empty-state fade-in">
            <div className="empty-state-icon">
              <FolderOpen size={30} />
            </div>
            <h2>No note selected</h2>
            <p>
              Create a new note or open an existing directory of <code>.md</code> files.
            </p>

            <div className="empty-state-buttons">
              <button
                className="primary-action-btn empty-btn"
                onClick={() => handleCreateFile()}
              >
                <Plus size={16} />
                <span>Create New Note</span>
              </button>
              <button
                className="secondary-action-btn empty-btn"
                onClick={handleOpenFolder}
              >
                <FolderOpen size={16} />
                <span>Open Folder</span>
              </button>
            </div>

            <div className="empty-state-tips">
              <p>
                Press <span className="shortcut-hint">Ctrl + N</span> to quickly create a note anytime.
              </p>
              <p>
                Use <span className="shortcut-hint">/</span> slash commands in the editor for headings, code blocks, and tables.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
