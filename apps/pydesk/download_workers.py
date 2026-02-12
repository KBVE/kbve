#!/usr/bin/env python3
"""
Download worker files from kbve.com and save them locally.
Run this script to fetch the latest worker files.
"""

import httpx
import asyncio
import os

WORKER_URLS = {
    'canvas-worker.js': 'https://kbve.com/assets/canvas-worker.js',
    'db-worker.js': 'https://kbve.com/assets/db-worker.js',
    'ws-worker.js': 'https://kbve.com/assets/ws-worker.js',
}


async def download_worker(client: httpx.AsyncClient, filename: str, url: str):
    """Download a single worker file."""
    try:
        print(f"Downloading {filename} from {url}...")
        response = await client.get(url)
        response.raise_for_status()

        # Ensure assets directory exists
        os.makedirs('assets', exist_ok=True)

        # Write the file
        with open(f'assets/{filename}', 'w', encoding='utf-8') as f:
            f.write(response.text)

        print(f"Successfully downloaded {filename}")

    except Exception as e:
        print(f"Failed to download {filename}: {e}")


async def download_all_workers():
    """Download all worker files concurrently."""
    print("Downloading KBVE worker files...")

    async with httpx.AsyncClient() as client:
        tasks = [
            download_worker(client, filename, url)
            for filename, url in WORKER_URLS.items()
        ]
        await asyncio.gather(*tasks)

    print("\nDownload complete! Worker files are now available in ./assets/")


if __name__ == "__main__":
    asyncio.run(download_all_workers())
