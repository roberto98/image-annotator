# file_utils.py
"""File and directory name sanitization utilities.

Provides functions for cleaning filenames and project structure,
ensuring consistent naming across images, annotations, and generated files.
"""
import os
import re
import json
from typing import Any, Dict, Tuple


def clean_name(name: str) -> str:
    """Sanitize a filename to only alphanumeric characters, underscores, hyphens, and dots."""
    clean = re.sub(r'[^a-zA-Z0-9_.-]', '', name)
    if not clean:
        clean = "unnamed"
    return clean


def _update_string_reference(value: str, file_map: Dict[str, str], base_dir: str) -> Tuple[str, bool]:
    """Update a single string reference if it's a file path. Returns (value, changed)."""
    if '.' not in value:
        return value, False

    if '/' in value or '\\' in value:
        abs_path = os.path.abspath(os.path.join(base_dir, value))
        if abs_path in file_map:
            new_abs_path = file_map[abs_path]
            rel_new_path = os.path.relpath(new_abs_path, base_dir)
            return rel_new_path.replace('\\', '/'), True
    else:
        # Only update bare filenames that are actually being renamed —
        # never clean arbitrary strings like timestamps or labels.
        old_basename = os.path.basename
        for old_path, new_path in file_map.items():
            if old_basename(old_path) == value:
                return old_basename(new_path), True

    return value, False


def _update_references(obj: Any, file_map: Dict[str, str], base_dir: str) -> bool:
    """Recursively update file references in a JSON structure. Returns True if changed."""
    updated = False

    if isinstance(obj, dict):
        for key, value in list(obj.items()):
            if isinstance(value, str):
                new_value, changed = _update_string_reference(value, file_map, base_dir)
                if changed:
                    obj[key] = new_value
                    updated = True
            elif isinstance(value, (dict, list)):
                if _update_references(value, file_map, base_dir):
                    updated = True

    elif isinstance(obj, list):
        for i, item in enumerate(obj):
            if isinstance(item, str):
                new_value, changed = _update_string_reference(item, file_map, base_dir)
                if changed:
                    obj[i] = new_value
                    updated = True
            elif isinstance(item, (dict, list)):
                if _update_references(item, file_map, base_dir):
                    updated = True

    return updated


def _resolve_name_conflict(parent_dir: str, new_name: str, is_file: bool) -> str:
    """Resolve naming conflicts by appending a counter suffix."""
    if is_file:
        base, ext = os.path.splitext(new_name)
        counter = 1
        while os.path.exists(os.path.join(parent_dir, f"{base}_{counter}{ext}")):
            counter += 1
        return f"{base}_{counter}{ext}"
    else:
        new_path = os.path.join(parent_dir, new_name)
        counter = 1
        while os.path.exists(f"{new_path}_{counter}"):
            counter += 1
        return f"{new_name}_{counter}"


def clean_project_structure(base_dir: str = ".", verbose: bool = True) -> Tuple[int, int]:
    """Clean filenames and directory names in the project structure.

    Automatically sanitizes filenames and directory names in images, annotations,
    and generated landmark directories. Also updates JSON files to reflect the
    new image names.

    Args:
        base_dir: Base directory where all folders are located
        verbose: Whether to print progress messages

    Returns:
        Tuple of (files_renamed, dirs_renamed) counts
    """
    dir_name_map: Dict[str, str] = {}
    file_name_map: Dict[str, str] = {}
    base_dir = os.path.abspath(base_dir)

    dirs_to_process = [
        os.path.join(base_dir, "images"),
        os.path.join(base_dir, "annotations"),
        os.path.join(base_dir, "__images_with_landmarks")
    ]

    # First pass: Create mappings for all files and directories
    for dir_path in dirs_to_process:
        if not os.path.exists(dir_path):
            continue

        for root, dirs, files in os.walk(dir_path, topdown=False):
            # Map files
            for file in files:
                old_path = os.path.join(root, file)
                new_name = clean_name(file)

                if file != new_name:
                    parent_dir = os.path.dirname(old_path)
                    new_path = os.path.join(parent_dir, new_name)

                    if os.path.exists(new_path) and old_path != new_path:
                        new_name = _resolve_name_conflict(parent_dir, new_name, is_file=True)
                        new_path = os.path.join(parent_dir, new_name)

                    file_name_map[old_path] = new_path

            # Map directories
            for dir_name in dirs:
                old_path = os.path.join(root, dir_name)
                new_name = clean_name(dir_name)

                if dir_name != new_name:
                    parent_dir = os.path.dirname(old_path)
                    new_path = os.path.join(parent_dir, new_name)

                    if os.path.exists(new_path) and old_path != new_path:
                        new_name = _resolve_name_conflict(parent_dir, new_name, is_file=False)
                        new_path = os.path.join(parent_dir, new_name)

                    dir_name_map[old_path] = new_path

    if not file_name_map and not dir_name_map:
        return 0, 0

    # Second pass: Update JSON files to reflect the new image names
    for dir_path in dirs_to_process:
        if not os.path.exists(dir_path):
            continue
        for root, _, files in os.walk(dir_path):
            for file in files:
                if file.lower().endswith('.json'):
                    try:
                        json_path = os.path.join(root, file)
                        with open(json_path, 'r', encoding='utf-8') as f:
                            data = json.load(f)
                        if _update_references(data, file_name_map, base_dir):
                            with open(json_path, 'w', encoding='utf-8') as f:
                                json.dump(data, f, indent=2)
                            if verbose:
                                print(f"  Updated JSON: {os.path.relpath(json_path, base_dir)}")
                    except Exception as e:
                        if verbose:
                            print(f"  Warning: Could not update JSON {file}: {e}")

    # Third pass: Rename files
    renamed_files = 0
    for old_path, new_path in file_name_map.items():
        try:
            if os.path.exists(old_path):
                os.rename(old_path, new_path)
                renamed_files += 1
                if verbose:
                    print(f"  Renamed: {os.path.basename(old_path)} -> {os.path.basename(new_path)}")
        except Exception as e:
            if verbose:
                print(f"  Error renaming {old_path}: {e}")

    # Fourth pass: Rename directories (deepest first)
    dirs_to_rename = sorted(dir_name_map.items(), key=lambda x: x[0].count(os.sep), reverse=True)
    renamed_dirs = 0
    for old_path, new_path in dirs_to_rename:
        try:
            if os.path.exists(old_path):
                os.rename(old_path, new_path)
                renamed_dirs += 1
                if verbose:
                    print(f"  Renamed dir: {os.path.basename(old_path)} -> {os.path.basename(new_path)}")

                # Update paths in mappings for subsequent renames
                prefix_len = len(old_path)
                for k, v in list(file_name_map.items()):
                    if k.startswith(old_path + os.sep):
                        suffix = k[prefix_len:]
                        new_key = new_path + suffix
                        file_name_map[new_key] = file_name_map.pop(k)
                for k, v in list(dir_name_map.items()):
                    if k.startswith(old_path + os.sep):
                        suffix = k[prefix_len:]
                        new_key = new_path + suffix
                        dir_name_map[new_key] = dir_name_map.pop(k)
        except Exception as e:
            if verbose:
                print(f"  Error renaming directory {old_path}: {e}")

    return renamed_files, renamed_dirs
