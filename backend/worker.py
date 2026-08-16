import os
import sys

# Auto-activate virtual environment or embedded framework if run directly
try:
    from audio_separator.separator import Separator
except ImportError:
    _script_dir = os.path.dirname(os.path.abspath(__file__))
    _embedded_py = os.path.join(_script_dir, "python", "Frameworks", "Python.framework", "Versions", "3.11", "bin", "python3.11")
    _venv_bin = os.path.join(_script_dir, ".venv", "bin" if sys.platform != "win32" else "Scripts")
    _venv_python = os.path.join(_venv_bin, "python" + (".exe" if sys.platform == "win32" else ""))
    
    if os.path.exists(_embedded_py):
        _site_pkg = os.path.join(_script_dir, "python", "lib", "python3.11", "site-packages")
        os.environ["PYTHONPATH"] = f"{_site_pkg}:{_script_dir}"
        os.environ["PYTHONHOME"] = os.path.join(_script_dir, "python", "Frameworks", "Python.framework", "Versions", "3.11")
        os.execv(_embedded_py, [_embedded_py] + sys.argv)
    elif os.path.exists(_venv_python):
        os.execv(_venv_python, [_venv_python] + sys.argv)
    else:
        print("Error: audio-separator is not installed and no Python runtime was found.", file=sys.stderr)
        sys.exit(1)

import argparse
import shutil

# FFmpeg PATH Auto-Discovery (Static imageio_ffmpeg + Bundled bin + System)
try:
    import imageio_ffmpeg
    _ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
    if _ffmpeg_exe and os.path.exists(_ffmpeg_exe):
        _ffmpeg_dir = os.path.dirname(_ffmpeg_exe)
        _std_ffmpeg = os.path.join(_ffmpeg_dir, "ffmpeg")
        if not os.path.exists(_std_ffmpeg):
            try:
                os.symlink(_ffmpeg_exe, _std_ffmpeg)
            except Exception:
                shutil.copy2(_ffmpeg_exe, _std_ffmpeg)
        os.environ["PATH"] = _ffmpeg_dir + os.pathsep + os.environ.get("PATH", "")
except Exception:
    pass

_ffmpeg_search_dirs = [
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "bin"),
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "bin"),
    "/opt/homebrew/bin",
    "/usr/local/bin",
    "/opt/local/bin",
]
if sys.platform == "win32":
    _ffmpeg_search_dirs.extend([
        os.path.join(os.environ.get("LOCALAPPDATA", ""), "Microsoft", "WinGet", "Links"),
        os.path.join(os.environ.get("LOCALAPPDATA", ""), "Microsoft", "WinGet", "Packages"),
        os.path.join(os.environ.get("ProgramFiles", ""), "ffmpeg", "bin"),
        os.path.join(os.environ.get("ProgramFiles(x86)", ""), "ffmpeg", "bin"),
    ])

for _dir in _ffmpeg_search_dirs:
    if os.path.isdir(_dir) and any(f.lower().startswith("ffmpeg") for f in os.listdir(_dir)):
        os.environ["PATH"] = _dir + os.pathsep + os.environ.get("PATH", "")
        break

def run_worker():
    parser = argparse.ArgumentParser()
    parser.add_argument("--job_id", required=True)
    parser.add_argument("--input", required=True)
    parser.add_argument("--out_dir", required=True)
    parser.add_argument("--device_type", required=True)
    parser.add_argument("--models_dir", required=True)
    parser.add_argument("--shifts", type=int, default=2)
    args = parser.parse_args()

    print(f"worker: Loading model (shifts={args.shifts})...", file=sys.stderr)
    
    # Limit PyTorch CPU threads to avoid severe contention on low-resource environments (like Azure Container Apps)
    # which can cause the process to hang at "0% / Calculating".
    import torch
    if args.device_type == "cpu":
        torch.set_num_threads(2)

    import inspect
    try:
        init_sig = inspect.signature(Separator.__init__)
        has_audio_file_path = "audio_file_path" in init_sig.parameters
    except Exception:
        has_audio_file_path = False

    # Check both inspect signature and existence of load_model method.
    # load_model was introduced in newer versions (~v0.9.0+) of audio-separator.
    # We check hasattr(Separator, "load_model") as signature inspections can be obscured by @beartype decorators.
    if has_audio_file_path or not hasattr(Separator, "load_model"):
        print("worker: Using older audio-separator API (v0.8.x)...", file=sys.stderr)
        old_kwargs = {
            "output_dir": args.out_dir,
            "output_format": "mp3",
            "model_file_dir": args.models_dir,
            "model_name": "htdemucs_6s.yaml",
            "demucs_shifts": args.shifts,
            "log_level": 10,
        }
        if args.device_type == "mps":
            old_kwargs["use_coreml"] = True
        elif args.device_type == "cuda":
            old_kwargs["use_cuda"] = True

        # Pass audio_file_path positionally in case it is positional-only
        separator = Separator(args.input, **old_kwargs)
        print("worker: Separating stems...", file=sys.stderr)
        output_files = separator.separate()
    else:
        print("worker: Using newer audio-separator API...", file=sys.stderr)
        separator_kwargs = {
            "output_dir": args.out_dir,
            "output_format": "mp3",
            "model_file_dir": args.models_dir,
            "demucs_shifts": args.shifts,
            "log_level": 10,
        }
        if args.device_type == "directml":
            separator_kwargs["use_directml"] = True

        separator = Separator(**separator_kwargs)
        separator.load_model(model_filename="htdemucs_6s.yaml")
        print("worker: Separating stems...", file=sys.stderr)
        output_files = separator.separate(args.input)
    
    # We output the completed files to STDOUT so the parent can parse them
    print(f"DONE:{','.join(output_files)}", file=sys.stdout)

if __name__ == "__main__":
    try:
        run_worker()
    except Exception as e:
        print(f"ERROR:{str(e)}", file=sys.stdout)
        sys.exit(1)
