"""Entry point for the downloadable app (PyInstaller). From source, use `python -m eden`."""
import multiprocessing
import sys
import traceback


def _pause() -> None:
    # A double-clicked console window closes instantly; keep the message readable.
    if getattr(sys, "frozen", False) and sys.stdin and sys.stdin.isatty():
        try:
            input("\n  Press Enter to close this window. ")
        except EOFError:
            pass


def run() -> None:
    multiprocessing.freeze_support()
    from eden.__main__ import main
    try:
        main()
    except SystemExit as e:
        if e.code not in (0, None):
            _pause()
        raise
    except KeyboardInterrupt:
        pass
    except Exception:
        traceback.print_exc()
        _pause()
        raise SystemExit(1) from None


if __name__ == "__main__":
    run()
