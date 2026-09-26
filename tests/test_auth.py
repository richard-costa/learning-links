import pytest

from learning_links.auth import hash_password, verify_password


def test_password_round_trip():
    password_hash = hash_password("correct horse battery staple")
    assert verify_password(password_hash, "correct horse battery staple")
    assert not verify_password(password_hash, "wrong password")


def test_short_password_rejected():
    with pytest.raises(ValueError):
        hash_password("short")
