# start.py
"""Application entry point. Run with: python start.py [--host HOST] [--port PORT] [--debug]"""
import argparse
from app.app import app
from app.file_utils import clean_project_structure


def main():
    """Parse CLI arguments and start the Flask server."""
    parser = argparse.ArgumentParser(
        description="Start the Image Annotation Tool server",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter
    )
    parser.add_argument(
        '--host', 
        default="localhost",
        help="Host address to bind the server"
    )
    parser.add_argument(
        '--port', 
        default=8000, 
        type=int,
        help="Port number for the server"
    )
    parser.add_argument(
        '--debug', 
        action='store_true', 
        help="Enable Flask debug mode with auto-reload"
    )
    parser.add_argument(
        '--skip-check',
        action='store_true',
        help="Skip the filename check on startup"
    )
    
    args = parser.parse_args()
    
    # Automatically clean file/folder names before starting
    if not args.skip_check:
        print("Checking file and folder names...")
        files_renamed, dirs_renamed = clean_project_structure(".")
        
        if files_renamed or dirs_renamed:
            print(f"\nCleaned {files_renamed} file(s) and {dirs_renamed} folder(s).\n")
        else:
            print("All file and folder names are OK.\n")
    
    print(f"Starting server at http://{args.host}:{args.port}")
    app.run(host=args.host, port=args.port, debug=args.debug)


if __name__ == "__main__":
    main()