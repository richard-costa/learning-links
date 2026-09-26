from learning_links.api import is_public_path


def test_public_routes_are_explicit():
    assert is_public_path("/")
    assert is_public_path("/app")
    assert is_public_path("/app/")
    assert is_public_path("/demo")
    assert is_public_path("/demo/")
    assert is_public_path("/login")
    assert is_public_path("/signup")
    assert is_public_path("/api/health")
    assert is_public_path("/api/auth/login")
    assert is_public_path("/api/auth/signup")
    assert is_public_path("/assets/app.js")


def test_private_routes_stay_protected():
    assert not is_public_path("/api/workspace")
    assert not is_public_path("/api/auth/session")
    assert not is_public_path("/api/auth/logout")
    assert not is_public_path("/api/users")
    assert not is_public_path("/anything-else")
