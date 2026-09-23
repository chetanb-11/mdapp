import { useState, useCallback, useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import Sidebar from "./components/Sidebar";
import NoteEditor from "./components/NoteEditor";
import {
  FileText,
  Plus,
  ExternalLink,
  Copy,
  Check,
  FolderOpen,
} from "lucide-react";

// ── Types ───────────────────────────────────────────────────────
export interface FileNode {
  name: string;
  path: string;
  is_dir: boolean;
  children: FileNode[];
}

export type SaveStatus = "idle" | "saved" | "saving" | "unsaved";

// ── App Component ───────────────────────────────────────────────
export default function App() {
  const [rootNode, setRootNode] = useState<FileNode | null>(null);
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [activeFileName, setActiveFileName] = useState<string>("");
  const [markdown, setMarkdown] = useState<string>("");
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [pathCopied, setPathCopied] = useState<boolean>(false);

  // Debounce timer ref for auto-save
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // ── Load / Refresh Workspace Tree ───────────────────────────
  const loadWorkspace = useCallback(async (): Promise<FileNode | null> => {
    try {
      const tree = await invoke<FileNode>("get_file_tree");
      setRootNode(tree);
      return tree;
    } catch (err) {
      console.error("Failed to load workspace:", err);
      return null;
    }
  }, []);

  // ── Auto-load on Mount & Open Welcome.md if available ────────
  useEffect(() => {
    loadWorkspace().then((tree) => {
      if (tree) {
        // Look for Welcome.md or the first .md file
        const findFirstMd = (node: FileNode): FileNode | null => {
          if (!node.is_dir && node.name.toLowerCase().endsWith(".md")) {
            return node;
          }
          for (const child of node.children) {
            const found = findFirstMd(child);
            if (found) return found;
          }
          return null;
        };

        const welcome = tree.children.find(
          (c) => !c.is_dir && c.name.toLowerCase() === "welcome.md",
        );
        const target = welcome || findFirstMd(tree);
        if (target) {
          handleFileSelect(target.path, target.name);
        }
      }
    });
  }, [loadWorkspace, handleFileSelect]);

  // ── Create File ─────────────────────────────────────────────
  const handleCreateFile = useCallback(
    async (folderPath: string, fileName: string) => {
      const rootPath = rootNode?.path ?? "C:\\mdapp\\mddata";
      let relPath: string;

      if (folderPath.startsWith(rootPath)) {
        const sub = folderPath.slice(rootPath.length).replace(/^[\\/]+/, "");
        relPath = sub ? `${sub}\\${fileName}` : fileName;
      } else {
        relPath = fileName;
      }

      await invoke("create_file", { relativePath: relPath });
      const tree = await loadWorkspace();

      // Compute expected target path and auto-open
      const cleanFileName = fileName.toLowerCase().endsWith(".md")
        ? fileName
        : `${fileName}.md`;
      const expectedPath = `${folderPath.replace(/[\\/]+$/, "")}\\${cleanFileName}`;

      if (tree) {
        await handleFileSelect(expectedPath, cleanFileName);
      }
    },
    [rootNode, loadWorkspace, handleFileSelect],
  );

  // ── Create Folder ───────────────────────────────────────────
  const handleCreateFolder = useCallback(
    async (folderPath: string, folderName: string) => {
      const rootPath = rootNode?.path ?? "C:\\mdapp\\mddata";
      let relPath: string;

      if (folderPath.startsWith(rootPath)) {
        const sub = folderPath.slice(rootPath.length).replace(/^[\\/]+/, "");
        relPath = sub ? `${sub}\\${folderName}` : folderName;
      } else {
        relPath = folderName;
      }

      await invoke("create_folder", { relativePath: relPath });
      await loadWorkspace();
    },
    [rootNode, loadWorkspace],
  );

  // ── Delete Entry ────────────────────────────────────────────
  const handleDeleteEntry = useCallback(
    async (path: string) => {
      // If deleted file is active, close it
      if (activeFile && (activeFile === path || activeFile.startsWith(path))) {
        setActiveFile(null);
        setActiveFileName("");
        setMarkdown("");
        setSaveStatus("idle");
      }

      await invoke("delete_entry", { path });
      await loadWorkspace();
    },
    [activeFile, loadWorkspace],
  );

  // ── Locate in Windows Explorer ───────────────────────────────
  const handleLocate = useCallback(async (path?: string | null) => {
    const target = path || activeFile;
    if (!target) return;
    try {
      await invoke("reveal_in_explorer", { filePath: target });
    } catch (err) {
      console.error("Failed to locate in explorer:", err);
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

  // ── Keyboard Shortcut: Ctrl+N for New File in Root ─────────
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "n") {
        e.preventDefault();
        const rootPath = rootNode?.path ?? "C:\\mdapp\\mddata";
        const noteName = prompt("Enter new note name:", "Untitled.md");
        if (noteName && noteName.trim()) {
          handleCreateFile(rootPath, noteName.trim());
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [rootNode, handleCreateFile]);

  // ── Auto-save (debounced 500ms) ─────────────────────────────
  const handleContentChange = useCallback(
    (newMarkdown: string) => {
      if (!activeFile) return;

      setMarkdown(newMarkdown);
      setSaveStatus("unsaved");

      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }

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
        rootNode={rootNode}
        activeFile={activeFile}
        onFileSelect={handleFileSelect}
        onRefresh={loadWorkspace}
        onCreateFile={handleCreateFile}
        onCreateFolder={handleCreateFolder}
        onDeleteEntry={handleDeleteEntry}
        onLocate={handleLocate}
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
                onClick={() => handleLocate(activeFile)}
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
                {pathCopied ? (
                  <Check size={12} style={{ color: "var(--success)" }} />
                ) : (
                  <Copy size={12} />
                )}
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
              Select a note from <code>C:\mdapp\mddata</code> in the sidebar, or create a new note.
            </p>

            <div className="empty-state-buttons">
              <button
                className="primary-action-btn empty-btn"
                onClick={() => {
                  const rootPath = rootNode?.path ?? "C:\\mdapp\\mddata";
                  const name = prompt("Note name:", "NewNote.md");
                  if (name) handleCreateFile(rootPath, name);
                }}
              >
                <Plus size={16} />
                <span>Create New Note</span>
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
