import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import {
  ChevronRight,
  FileText,
  FolderOpen,
  FolderClosed,
  FolderPlus,
  FilePlus,
  RefreshCw,
  Search,
  X,
  ExternalLink,
  Check,
  Trash2,
  HardDrive,
} from "lucide-react";
import type { FileNode } from "../App";

// ── Props ───────────────────────────────────────────────────────
interface SidebarProps {
  rootNode: FileNode | null;
  activeFile: string | null;
  onFileSelect: (filePath: string, fileName: string) => void;
  onRefresh: () => void;
  onCreateFile: (folderPath: string, fileName: string) => Promise<void>;
  onCreateFolder: (folderPath: string, folderName: string) => Promise<void>;
  onDeleteEntry: (path: string, isDir: boolean, name: string) => Promise<void>;
  onLocate: (path: string) => void;
}

// ── Filter Tree Helper ──────────────────────────────────────────
function filterNodes(nodes: FileNode[], query: string): FileNode[] {
  if (!query.trim()) return nodes;
  const q = query.toLowerCase();

  return nodes.reduce<FileNode[]>((acc, node) => {
    if (node.is_dir) {
      const filteredChildren = filterNodes(node.children, query);
      if (filteredChildren.length > 0 || node.name.toLowerCase().includes(q)) {
        acc.push({
          ...node,
          children: filteredChildren,
        });
      }
    } else if (node.name.toLowerCase().includes(q)) {
      acc.push(node);
    }
    return acc;
  }, []);
}

// ── Creation State Type ─────────────────────────────────────────
interface CreatingState {
  targetFolderPath: string;
  type: "file" | "folder";
}

// ── TreeItem Component ──────────────────────────────────────────
interface TreeItemProps {
  node: FileNode;
  depth: number;
  activeFile: string | null;
  creatingState: CreatingState | null;
  onFileSelect: (filePath: string, fileName: string) => void;
  onStartCreate: (folderPath: string, type: "file" | "folder") => void;
  onCancelCreate: () => void;
  onSubmitCreate: (name: string) => void;
  onDeleteEntry: (path: string, isDir: boolean, name: string) => void;
  onLocate: (path: string) => void;
}

function TreeItem({
  node,
  depth,
  activeFile,
  creatingState,
  onFileSelect,
  onStartCreate,
  onCancelCreate,
  onSubmitCreate,
  onDeleteEntry,
  onLocate,
}: TreeItemProps) {
  // Auto-expand first 2 levels
  const [expanded, setExpanded] = useState(depth < 2);

  // If creation started in this folder, auto-expand
  useEffect(() => {
    if (creatingState && creatingState.targetFolderPath === node.path) {
      setExpanded(true);
    }
  }, [creatingState, node.path]);

  const handleRowClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (node.is_dir) {
      setExpanded((prev) => !prev);
    } else {
      onFileSelect(node.path, node.name);
    }
  };

  const isActive = !node.is_dir && node.path === activeFile;
  const isCreatingHere = creatingState && creatingState.targetFolderPath === node.path;

  return (
    <>
      <div
        className={`tree-item${isActive ? " active" : ""}${node.is_dir ? " is-dir" : ""}`}
        style={{ "--depth": depth } as React.CSSProperties}
        onClick={handleRowClick}
        title={node.path}
      >
        {/* Chevron or file icon */}
        {node.is_dir ? (
          <span
            className={`tree-item-icon chevron${expanded ? " expanded" : ""}`}
            onClick={(e) => {
              e.stopPropagation();
              setExpanded((prev) => !prev);
            }}
          >
            <ChevronRight size={13} />
          </span>
        ) : (
          <span className="tree-item-icon file-icon">
            <FileText size={14} />
          </span>
        )}

        {/* Folder icon */}
        {node.is_dir && (
          <span className="tree-item-icon folder-icon">
            {expanded ? <FolderOpen size={14} /> : <FolderClosed size={14} />}
          </span>
        )}

        {/* Node Name */}
        <span className="tree-item-name">{node.name}</span>

        {/* Child count for directories */}
        {node.is_dir && (
          <span className="tree-item-count">{node.children.length}</span>
        )}

        {/* Action buttons (hover) */}
        <div className="tree-item-actions" onClick={(e) => e.stopPropagation()}>
          {node.is_dir ? (
            <>
              <button
                className="tree-action-btn"
                onClick={() => onStartCreate(node.path, "file")}
                title="New file in this folder"
              >
                <FilePlus size={12} />
              </button>
              <button
                className="tree-action-btn"
                onClick={() => onStartCreate(node.path, "folder")}
                title="New subfolder in this folder"
              >
                <FolderPlus size={12} />
              </button>
              <button
                className="tree-action-btn"
                onClick={() => onLocate(node.path)}
                title="Locate folder in Windows Explorer"
              >
                <ExternalLink size={12} />
              </button>
              <button
                className="tree-action-btn danger"
                onClick={() => onDeleteEntry(node.path, true, node.name)}
                title="Delete folder"
              >
                <Trash2 size={12} />
              </button>
            </>
          ) : (
            <>
              <button
                className="tree-action-btn"
                onClick={() => onLocate(node.path)}
                title="Locate file in Windows Explorer"
              >
                <ExternalLink size={12} />
              </button>
              <button
                className="tree-action-btn danger"
                onClick={() => onDeleteEntry(node.path, false, node.name)}
                title="Delete file"
              >
                <Trash2 size={12} />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Children container */}
      {node.is_dir && expanded && (
        <div className="tree-children">
          {/* Inline creation form inside this folder */}
          {isCreatingHere && (
            <InlineCreationInput
              depth={depth + 1}
              type={creatingState.type}
              onSubmit={onSubmitCreate}
              onCancel={onCancelCreate}
            />
          )}

          {node.children.map((child) => (
            <TreeItem
              key={child.path}
              node={child}
              depth={depth + 1}
              activeFile={activeFile}
              creatingState={creatingState}
              onFileSelect={onFileSelect}
              onStartCreate={onStartCreate}
              onCancelCreate={onCancelCreate}
              onSubmitCreate={onSubmitCreate}
              onDeleteEntry={onDeleteEntry}
              onLocate={onLocate}
            />
          ))}

          {node.children.length === 0 && !isCreatingHere && (
            <div
              className="tree-empty-folder"
              style={{ paddingLeft: `calc(16px + ${depth + 1} * 16px)` }}
            >
              Empty folder
            </div>
          )}
        </div>
      )}
    </>
  );
}

// ── Inline Creation Input Component ─────────────────────────────
interface InlineCreationInputProps {
  depth: number;
  type: "file" | "folder";
  onSubmit: (name: string) => void;
  onCancel: () => void;
}

function InlineCreationInput({
  depth,
  type,
  onSubmit,
  onCancel,
}: InlineCreationInputProps) {
  const [val, setVal] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (val.trim()) {
        onSubmit(val.trim());
      } else {
        onCancel();
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
    }
  };

  return (
    <div
      className="inline-create-row"
      style={{ paddingLeft: `calc(12px + ${depth} * 16px)` }}
    >
      <span className="create-type-icon">
        {type === "file" ? <FileText size={13} /> : <FolderClosed size={13} />}
      </span>
      <input
        ref={inputRef}
        type="text"
        className="inline-create-field"
        placeholder={type === "file" ? "Note name (e.g. Graphs.md)" : "Folder name"}
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={handleKeyDown}
      />
      <button
        className="inline-action-btn confirm"
        onClick={() => val.trim() && onSubmit(val.trim())}
        title="Create (Enter)"
      >
        <Check size={12} />
      </button>
      <button
        className="inline-action-btn cancel"
        onClick={onCancel}
        title="Cancel (Esc)"
      >
        <X size={12} />
      </button>
    </div>
  );
}

// ── Sidebar Main Component ──────────────────────────────────────
export default function Sidebar({
  rootNode,
  activeFile,
  onFileSelect,
  onRefresh,
  onCreateFile,
  onCreateFolder,
  onDeleteEntry,
  onLocate,
}: SidebarProps) {
  const sidebarRef = useRef<HTMLDivElement>(null);
  const [isResizing, setIsResizing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [creatingState, setCreatingState] = useState<CreatingState | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Resize logic
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
        const newWidth = Math.min(Math.max(startWidth + diff, 230), 450);
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

  // Filter children based on search query
  const filteredChildren = useMemo(() => {
    if (!rootNode) return [];
    return filterNodes(rootNode.children, searchQuery);
  }, [rootNode, searchQuery]);

  // Handle start creation
  const handleStartCreate = (folderPath: string, type: "file" | "folder") => {
    setErrorMsg(null);
    setCreatingState({ targetFolderPath: folderPath, type });
  };

  const handleCancelCreate = () => {
    setCreatingState(null);
    setErrorMsg(null);
  };

  const handleSubmitCreate = async (name: string) => {
    if (!creatingState || !rootNode) return;
    try {
      setErrorMsg(null);
      if (creatingState.type === "file") {
        await onCreateFile(creatingState.targetFolderPath, name);
      } else {
        await onCreateFolder(creatingState.targetFolderPath, name);
      }
      setCreatingState(null);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    }
  };

  // Safe delete with confirmation
  const handleDelete = (path: string, isDir: boolean, name: string) => {
    const typeLabel = isDir ? "folder and all its contents" : "file";
    if (window.confirm(`Are you sure you want to delete the ${typeLabel} "${name}"?`)) {
      onDeleteEntry(path, isDir, name);
    }
  };

  const rootPath = rootNode?.path ?? "C:\\mdapp\\mddata";

  return (
    <div className="sidebar" ref={sidebarRef}>
      {/* Sidebar Header */}
      <div className="sidebar-header">
        <div className="sidebar-workspace-info">
          <div className="workspace-icon-title">
            <div className="workspace-icon">
              <HardDrive size={15} />
            </div>
            <div className="workspace-text">
              <h1 title={rootPath}>mddata</h1>
              <span className="workspace-path" title={rootPath}>
                {rootPath}
              </span>
            </div>
          </div>
          <div className="workspace-header-actions">
            <button
              className="icon-action-btn"
              onClick={onRefresh}
              title="Refresh workspace tree"
            >
              <RefreshCw size={13} />
            </button>
            <button
              className="icon-action-btn"
              onClick={() => onLocate(rootPath)}
              title="Open mddata in Windows Explorer"
            >
              <ExternalLink size={13} />
            </button>
          </div>
        </div>

        {/* Quick Actions at Workspace Root */}
        <div className="sidebar-actions-row">
          <button
            className="primary-action-btn"
            onClick={() => handleStartCreate(rootPath, "file")}
            title="Create new note in root"
          >
            <FilePlus size={14} />
            <span>+ Note</span>
          </button>
          <button
            className="secondary-action-btn"
            onClick={() => handleStartCreate(rootPath, "folder")}
            title="Create new folder in root"
          >
            <FolderPlus size={14} />
            <span>+ Folder</span>
          </button>
        </div>

        {/* Search input */}
        <div className="sidebar-search-box">
          <Search size={13} className="search-icon" />
          <input
            type="text"
            placeholder="Search files & folders…"
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

        {errorMsg && <div className="sidebar-error-banner">{errorMsg}</div>}
      </div>

      {/* Hierarchical Tree */}
      <div className="sidebar-tree">
        {/* If creating in root directly */}
        {creatingState && creatingState.targetFolderPath === rootPath && (
          <InlineCreationInput
            depth={0}
            type={creatingState.type}
            onSubmit={handleSubmitCreate}
            onCancel={handleCancelCreate}
          />
        )}

        {filteredChildren.length > 0 ? (
          filteredChildren.map((node) => (
            <TreeItem
              key={node.path}
              node={node}
              depth={0}
              activeFile={activeFile}
              creatingState={creatingState}
              onFileSelect={onFileSelect}
              onStartCreate={handleStartCreate}
              onCancelCreate={handleCancelCreate}
              onSubmitCreate={handleSubmitCreate}
              onDeleteEntry={handleDelete}
              onLocate={onLocate}
            />
          ))
        ) : (
          <div className="tree-empty">
            <FolderOpen size={30} />
            <span>
              {searchQuery
                ? `No notes match "${searchQuery}"`
                : "No files yet. Click \"+ Note\" or \"+ Folder\" above to create one."}
            </span>
          </div>
        )}
      </div>

      {/* Resize Handle */}
      <div
        className={`sidebar-resize${isResizing ? " dragging" : ""}`}
        onMouseDown={startResize}
      />
    </div>
  );
}
