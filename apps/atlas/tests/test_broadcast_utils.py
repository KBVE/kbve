# test_broadcast_utility.py
# TODO: Finish the PyTest for BroadCast Utility.

import pytest
from kbve_atlas.api.utils import BroadcastUtility

@pytest.mark.asyncio
async def test_uri_fallback():
    # Define URIs where the first two are expected to fail
    uris = ["redis://fake:6379", "redis://alsofake:6379", "memory://"]
    broadcast_utility = BroadcastUtility(uris)

    await broadcast_utility.connect()
    assert broadcast_utility.connected, "BroadcastUtility should be connected."
    assert broadcast_utility.broadcast.url == "memory://", "Should fall back to memory:// URI."

    # Cleanup
    await broadcast_utility.disconnect()