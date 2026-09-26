from learning_links.api import is_public_path


def test_public_routes_are_explicit():
    assert is_public_path("/")
    assert is_public_path("/demo")
    assert is_public_path("/demo/")
    assert is_public_path("/api/health")
    assert is_public_path("/assets/app.js")


def test_private_routes_stay_protected():
    assert not is_public_path("/app")
    assert not is_public_path("/app/")
    assert not is_public_path("/api/workspace")
    assert not is_public_path("/api/users")
    assert not is_public_path("/anything-else")
