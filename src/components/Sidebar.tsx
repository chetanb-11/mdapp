import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import {
  ChevronRight,
  FileText,
  FolderOpen,
  FolderClosed,
  PenLine,
  RefreshCw,
  Plus,
  Search,
  X,
  ExternalLink,
  Check,
} from "lucide-react";
import type { FileEntry } from "../App";

// ── Props ───────────────────────────────────────────────────────
interface SidebarProps {
  fileTree: FileEntry[];
  activeFile: string | null;
  rootDir: string | null;
  onOpenFolder: () => void;
  onFileSelect: (filePath: string, fileName: string) => void;
  onRefresh: () => void;
  onCreateFile: (fileName?: string) => Promise<void>;
  onLocateFile: (filePath: string) => void;
}

// ── Filter Tree Helper ──────────────────────────────────────────
function filterTree(entries: FileEntry[], query: string): FileEntry[] {
  if (!query.trim()) return entries;
  const q = query.toLowerCase();

  return entries.reduce<FileEntry[]>((acc, entry) => {
    if (entry.is_dir) {
      const filteredChildren = filterTree(entry.children, query);
      if (filteredChildren.length > 0 || entry.name.toLowerCase().includes(q)) {
        acc.push({
          ...entry,
          children: filteredChildren,
        });
      }
    } else if (entry.name.toLowerCase().includes(q)) {
      acc.push(entry);
    }
    return acc;
  }, []);
}

// ── TreeItem ────────────────────────────────────────────────────
interface TreeItemProps {
  entry: FileEntry;
  depth: number;
  activeFile: string | null;
  onFileSelect: (filePath: string, fileName: string) => void;
  onLocateFile: (filePath: string) => void;
}

function TreeItem({
  entry,
  depth,
  activeFile,
  onFileSelect,
  onLocateFile,
}: TreeItemProps) {
  const [expanded, setExpanded] = useState(depth < 1); // Auto-expand first level

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (entry.is_dir) {
      setExpanded((prev) => !prev);
    } else {
      onFileSelect(entry.path, entry.name);
    }
  };

  const handleLocate = (e: React.MouseEvent) => {
    e.stopPropagation();
    onLocateFile(entry.path);
  };

  const isActive = !entry.is_dir && entry.path === activeFile;

  return (
    <>
      <div
        className={`tree-item${isActive ? " active" : ""}`}
        style={{ "--depth": depth } as React.CSSProperties}
        onClick={handleClick}
        title={entry.path}
      >
        {/* Chevron or file icon */}
        {entry.is_dir ? (
          <span className={`tree-item-icon chevron${expanded ? " expanded" : ""}`}>
            <ChevronRight size={14} />
          </span>
        ) : (
          <span className="tree-item-icon">
            <FileText size={14} />
          </span>
        )}

        {/* Folder icon (for dirs) */}
        {entry.is_dir && (
          <span className="tree-item-icon" style={{ color: "var(--accent)" }}>
            {expanded ? <FolderOpen size={14} /> : <FolderClosed size={14} />}
          </span>
        )}

        <span className="tree-item-name">{entry.name}</span>

        {/* Locate action button on hover for files */}
        {!entry.is_dir && (
          <button
            className="tree-item-action-btn"
            onClick={handleLocate}
            title="Locate in Windows Explorer"
          >
            <ExternalLink size={12} />
          </button>
        )}
      </div>

      {/* Children (recursive) */}
      {entry.is_dir && expanded && (
        <div className="tree-children">
          {entry.children.map((child) => (
            <TreeItem
              key={child.path}
              entry={child}
              depth={depth + 1}
              activeFile={activeFile}
              onFileSelect={onFileSelect}
              onLocateFile={onLocateFile}
            />
          ))}
        </div>
      )}
    </>
  );
}

// ── Sidebar ─────────────────────────────────────────────────────
export default function Sidebar({
  fileTree,
  activeFile,
  rootDir,
  onOpenFolder,
  onFileSelect,
  onRefresh,
  onCreateFile,
  onLocateFile,
}: SidebarProps) {
  const sidebarRef = useRef<HTMLDivElement>(null);
  const [isResizing, setIsResizing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [newFileName, setNewFileName] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when creation starts
  useEffect(() => {
    if (isCreating) {
      setNewFileName("");
      setCreateError(null);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isCreating]);

  // Handle clicking the New Note button
  const handleNewNoteClick = () => {
    if (!rootDir) {
      // If no folder open, let the parent trigger save dialog
      onCreateFile();
    } else {
      setIsCreating(true);
    }
  };

  // Submit new file
  const handleCreateSubmit = async () => {
    const trimmed = newFileName.trim();
    if (!trimmed) {
      setIsCreating(false);
      return;
    }
    try {
      setCreateError(null);
      await onCreateFile(trimmed);
      setIsCreating(false);
      setNewFileName("");
    } catch (err: unknown) {
      setCreateError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleCreateSubmit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      setIsCreating(false);
      setCreateError(null);
    }
  };

  // ── Resize logic ────────────────────────────────────────────
  const startResize = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setIsResizing(true);

      const startX = e.clientX;
      const sidebar = sidebarRef.current;
      if (!sidebar) return;
      const startWidth = sidebar.offsetWidth;

      const onMouseMove = (moveEvent: MouseEvent) => {
        const diff = moveEvent.clientX - startX;
        const newWidth = Math.min(Math.max(startWidth + diff, 220), 420);
        sidebar.style.width = `${newWidth}px`;
      };

      const onMouseUp = () => {
        setIsResizing(false);
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
      };

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    },
    [],
  );

  // Extract folder name from root path
  const folderName = rootDir
    ? rootDir.split(/[\\/]/).filter(Boolean).pop() ?? rootDir
    : null;

  // Filtered files
  const filteredTree = useMemo(() => {
    return filterTree(fileTree, searchQuery);
  }, [fileTree, searchQuery]);

  return (
    <div className="sidebar" ref={sidebarRef}>
      <div className="sidebar-header">
        <div className="sidebar-title-row">
          <h1 title={rootDir ?? undefined}>
            <PenLine size={16} />
            <span>{folderName ?? "Markdown Editor"}</span>
          </h1>
          {rootDir && (
            <button
              className="icon-action-btn"
              onClick={onRefresh}
              title="Refresh notes (re-scan disk)"
            >
              <RefreshCw size={13} />
            </button>
          )}
        </div>

        {/* Action Buttons: New Note & Open Folder */}
        <div className="sidebar-actions-row">
          <button
            className="primary-action-btn"
            onClick={handleNewNoteClick}
            title={rootDir ? "Create new note (Ctrl+N)" : "Create new note"}
          >
            <Plus size={14} />
            <span>New Note</span>
          </button>
          <button
            className="secondary-action-btn"
            onClick={onOpenFolder}
            title="Open folder to browse notes"
          >
            <FolderOpen size={14} />
            <span>Open Folder</span>
          </button>
        </div>

        {/* Search / Locate bar */}
        {fileTree.length > 0 && (
          <div className="sidebar-search-box">
            <Search size={13} className="search-icon" />
            <input
              type="text"
              placeholder="Locate / filter notes…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="search-input"
            />
            {searchQuery && (
              <button
                className="search-clear-btn"
                onClick={() => setSearchQuery("")}
                title="Clear search"
              >
                <X size={12} />
              </button>
            )}
          </div>
        )}
      </div>

      <div className="sidebar-tree">
        {/* Inline file creation input */}
        {isCreating && (
          <div className="inline-create-box">
            <div className="inline-create-row">
              <FileText size={14} className="create-icon" />
              <input
                ref={inputRef}
                type="text"
                className="inline-create-input"
                placeholder="Note title (e.g. Ideas.md)"
                value={newFileName}
                onChange={(e) => setNewFileName(e.target.value)}
                onKeyDown={handleKeyDown}
              />
              <button
                className="inline-confirm-btn"
                onClick={handleCreateSubmit}
                title="Create file (Enter)"
              >
                <Check size={13} />
              </button>
              <button
                className="inline-cancel-btn"
                onClick={() => setIsCreating(false)}
                title="Cancel (Esc)"
              >
                <X size={13} />
              </button>
            </div>
            {createError && <div className="inline-create-error">{createError}</div>}
          </div>
        )}

        {filteredTree.length > 0 ? (
          filteredTree.map((entry) => (
            <TreeItem
              key={entry.path}
              entry={entry}
              depth={0}
              activeFile={activeFile}
              onFileSelect={onFileSelect}
              onLocateFile={onLocateFile}
            />
          ))
        ) : (
          <div className="tree-empty">
            <FolderOpen size={30} />
            <span>
              {searchQuery
                ? `No notes match "${searchQuery}"`
                : rootDir
                ? "No .md notes found. Click \"New Note\" to create one!"
                : "Open a folder or create a new note to start"}
            </span>
          </div>
        )}
      </div>

      {/* Resize handle */}
      <div
        className={`sidebar-resize${isResizing ? " dragging" : ""}`}
        onMouseDown={startResize}
      />
    </div>
  );
}
