use serde::Serialize;
use std::fs;
use std::path::Path;

/// Represents a file or directory entry in the sidebar tree.
#[derive(Debug, Serialize, Clone)]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub children: Vec<FileEntry>,
}

/// Recursively scans `root_dir` for `.md` files and returns a tree of FileEntry nodes.
/// Uses walkdir for fast recursive directory traversal.
/// Only includes directories that (transitively) contain at least one `.md` file.
#[tauri::command]
fn list_markdown_files(root_dir: String) -> Result<Vec<FileEntry>, String> {
    let root = Path::new(&root_dir);
    if !root.is_dir() {
        return Err(format!("'{}' is not a valid directory", root_dir));
    }
    build_tree(root).map_err(|e| e.to_string())
}

/// Build a tree of FileEntry nodes from a directory, filtering to only .md files.
fn build_tree(dir: &Path) -> Result<Vec<FileEntry>, std::io::Error> {
    let mut entries: Vec<FileEntry> = Vec::new();

    let mut dir_entries: Vec<fs::DirEntry> = fs::read_dir(dir)?
        .filter_map(|e| e.ok())
        .collect();

    // Sort entries: directories first, then alphabetically
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

        // Skip hidden files/directories
        if name.starts_with('.') {
            continue;
        }

        if path.is_dir() {
            let children = build_tree(&path)?;
            // Only include directories that contain at least one .md file (transitively)
            if !children.is_empty() {
                entries.push(FileEntry {
                    name,
                    path: path.to_string_lossy().into_owned(),
                    is_dir: true,
                    children,
                });
            }
        } else if path.extension().and_then(|ext| ext.to_str()) == Some("md") {
            entries.push(FileEntry {
                name,
                path: path.to_string_lossy().into_owned(),
                is_dir: false,
                children: vec![],
            });
        }
    }

    Ok(entries)
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

/// Creates a new markdown file in the specified directory.
#[tauri::command]
fn create_markdown_file(parent_dir: String, file_name: String) -> Result<String, String> {
    let parent = Path::new(&parent_dir);
    if !parent.is_dir() {
        return Err(format!("'{}' is not a valid directory", parent_dir));
    }

    let mut clean_name = file_name.trim().to_string();
    if clean_name.is_empty() {
        clean_name = "Untitled.md".to_string();
    } else if !clean_name.to_lowercase().ends_with(".md") {
        clean_name.push_str(".md");
    }

    // Sanitize filename to disallow path traversal and invalid characters
    if clean_name.contains('/') || clean_name.contains('\\') || clean_name.contains(':') {
        return Err("Filename cannot contain path separators or colons".to_string());
    }

    let target_path = parent.join(&clean_name);
    if target_path.exists() {
        return Err(format!("File '{}' already exists", clean_name));
    }

    // Default template with title
    let title = clean_name.trim_end_matches(".md");
    let initial_content = format!("# {}\n\n", title);

    fs::write(&target_path, initial_content)
        .map_err(|e| format!("Failed to create file: {}", e))?;

    Ok(target_path.to_string_lossy().into_owned())
}

/// Opens Windows Explorer and selects/highlights the specified file.
#[tauri::command]
fn reveal_in_explorer(file_path: String) -> Result<(), String> {
    let path = Path::new(&file_path);
    if !path.exists() {
        return Err(format!("Path '{}' does not exist", file_path));
    }

    #[cfg(target_os = "windows")]
    {
        use std::process::Command;
        Command::new("explorer")
            .arg(format!("/select,{}", path.display()))
            .spawn()
            .map_err(|e| format!("Failed to open Explorer: {}", e))?;
    }

    #[cfg(not(target_os = "windows"))]
    {
        // Fallback for macOS / Linux
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
        .invoke_handler(tauri::generate_handler![
            list_markdown_files,
            read_markdown_file,
            save_markdown_file,
            create_markdown_file,
            reveal_in_explorer
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
