import os
import sys

# Auto-activate Python 3.11 virtual environment or embedded framework if run under wrong interpreter
_script_dir = os.path.dirname(os.path.abspath(__file__))
_embedded_py = os.path.join(_script_dir, "python", "Frameworks", "Python.framework", "Versions", "3.11", "bin", "python3.11")
_venv_bin = os.path.join(_script_dir, ".venv", "bin" if sys.platform != "win32" else "Scripts")
_venv_python = os.path.join(_venv_bin, "python" + (".exe" if sys.platform == "win32" else ""))

if os.path.exists(_embedded_py) and os.path.realpath(sys.executable) != os.path.realpath(_embedded_py):
    _site_pkg = os.path.join(_script_dir, "python", "lib", "python3.11", "site-packages")
    os.environ["PYTHONPATH"] = f"{_site_pkg}:{_script_dir}"
    os.environ["PYTHONHOME"] = os.path.join(_script_dir, "python", "Frameworks", "Python.framework", "Versions", "3.11")
    os.execv(_embedded_py, [_embedded_py] + sys.argv)
elif os.path.exists(_venv_python) and os.path.realpath(sys.executable) != os.path.realpath(_venv_python):
    os.execv(_venv_python, [_venv_python] + sys.argv)

try:
    from audio_separator.separator import Separator  # type: ignore
except ImportError:
    _site_packages = [
        os.path.join(_script_dir, ".venv", "lib", "python3.11", "site-packages"),
        os.path.join(_script_dir, "python", "lib", "python3.11", "site-packages"),
    ]
    for _sp in _site_packages:
        if os.path.isdir(_sp) and _sp not in sys.path:
            sys.path.insert(0, _sp)
    try:
        from audio_separator.separator import Separator  # type: ignore
    except ImportError:
        Separator = None  # type: ignore

import argparse
import shutil

# FFmpeg PATH Auto-Discovery (Static imageio_ffmpeg + Bundled bin + System)
try:
    import imageio_ffmpeg  # type: ignore
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
    if Separator is None:
        print("ERROR: audio-separator is not installed in the active runtime.", file=sys.stdout)
        sys.exit(1)

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
    try:
        import torch  # type: ignore
        if args.device_type == "cpu":
            torch.set_num_threads(2)
    except Exception:
        pass

    import inspect
    try:
        init_sig = inspect.signature(Separator.__init__)
        init_params = init_sig.parameters
    except Exception:
        init_params = {}

    has_audio_file_path = "audio_file_path" in init_params

    # Build kwargs dynamically based on what Separator.__init__ accepts
    kwargs = {}
    if "output_dir" in init_params:
        kwargs["output_dir"] = args.out_dir
    if "output_format" in init_params:
        kwargs["output_format"] = "mp3"
    if "model_file_dir" in init_params:
        kwargs["model_file_dir"] = args.models_dir
    if "log_level" in init_params:
        kwargs["log_level"] = 10
    if "demucs_params" in init_params:
        kwargs["demucs_params"] = {"shifts": args.shifts}
    elif "demucs_shifts" in init_params:
        kwargs["demucs_shifts"] = args.shifts

    if args.device_type == "directml" and "use_directml" in init_params:
        kwargs["use_directml"] = True
    elif args.device_type == "mps" and "use_coreml" in init_params:
        kwargs["use_coreml"] = True
    elif args.device_type == "cuda" and "use_cuda" in init_params:
        kwargs["use_cuda"] = True

    if has_audio_file_path or not hasattr(Separator, "load_model"):
        print("worker: Using legacy audio-separator API...", file=sys.stderr)
        if "model_name" in init_params:
            kwargs["model_name"] = "htdemucs_6s.yaml"
        separator = Separator(args.input, **kwargs)
        if hasattr(separator, "arch_specific_params") and isinstance(separator.arch_specific_params, dict):
            if "Demucs" in separator.arch_specific_params and isinstance(separator.arch_specific_params["Demucs"], dict):
                separator.arch_specific_params["Demucs"]["shifts"] = args.shifts
        print("worker: Separating stems...", file=sys.stderr)
        output_files = separator.separate()
    else:
        print("worker: Using standard audio-separator API...", file=sys.stderr)
        separator = Separator(**kwargs)
        if hasattr(separator, "arch_specific_params") and isinstance(separator.arch_specific_params, dict):
            if "Demucs" in separator.arch_specific_params and isinstance(separator.arch_specific_params["Demucs"], dict):
                separator.arch_specific_params["Demucs"]["shifts"] = args.shifts
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
