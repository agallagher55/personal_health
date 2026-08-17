"""Command-line entry point for the backend.

Usage:
    python cli.py auth     Run the Google OAuth flow once and save tokens
                            to config.json (see google_health.md).
"""

import sys

from auth import authorize


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    command = sys.argv[1]
    if command == "auth":
        authorize()
    else:
        print(f"Unknown command: {command}\n")
        print(__doc__)
        sys.exit(1)


if __name__ == "__main__":
    main()
