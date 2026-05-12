"""CLI entry point for Sauria Voice backend."""

import argparse
import os


def main() -> None:
    parser = argparse.ArgumentParser(description="Sauria Voice Backend")
    parser.add_argument("--host", default=os.getenv("API_HOST", "127.0.0.1"))
    parser.add_argument("--port", type=int, default=int(os.getenv("API_PORT", "8100")))
    args = parser.parse_args()

    import uvicorn
    uvicorn.run("sauria_voice.api:app", host=args.host, port=args.port)


if __name__ == "__main__":
    main()
