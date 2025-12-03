import os
import re
import json
import shutil
from pathlib import Path

def clean_name(name):
    """Remove special characters and spaces from a filename or directory name."""
    # Remove special characters and spaces
    clean = re.sub(r'[^a-zA-Z0-9_.-]', '', name)
    # Handle empty names
    if not clean:
        clean = "unnamed"
    return clean

def clean_project_structure(base_dir="."):
    """
    Cleans filenames and directory names in a project structure that includes:
    - images directory with image files
    - annotations directory with patient subdirectories containing JSON files
    - __images_with_landmarks directory with patient subdirectories
    
    Also updates JSON files to reflect the new image names.
    
    Args:
        base_dir (str): Base directory where all these folders are located
    """
    # Create name mapping dictionaries to keep track of renames
    dir_name_map = {}  # old_path -> new_path
    file_name_map = {}  # old_path -> new_path
    
    # Ensure paths are absolute for consistency
    base_dir = os.path.abspath(base_dir)
    
    # Process directories to clean
    dirs_to_process = [
        os.path.join(base_dir, "images"),
        os.path.join(base_dir, "annotations"), 
        os.path.join(base_dir, "__images_with_landmarks")
    ]
    
    # First pass: Create mappings for all files and directories
    for dir_path in dirs_to_process:
        if not os.path.exists(dir_path):
            print(f"Warning: Directory '{dir_path}' does not exist. Skipping.")
            continue
            
        # Process all directories and files, starting from the deepest
        for root, dirs, files in os.walk(dir_path, topdown=False):
            # Map files first
            for file in files:
                old_path = os.path.join(root, file)
                new_name = clean_name(file)
                
                # If name changes
                if file != new_name:
                    parent_dir = os.path.dirname(old_path)
                    new_path = os.path.join(parent_dir, new_name)
                    
                    # Handle name conflicts
                    if os.path.exists(new_path) and old_path != new_path:
                        base, ext = os.path.splitext(new_name)
                        counter = 1
                        while os.path.exists(os.path.join(parent_dir, f"{base}_{counter}{ext}")):
                            counter += 1
                        new_path = os.path.join(parent_dir, f"{base}_{counter}{ext}")
                    
                    # Store in mapping
                    file_name_map[old_path] = new_path
            
            # Then map directories
            for dir_name in dirs:
                old_path = os.path.join(root, dir_name)
                new_name = clean_name(dir_name)
                
                # If name changes
                if dir_name != new_name:
                    parent_dir = os.path.dirname(old_path)
                    new_path = os.path.join(parent_dir, new_name)
                    
                    # Handle name conflicts
                    if os.path.exists(new_path) and old_path != new_path:
                        counter = 1
                        while os.path.exists(f"{new_path}_{counter}"):
                            counter += 1
                        new_path = f"{new_path}_{counter}"
                    
                    # Store in mapping
                    dir_name_map[old_path] = new_path
    
    # Second pass: Update JSON files to reflect the new image names
    # We need to do this before renaming any files
    for dir_path in dirs_to_process:
        if not os.path.exists(dir_path):
            continue
            
        for root, _, files in os.walk(dir_path):
            for file in files:
                if file.lower().endswith('.json'):
                    try:
                        json_path = os.path.join(root, file)
                        
                        # Read JSON file
                        with open(json_path, 'r', encoding='utf-8') as f:
                            data = json.load(f)
                        
                        # Check if the JSON has image references
                        updated = False
                        
                        # Look for image references in the JSON and update them
                        # This is a bit tricky without knowing the exact structure of the JSON
                        # Here's a simple recursive function to find and update image references
                        def update_references(obj, file_map):
                            nonlocal updated
                            
                            if isinstance(obj, dict):
                                for key, value in list(obj.items()):
                                    # Check if value is a string that might be a file path
                                    if isinstance(value, str) and ('.' in value) and ('/' in value or '\\' in value):
                                        # This could be a file path
                                        abs_path = os.path.abspath(os.path.join(base_dir, value))
                                        if abs_path in file_map:
                                            # Update the path to the new filename
                                            new_abs_path = file_map[abs_path]
                                            # Convert back to relative path if needed
                                            rel_new_path = os.path.relpath(new_abs_path, base_dir)
                                            obj[key] = rel_new_path.replace('\\', '/')  # Use forward slashes for consistency
                                            updated = True
                                    # If it's just a filename (without path) that might need updating
                                    elif isinstance(value, str) and ('.' in value) and (not '/' in value and not '\\' in value):
                                        clean_filename = clean_name(value)
                                        if value != clean_filename:
                                            obj[key] = clean_filename
                                            updated = True
                                    # Recurse for nested structures
                                    elif isinstance(value, (dict, list)):
                                        update_references(value, file_map)
                            
                            elif isinstance(obj, list):
                                for i, item in enumerate(obj):
                                    if isinstance(item, str) and ('.' in item) and ('/' in item or '\\' in item):
                                        # This could be a file path
                                        abs_path = os.path.abspath(os.path.join(base_dir, item))
                                        if abs_path in file_map:
                                            # Update the path to the new filename
                                            new_abs_path = file_map[abs_path]
                                            # Convert back to relative path if needed
                                            rel_new_path = os.path.relpath(new_abs_path, base_dir)
                                            obj[i] = rel_new_path.replace('\\', '/')  # Use forward slashes for consistency
                                            updated = True
                                    # If it's just a filename (without path) that might need updating
                                    elif isinstance(item, str) and ('.' in item) and (not '/' in item and not '\\' in item):
                                        clean_filename = clean_name(item)
                                        if item != clean_filename:
                                            obj[i] = clean_filename
                                            updated = True
                                    # Recurse for nested structures
                                    elif isinstance(item, (dict, list)):
                                        update_references(item, file_map)
                        
                        # Apply the update function to the JSON data
                        update_references(data, file_name_map)
                        
                        # Write updated JSON if changes were made
                        if updated:
                            with open(json_path, 'w', encoding='utf-8') as f:
                                json.dump(data, f, indent=2)
                            print(f"Updated references in JSON file: {json_path}")
                            
                    except Exception as e:
                        print(f"Error updating JSON file {os.path.join(root, file)}: {e}")
    
    # Third pass: Rename files
    renamed_files = 0
    for old_path, new_path in file_name_map.items():
        try:
            if os.path.exists(old_path):  # Make sure it hasn't been renamed by a parent directory rename
                os.rename(old_path, new_path)
                renamed_files += 1
                print(f"Renamed file: {old_path} -> {new_path}")
        except Exception as e:
            print(f"Error renaming file {old_path}: {e}")
    
    # Fourth pass: Rename directories from deepest to shallowest
    # Sort by path depth (deepest first)
    dirs_to_rename = sorted(dir_name_map.items(), key=lambda x: x[0].count(os.sep), reverse=True)
    
    renamed_dirs = 0
    for old_path, new_path in dirs_to_rename:
        try:
            if os.path.exists(old_path):  # Make sure it hasn't been renamed by a parent directory rename
                os.rename(old_path, new_path)
                renamed_dirs += 1
                print(f"Renamed directory: {old_path} -> {new_path}")
                
                # Update paths in our mappings for files and dirs that were in the renamed directory
                # This helps with subsequent renames
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
            print(f"Error renaming directory {old_path}: {e}")
    
    # Print summary
    print(f"\nSummary:")
    print(f"- {renamed_files} files renamed")
    print(f"- {renamed_dirs} directories renamed")
    print(f"- JSON files updated to reflect new file names")

if __name__ == "__main__":
    # Call the function with the base directory where your project is located
    clean_project_structure(".")
    print("Finished cleaning project structure.")
