import os
import sys
import argparse

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

    print("worker: Loading model...", file=sys.stderr)
    
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
