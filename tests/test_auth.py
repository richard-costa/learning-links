import unittest

from learning_links.auth import hash_password, verify_password


class AuthTests(unittest.TestCase):
    def test_password_round_trip(self):
        password_hash = hash_password("correct horse battery staple")
        self.assertTrue(verify_password(password_hash, "correct horse battery staple"))
        self.assertFalse(verify_password(password_hash, "wrong password"))

    def test_short_password_rejected(self):
        with self.assertRaises(ValueError):
            hash_password("short")


if __name__ == "__main__":
    unittest.main()
