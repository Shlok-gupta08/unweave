import os
import sys
import argparse
import time

# FFmpeg PATH Fix (Windows)
if sys.platform == "win32":
    try:
        import subprocess as _sp
        _sp.check_output(["ffmpeg", "-version"], stderr=_sp.DEVNULL)
    except FileNotFoundError:
        _ffmpeg_search_dirs = [
            os.path.join(os.environ.get("LOCALAPPDATA", ""), "Microsoft", "WinGet", "Links"),
            os.path.join(os.environ.get("LOCALAPPDATA", ""), "Microsoft", "WinGet", "Packages"),
            os.path.join(os.environ.get("ProgramFiles", ""), "ffmpeg", "bin"),
            os.path.join(os.environ.get("ProgramFiles(x86)", ""), "ffmpeg", "bin"),
        ]
        for _dir in _ffmpeg_search_dirs:
            if os.path.isdir(_dir) and any(f.lower().startswith("ffmpeg") for f in os.listdir(_dir)):
                os.environ["PATH"] = _dir + os.pathsep + os.environ.get("PATH", "")
                print(f"worker: Added ffmpeg to PATH from: {_dir}", file=sys.stderr)
                break

from audio_separator.separator import Separator

def run_worker():
    parser = argparse.ArgumentParser()
    parser.add_argument("--job_id", required=True)
    parser.add_argument("--input", required=True)
    parser.add_argument("--out_dir", required=True)
    parser.add_argument("--device_type", required=True)
    parser.add_argument("--models_dir", required=True)
    args = parser.parse_args()

    separator_kwargs = {
        "output_dir": args.out_dir,
        "output_format": "mp3",
        "model_file_dir": args.models_dir,
    }

    if args.device_type == "directml":
        separator_kwargs["use_directml"] = True

    print("worker: Loading model...", file=sys.stderr)
    separator = Separator(**separator_kwargs)
    separator.load_model(model_filename="htdemucs_6s.yaml")

    print("worker: Separating stems...", file=sys.stderr)
    # The Separator class natively prints tqdm to stderr because of our logger config or its own.
    # We don't intercept it here; let it naturally stream to our parent process (main.py) which reads stderr.
    output_files = separator.separate(args.input)
    
    # We output the completed files to STDOUT so the parent can parse them
    print(f"DONE:{','.join(output_files)}", file=sys.stdout)

if __name__ == "__main__":
    try:
        run_worker()
    except Exception as e:
        print(f"ERROR:{str(e)}", file=sys.stdout)
        sys.exit(1)
