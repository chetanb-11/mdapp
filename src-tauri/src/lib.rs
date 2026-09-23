use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

pub const WORKSPACE_DIR: &str = r"C:\mdapp\mddata";

/// Represents a file or directory node in the hierarchical tree.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FileNode {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub children: Vec<FileNode>,
}

/// Ensures the dedicated workspace directory `C:\mdapp\mddata` exists.
/// If newly created, pre-populates starter directories: DSA, Core_CS, Projects.
fn ensure_workspace_initialized() -> Result<(), std::io::Error> {
    let root = Path::new(WORKSPACE_DIR);
    let just_created = !root.exists();

    if just_created {
        fs::create_dir_all(root)?;

        // Pre-populate default starter directories
        let dsa = root.join("DSA");
        let core_cs = root.join("Core_CS");
        let projects = root.join("Projects");

        fs::create_dir_all(&dsa)?;
        fs::create_dir_all(&core_cs)?;
        fs::create_dir_all(&projects)?;

        // Starter notes
        let _ = fs::write(
            root.join("Welcome.md"),
            "# Welcome to Markdown Notes\n\nYour notes are stored in `C:\\mdapp\\mddata`.\n\n### Features\n- **Slash Commands**: Type `/` to insert headings, code blocks, tables, and lists.\n- **Syntax Highlighting**: Shiki-powered highlighting for C++, Java, Python, JavaScript, SQL.\n- **Full Hierarchy**: Create files and subfolders across DSA, Core_CS, Projects, or custom folders.\n- **Auto-Save**: Everything saves immediately to your local disk.\n",
        );
        let _ = fs::write(
            dsa.join("Binary_Search.md"),
            "# Binary Search\n\n```cpp\nint binarySearch(vector<int>& nums, int target) {\n    int left = 0, right = nums.size() - 1;\n    while (left <= right) {\n        int mid = left + (right - left) / 2;\n        if (nums[mid] == target) return mid;\n        if (nums[mid] < target) left = mid + 1;\n        else right = mid - 1;\n    }\n    return -1;\n}\n```\n",
        );
        let _ = fs::write(
            core_cs.join("OS_Concepts.md"),
            "# Operating Systems Concepts\n\n## Process vs Thread\n- **Process**: An instance of a program in execution with its own memory space.\n- **Thread**: A lightweight execution unit within a process sharing memory.\n",
        );
        let _ = fs::write(
            projects.join("Project_Ideas.md"),
            "# Project Ideas\n\n1. High-performance Markdown reader with Tauri v2\n2. Real-time collaborative editor\n3. Local vector-search for personal knowledge base\n",
        );
    } else {
        // Ensure default folders exist even if root already existed
        let _ = fs::create_dir_all(root.join("DSA"));
        let _ = fs::create_dir_all(root.join("Core_CS"));
        let _ = fs::create_dir_all(root.join("Projects"));
    }

    Ok(())
}

/// Helper to safely resolve a path inside the workspace.
fn resolve_workspace_path(path_str: &str) -> Result<PathBuf, String> {
    let root = Path::new(WORKSPACE_DIR);
    let p = Path::new(path_str);
    let resolved = if p.is_absolute() {
        p.to_path_buf()
    } else {
        let clean = path_str.trim_start_matches(['\\', '/']);
        root.join(clean)
    };
    Ok(resolved)
}

/// Recursively builds children nodes from a directory.
fn build_node_children(dir: &Path) -> Result<Vec<FileNode>, std::io::Error> {
    let mut nodes: Vec<FileNode> = Vec::new();
    let mut dir_entries: Vec<fs::DirEntry> = fs::read_dir(dir)?
        .filter_map(|e| e.ok())
        .collect();

    // Sort: directories first (alphabetically), then files (alphabetically)
    dir_entries.sort_by(|a, b| {
        let a_is_dir = a.file_type().map(|ft| ft.is_dir()).unwrap_or(false);
        let b_is_dir = b.file_type().map(|ft| ft.is_dir()).unwrap_or(false);
        match (a_is_dir, b_is_dir) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => a.file_name().cmp(&b.file_name()),
        }
    });

    for entry in dir_entries {
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().into_owned();

        if name.starts_with('.') {
            continue;
        }

        if path.is_dir() {
            let children = build_node_children(&path)?;
            nodes.push(FileNode {
                name,
                path: path.to_string_lossy().into_owned(),
                is_dir: true,
                children,
            });
        } else if path
            .extension()
            .and_then(|ext| ext.to_str())
            .map(|ext| ext.eq_ignore_ascii_case("md"))
            .unwrap_or(false)
        {
            nodes.push(FileNode {
                name,
                path: path.to_string_lossy().into_owned(),
                is_dir: false,
                children: vec![],
            });
        }
    }

    Ok(nodes)
}

/// Returns the entire hierarchical tree starting from `C:\mdapp\mddata`.
#[tauri::command]
fn get_file_tree() -> Result<FileNode, String> {
    ensure_workspace_initialized().map_err(|e| format!("Failed to initialize workspace: {}", e))?;
    let root = Path::new(WORKSPACE_DIR);
    let children = build_node_children(root).map_err(|e| e.to_string())?;

    Ok(FileNode {
        name: "mddata".to_string(),
        path: WORKSPACE_DIR.to_string(),
        is_dir: true,
        children,
    })
}

/// Creates a new `.md` file at the specified relative or absolute path within the workspace.
#[tauri::command]
fn create_file(relative_path: String) -> Result<(), String> {
    ensure_workspace_initialized().map_err(|e| e.to_string())?;
    let mut target = resolve_workspace_path(&relative_path)?;

    // Ensure it ends in .md
    let has_md_ext = target
        .extension()
        .and_then(|s| s.to_str())
        .map(|s| s.eq_ignore_ascii_case("md"))
        .unwrap_or(false);
    if !has_md_ext {
        let mut os_string = target.into_os_string();
        os_string.push(".md");
        target = PathBuf::from(os_string);
    }

    if target.exists() {
        return Err(format!("File already exists: {}", target.display()));
    }

    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create parent directory: {}", e))?;
    }

    let title = target
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("Untitled");
    fs::write(&target, format!("# {}\n\n", title))
        .map_err(|e| format!("Failed to write file: {}", e))?;

    Ok(())
}

/// Creates a new directory at the specified relative or absolute path within the workspace.
#[tauri::command]
fn create_folder(relative_path: String) -> Result<(), String> {
    ensure_workspace_initialized().map_err(|e| e.to_string())?;
    let target = resolve_workspace_path(&relative_path)?;
    fs::create_dir_all(&target).map_err(|e| format!("Failed to create directory: {}", e))?;
    Ok(())
}

/// Deletes a file or directory within the workspace.
#[tauri::command]
fn delete_entry(path: String) -> Result<(), String> {
    let target = Path::new(&path);
    if !target.exists() {
        return Err(format!("Path '{}' does not exist", path));
    }

    let root = Path::new(WORKSPACE_DIR);
    if target == root {
        return Err("Cannot delete root workspace directory".to_string());
    }

    if target.is_dir() {
        fs::remove_dir_all(target).map_err(|e| format!("Failed to delete folder: {}", e))?;
    } else {
        fs::remove_file(target).map_err(|e| format!("Failed to delete file: {}", e))?;
    }

    Ok(())
}

/// Reads the contents of a markdown file and returns it as a UTF-8 string.
#[tauri::command]
fn read_markdown_file(file_path: String) -> Result<String, String> {
    std::fs::read_to_string(&file_path)
        .map_err(|e| format!("Failed to read '{}': {}", file_path, e))
}

/// Writes content to a markdown file, creating it if it doesn't exist.
#[tauri::command]
fn save_markdown_file(file_path: String, content: String) -> Result<(), String> {
    std::fs::write(&file_path, &content)
        .map_err(|e| format!("Failed to write '{}': {}", file_path, e))
}

/// Opens Windows Explorer and selects/highlights the specified file or folder.
#[tauri::command]
fn reveal_in_explorer(file_path: String) -> Result<(), String> {
    let path = Path::new(&file_path);
    if !path.exists() {
        return Err(format!("Path '{}' does not exist", file_path));
    }

    #[cfg(target_os = "windows")]
    {
        use std::process::Command;
        if path.is_dir() {
            Command::new("explorer")
                .arg(path.as_os_str())
                .spawn()
                .map_err(|e| format!("Failed to open Explorer: {}", e))?;
        } else {
            Command::new("explorer")
                .arg(format!("/select,{}", path.display()))
                .spawn()
                .map_err(|e| format!("Failed to open Explorer: {}", e))?;
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        #[cfg(target_os = "macos")]
        std::process::Command::new("open")
            .args(["-R", &file_path])
            .spawn()
            .map_err(|e| e.to_string())?;

        #[cfg(target_os = "linux")]
        if let Some(parent) = path.parent() {
            std::process::Command::new("xdg-open")
                .arg(parent)
                .spawn()
                .map_err(|e| e.to_string())?;
        }
    }

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|_app| {
            let _ = ensure_workspace_initialized();
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_file_tree,
            create_file,
            create_folder,
            delete_entry,
            read_markdown_file,
            save_markdown_file,
            reveal_in_explorer
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_workspace_initialization() {
        let res = ensure_workspace_initialized();
        assert!(res.is_ok());
        assert!(Path::new(WORKSPACE_DIR).exists());
        assert!(Path::new(WORKSPACE_DIR).join("DSA").exists());
        assert!(Path::new(WORKSPACE_DIR).join("Core_CS").exists());
        assert!(Path::new(WORKSPACE_DIR).join("Projects").exists());

        let tree = get_file_tree();
        assert!(tree.is_ok());
        let root = tree.unwrap();
        assert_eq!(root.name, "mddata");
        assert!(root.is_dir);
        assert!(root.children.iter().any(|c| c.name == "DSA"));
        assert!(root.children.iter().any(|c| c.name == "Core_CS"));
        assert!(root.children.iter().any(|c| c.name == "Projects"));
    }
}
