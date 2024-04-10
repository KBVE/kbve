import asyncio
from kbve_atlas.api.clients.poetry_db_client import PoetryDBClient

async def main():
    poetry_client = PoetryDBClient()
    try:
        random_poem = await poetry_client.get_random_poem()
        print(f"Title: {random_poem.title}\nAuthor: {random_poem.author}\n")
        print("\n".join(random_poem.lines))
    except Exception as e:
        print(f"An error occurred: {e}")

if __name__ == "__main__":
    asyncio.run(main())