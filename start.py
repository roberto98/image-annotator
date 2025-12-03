# start.py
"""Application entry point. Run with: python start.py [--host HOST] [--port PORT] [--debug]"""
import argparse
from app.app import app


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
    
    args = parser.parse_args()
    
    print(f"Starting server at http://{args.host}:{args.port}")
    app.run(host=args.host, port=args.port, debug=args.debug)


if __name__ == "__main__":
    main()