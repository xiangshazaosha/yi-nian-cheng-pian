"""On-demand Desktop-only MCP transport; no model turn or cloud fallback.

Use the installed official launcher unchanged. Only requested schemas/results
enter context. Script editing and native Jianying export are the default route.
"""
import argparse
import json
import os
from pathlib import Path
import queue
import shutil
import subprocess
import threading
import time
from uuid import UUID

ROOT = Path(__file__).resolve().parent.parent
DESKTOP_ALLOWED = {
    "get_active_project", "list_projects", "create_project", "target_project", "read_project",
    "browse_assets", "inspect_asset", "inspect_item", "push_asset", "track_progress",
    "trigger_transcript", "find_transcript", "read_script", "clean_script", "apply_script",
    "edit_track", "edit_item", "manage_timelines", "read_captions",
    "edit_captions", "preview_timeline", "local_export",
    "delete_project",
}


def validate_delete_request(arguments, authorized_project_ids):
    """Require a full, explicitly authorized project ID; no current-project fallback."""
    if not isinstance(arguments, dict) or set(arguments) != {"projectId"}:
        raise ValueError("Deletion requires exactly one explicit projectId")
    project_id = arguments["projectId"]
    try:
        full_id = isinstance(project_id, str) and str(UUID(project_id)) == project_id
    except (ValueError, AttributeError):
        full_id = False
    if not full_id:
        raise ValueError("Deletion requires a full canonical project UUID")
    if project_id not in authorized_project_ids:
        raise ValueError("Project deletion lacks explicit per-project authorization")


def server_override(surface="desktop"):
    if surface != "desktop":
        raise ValueError("Only ChatCut Desktop is supported; the hosted route was removed")
    launcher = Path(os.environ.get("APPDATA", "")) / "ChatCut/chatcut-mcp.cmd"
    if not launcher.is_file():
        raise RuntimeError("Official installed Desktop MCP launcher is missing")
    # Invoke the installed launcher unchanged. Never extract/copy its capability,
    # change the global disabled setting, or activate other MCP servers.
    return "chatcut_desktop", 'mcp_servers={chatcut_desktop={command=' + json.dumps(str(launcher)) + ',enabled=true,startup_timeout_sec=30,tool_timeout_sec=120}}'


def codex_executable():
    if os.environ.get("VIDEO_CODEX_EXE"):
        return os.environ["VIDEO_CODEX_EXE"]
    base = Path(os.environ.get("LOCALAPPDATA", "")) / "OpenAI/Codex/bin"
    candidates = sorted(base.glob("*/codex.exe"), key=lambda p: p.stat().st_mtime, reverse=True)
    if candidates:
        return str(candidates[0])
    exe = shutil.which("codex")
    if not exe:
        raise RuntimeError("Existing Codex runtime not found; no runtime installed automatically")
    return exe


class Server:
    def __init__(self, surface="desktop"):
        self.server_name, override = server_override(surface)
        self.proc = subprocess.Popen(
            [codex_executable(), "app-server", "-c", override], cwd=ROOT,
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
            text=True, encoding="utf-8", errors="replace", bufsize=1,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
        self.events = queue.Queue()
        self.next_id = 0
        def pump():
            for line in self.proc.stdout:
                try:
                    self.events.put(json.loads(line))
                except ValueError:
                    continue
            self.events.put({"closed": True})
        threading.Thread(target=pump, daemon=True).start()

    def rpc(self, method, params, timeout=150):
        self.next_id += 1
        request_id = self.next_id
        self.proc.stdin.write(json.dumps({"jsonrpc": "2.0", "id": request_id, "method": method, "params": params}) + "\n")
        self.proc.stdin.flush()
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            try:
                event = self.events.get(timeout=max(0.1, deadline - time.monotonic()))
            except queue.Empty:
                raise TimeoutError("Desktop MCP request timed out") from None
            if event.get("closed"):
                raise RuntimeError("Codex bridge process closed")
            if event.get("id") == request_id and ("result" in event or "error" in event):
                if "error" in event:
                    raise RuntimeError(json.dumps(event["error"], ensure_ascii=False))
                return event["result"]
            if "id" in event and "method" in event:
                # A login, elicitation, or write approval needs a human; do not auto-answer.
                raise RuntimeError("MCP requested human approval/input; use the host's interactive flow")
        raise TimeoutError("Desktop MCP request timed out")

    def start(self):
        self.rpc("initialize", {"clientInfo": {"name": "video_pipeline_mcp_bridge", "version": "1.0.0"}, "capabilities": {"experimentalApi": True}})
        self.proc.stdin.write(json.dumps({"method": "initialized"}) + "\n")
        self.proc.stdin.flush()
        result = self.rpc("thread/start", {
            "cwd": str(ROOT), "ephemeral": True, "approvalPolicy": "never",
            "sandbox": "workspace-write", "baseInstructions": "MCP transport handle only; do not start a model turn.",
        })
        self.thread_id = result["thread"]["id"]

    def inventory(self):
        deadline = time.monotonic() + 35
        while True:
            result = self.rpc("mcpServerStatus/list", {"threadId": self.thread_id, "serverName": getattr(self, "server_name", "chatcut_desktop"), "detail": "toolsAndAuthOnly"})
            entries = result.get("data", [])
            # Authentication can be connected before the tool manifest arrives.
            # Wait only for that startup race; preserve explicit failures for humans.
            if not entries or any(s.get("tools") or s.get("toolsError") or s.get("runtimeStatus") not in {"starting", "connected"} for s in entries) or time.monotonic() >= deadline:
                return result
            time.sleep(1)

    def close(self):
        if self.proc.poll() is None:
            self.proc.stdin.close()
            try:
                self.proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self.proc.terminate()
                try:
                    self.proc.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    self.proc.kill()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("action", choices=["status", "schema", "call"])
    parser.add_argument("--surface", choices=["desktop"], default="desktop")
    parser.add_argument("--tool")
    parser.add_argument("--arguments-file", type=Path)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--authorized-delete-project", action="append", default=[],
                        help="Full project UUID explicitly authorized by the user for deletion; repeat per approved project")
    args = parser.parse_args()
    allowed = DESKTOP_ALLOWED
    if args.action != "status" and args.tool not in allowed:
        raise RuntimeError("Tool is outside the Desktop workflow allow list")
    if args.action == "call" and args.tool in {"push_asset", "local_export", "read_script", "clean_script", "apply_script", "delete_project"} and not args.output:
        raise RuntimeError("Export/import responses must be saved to ignored scratch storage, not dumped into chat")
    if args.output:
        args.output = args.output.resolve()
        scratch = (ROOT / "remotion-clone/.tmp/chatcut").resolve()
        if not args.output.is_relative_to(scratch):
            raise RuntimeError("MCP output must stay under remotion-clone/.tmp/chatcut")
    arguments = {}
    if args.action == "call":
        arguments = json.loads(args.arguments_file.read_text(encoding="utf-8-sig")) if args.arguments_file else {}
        if args.tool == "delete_project":
            validate_delete_request(arguments, args.authorized_delete_project)
    server = Server(args.surface)
    try:
        server.start()
        inventory = server.inventory()
        if args.action == "status":
            result = inventory
            # Avoid dumping every tool definition into an ordinary conversation.
            for entry in result.get("data", []):
                entry["tools"] = list(entry.get("tools", {}).keys())
        elif args.action == "schema":
            result = {"tool": args.tool, "matches": [s.get("tools", {}).get(args.tool) for s in inventory.get("data", []) if args.tool in s.get("tools", {})]}
        else:
            tools = [s for s in inventory.get("data", []) if args.tool in s.get("tools", {})]
            if not tools:
                raise RuntimeError("Desktop tool unavailable; check connection and current server manifest")
            result = server.rpc("mcpServer/tool/call", {"threadId": server.thread_id, "server": server.server_name, "tool": args.tool, "arguments": arguments})
        value = json.dumps(result, ensure_ascii=False, indent=2) + "\n"
        if args.output:
            # Output data may contain signed URLs; keep it in ignored scratch storage.
            args.output.parent.mkdir(parents=True, exist_ok=True)
            with args.output.open("x", encoding="utf-8") as f:
                f.write(value)
            summary = {"saved": str(args.output), "isError": result.get("isError", False)}
            if args.action == "status":
                summary["connectionReady"] = any(s.get("tools") and not s.get("toolsError") for s in result.get("data", []))
            print(json.dumps(summary, ensure_ascii=False))
        else:
            print(value)
    finally:
        server.close()


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(json.dumps({"ok": False, "error": str(error)}, ensure_ascii=False))
        raise SystemExit(1)
