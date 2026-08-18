"""Command-line entry point for the backend.

Usage:
    python cli.py auth     Run the Google OAuth flow once and save tokens
                            to config.json (see google_health.md).
    python cli.py sync     Pull new data from the Google Health API into
                            backend/data/health_data.json.
    python cli.py serve [host] [port]
                            Start the query API (and static frontend/, if
                            present) - default http://localhost:8000.
"""

import sys

from auth import authorize
from server import DEFAULT_HOST, DEFAULT_PORT, run as run_server
from sync import sync_all


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    command = sys.argv[1]
    if command == "auth":
        authorize()
    elif command == "sync":
        results = sync_all()
        for metric, count in results.items():
            print(f"{metric}: {count} data point(s)")
    elif command == "serve":
        host = sys.argv[2] if len(sys.argv) > 2 else DEFAULT_HOST
        port = int(sys.argv[3]) if len(sys.argv) > 3 else DEFAULT_PORT
        run_server(host, port)
    else:
        print(f"Unknown command: {command}\n")
        print(__doc__)
        sys.exit(1)


if __name__ == "__main__":
    main()
