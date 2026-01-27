# file-renamer.py
"""Standalone utility for cleaning project filenames and directory names.

Usage: python file-renamer.py [base_directory]
"""
from app.file_utils import clean_project_structure


if __name__ == "__main__":
    import sys

    base_dir = sys.argv[1] if len(sys.argv) > 1 else "."
    renamed_files, renamed_dirs = clean_project_structure(base_dir)

    print(f"\nSummary:")
    print(f"- {renamed_files} files renamed")
    print(f"- {renamed_dirs} directories renamed")
    print(f"- JSON files updated to reflect new file names")
    print("Finished cleaning project structure.")
