"""Bounded manifest readiness tests; no network, credentials, or model turn."""
import unittest
import tomllib
from pathlib import Path
from unittest.mock import patch

from chatcut_bridge import Server, server_override, DESKTOP_ALLOWED, validate_delete_request


class DeletionAuthorizationTests(unittest.TestCase):
    project = "4f183ee6-1907-402d-8167-4da022be4d12"
    other = "cffe5f0f-e215-4ac4-8b65-400b66d0ef76"

    def test_explicit_authorized_project_allowed(self):
        validate_delete_request({"projectId": self.project}, [self.project, self.other])

    def test_no_authorization_rejected(self):
        with self.assertRaisesRegex(ValueError, "authorization"):
            validate_delete_request({"projectId": self.project}, [])

    def test_other_project_authorization_rejected(self):
        with self.assertRaisesRegex(ValueError, "authorization"):
            validate_delete_request({"projectId": self.project}, [self.other])

    def test_current_project_fallback_and_extra_arguments_rejected(self):
        for arguments in [{}, {"projectId": self.project, "force": True}, [self.project]]:
            with self.subTest(arguments=arguments), self.assertRaisesRegex(ValueError, "exactly one"):
                validate_delete_request(arguments, [self.project])

    def test_partial_wildcard_and_invalid_id_rejected(self):
        for project_id in [self.project[:10], "*", "", None, 12, self.project.upper()]:
            with self.subTest(project_id=project_id), self.assertRaisesRegex(ValueError, "canonical"):
                validate_delete_request({"projectId": project_id}, [project_id])


class InventoryTests(unittest.TestCase):
    def test_project_has_no_hosted_registration(self):
        config=Path(__file__).resolve().parents[1]/'.codex/config.toml'
        # Local Codex settings are intentionally absent in a fresh Git clone.
        servers=tomllib.loads(config.read_text(encoding='utf-8') if config.exists() else '').get('mcp_servers',{})
        self.assertFalse(any('url' in server or 'oauth_resource' in server for server in servers.values()))

    def test_hosted_route_rejected(self):
        with self.assertRaisesRegex(ValueError, "Only ChatCut Desktop"):
            server_override("cloud")

    def test_default_uses_only_official_desktop_launcher(self):
        with patch("chatcut_bridge.Path.is_file", return_value=True):
            name, override = server_override()
        servers = tomllib.loads(override)["mcp_servers"]
        self.assertEqual(name, "chatcut_desktop")
        self.assertEqual(list(servers), [name])
        self.assertTrue(servers[name]["command"].endswith("chatcut-mcp.cmd"))
        self.assertNotIn("env", servers[name])
        self.assertIn("local_export", DESKTOP_ALLOWED)
        self.assertIn("apply_script", DESKTOP_ALLOWED)
        self.assertIn("clean_script", DESKTOP_ALLOWED)
        self.assertNotIn("import_media", DESKTOP_ALLOWED)
        self.assertNotIn("submit_export", DESKTOP_ALLOWED)

    def server(self, responses):
        server = Server.__new__(Server)
        server.thread_id = "synthetic-test"
        self.responses = iter(responses)
        server.rpc = lambda *args, **kwargs: next(self.responses)
        return server

    def test_connected_before_manifest_waits(self):
        empty = {"data": [{"runtimeStatus": "connected", "tools": {}}]}
        ready = {"data": [{"runtimeStatus": "connected", "tools": {"read_project": {}}}]}
        with patch("chatcut_bridge.time.sleep"), patch("chatcut_bridge.time.monotonic", return_value=0):
            self.assertIs(self.server([empty, ready]).inventory(), ready)

    def test_explicit_tool_error_is_not_retried(self):
        failed = {"data": [{"runtimeStatus": "connected", "toolsError": "Login required"}]}
        self.assertIs(self.server([failed]).inventory(), failed)

    def test_terminal_state_is_not_retried(self):
        failed = {"data": [{"runtimeStatus": "failed", "tools": {}}]}
        self.assertIs(self.server([failed]).inventory(), failed)

    def test_manifest_wait_has_deadline(self):
        empty = {"data": [{"runtimeStatus": "connected", "tools": {}}]}
        with patch("chatcut_bridge.time.monotonic", side_effect=[0, 36]):
            self.assertIs(self.server([empty]).inventory(), empty)


if __name__ == "__main__":
    unittest.main()
