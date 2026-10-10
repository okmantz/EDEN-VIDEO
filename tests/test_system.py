"""System checks, install hints and the command line."""
from __future__ import annotations

import pytest

from eden import __main__ as cli
from eden import system
from eden.config import Config


def test_install_plans_are_exact_for_each_os():
    assert system.ffmpeg_install_plan("macos", have=lambda n: "/x/brew").command == "brew install ffmpeg"
    assert "apt-get install -y ffmpeg" in system.ffmpeg_install_plan("debian", is_root=False).command
    assert system.ffmpeg_install_plan("debian", is_root=False).command.startswith("sudo ")
    assert not system.ffmpeg_install_plan("debian", is_root=True).command.startswith("sudo")
    assert "pacman" in system.ffmpeg_install_plan("arch", is_root=True).command
    win = system.ffmpeg_install_plan("windows", have=lambda n: "C:/winget" if n == "winget" else None)
    assert "winget install --id Gyan.FFmpeg" in win.command and win.argv
    manual = system.ffmpeg_install_plan("windows", have=lambda n: None)
    assert manual.argv is None and "gyan.dev" in manual.command


def test_install_command_never_mixes_operating_systems():
    for os_name in ("debian", "fedora", "arch", "suse", "alpine"):
        assert "winget" not in system.ffmpeg_install_plan(os_name, is_root=True).command


def test_detect_os_returns_known_value():
    assert system.detect_os() in {"windows", "macos", "debian", "fedora", "arch", "suse", "alpine", "linux"}


def test_locate_binary_honours_override_and_missing(tmp_path, monkeypatch):
    fake = tmp_path / "ffmpeg-custom"
    fake.write_text("#!/bin/sh\n")
    fake.chmod(0o755)
    assert system.locate_binary("ffmpeg", str(fake)) == str(fake)
    monkeypatch.setattr(system, "_candidate_dirs", lambda: [])
    monkeypatch.setattr(system.shutil, "which", lambda n: None)
    assert system.locate_binary("ffmpeg") is None


def test_ffmpeg_info_for_missing_binary():
    info = system.ffmpeg_info("/definitely/not/here")
    assert not info.usable and info.problems


def test_ffmpeg_info_real(tmp_path):
    info = system.ffmpeg_info("ffmpeg")
    if not info.path:
        pytest.skip("FFmpeg not installed")
    assert info.usable and info.version


def test_pick_port_skips_busy_port():
    import socket
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        busy = s.getsockname()[1]
        s.listen(1)
        assert system.pick_port("127.0.0.1", busy) != busy


def test_run_checks_and_format(tmp_path):
    cfg = Config(data_dir=tmp_path / "d")
    checks = system.run_checks(cfg)
    names = {c.name for c in checks}
    assert {"Python", "FFmpeg", "Data folder", "Port"} <= names
    assert "Python" in system.format_checks(checks)


def test_doctor_command_exit_code(tmp_path, monkeypatch, capsys):
    monkeypatch.setenv("EDEN_DATA_DIR", str(tmp_path / "data"))
    if not system.ffmpeg_info("ffmpeg").usable:
        pytest.skip("FFmpeg not installed")
    with pytest.raises(SystemExit) as e:
        cli.main(["doctor"])
    assert e.value.code == 0
    assert "system check" in capsys.readouterr().out


def test_missing_ffmpeg_prints_exact_command_and_exits(tmp_path, monkeypatch, capsys):
    monkeypatch.setenv("EDEN_DATA_DIR", str(tmp_path / "data"))
    monkeypatch.setattr(cli, "ffmpeg_info", lambda p: system.FfmpegInfo(problems=["FFmpeg was not found."]))
    monkeypatch.setattr(cli, "ffmpeg_install_plan",
                        lambda: system.InstallPlan("debian", "sudo apt-get install -y ffmpeg", None))
    with pytest.raises(SystemExit) as e:
        cli.main(["--no-browser"])
    assert e.value.code == 1
    out = capsys.readouterr().out
    assert "sudo apt-get install -y ffmpeg" in out and "doctor" in out


def test_parser_accepts_lan_and_port():
    a = cli.build_parser().parse_args(["--lan", "--port", "9001", "--no-browser"])
    assert a.lan and a.port == 9001 and a.no_browser and a.command == "run"


def test_bundled_ffmpeg_is_preferred_when_frozen(tmp_path, monkeypatch):
    import sys
    exe = tmp_path / "bin" / ("ffmpeg.exe" if system.platform.system() == "Windows" else "ffmpeg")
    exe.parent.mkdir()
    exe.write_text("x")
    monkeypatch.setattr(sys, "frozen", True, raising=False)
    monkeypatch.setattr(sys, "_MEIPASS", str(tmp_path), raising=False)
    assert system.is_frozen()
    assert system.locate_binary("ffmpeg") == str(exe)


def test_data_dir_sits_next_to_the_app_when_frozen(tmp_path, monkeypatch):
    import sys

    from eden.config import Config
    monkeypatch.delenv("EDEN_DATA_DIR", raising=False)
    monkeypatch.setattr(sys, "frozen", True, raising=False)
    monkeypatch.setattr(sys, "executable", str(tmp_path / "eden-video"))
    assert Config.from_env().data_dir == (tmp_path / "data").resolve()
