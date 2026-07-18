import pytest

from kbve.nx.router import ROUTES, Route, route, select, get
from kbve.nx.builder import PlanResult, BuildResult


@pytest.fixture
def dummy_route():
    name = "dummy-test-route"
    saved = ROUTES.pop(name, None)

    @route(name, "daily")
    class DummyRoute:
        def plan(self, ctx):
            return PlanResult(name, True, "always", [])

        def build(self, ctx):
            return BuildResult(name, [], True, "noop")

    yield name
    ROUTES.pop(name, None)
    if saved is not None:
        ROUTES[name] = saved


def test_select_includes_registered_route(dummy_route):
    names = [r.name for r in select("daily")]
    assert dummy_route in names


def test_select_filters_by_cadence(dummy_route):
    assert dummy_route not in [r.name for r in select("weekly")]


def test_get_returns_route(dummy_route):
    r = get(dummy_route)
    assert isinstance(r, Route)
    assert r.name == dummy_route
    assert r.cadence == "daily"


def test_get_unknown_raises():
    with pytest.raises(KeyError):
        get("no-such-route")
