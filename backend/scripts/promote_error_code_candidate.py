"""Promote a reviewed candidate only with explicit approval and a rollback backup."""
import argparse
import hashlib
import json
import os
import shutil
import tempfile
from datetime import datetime, timezone
from pathlib import Path

import joblib


def sha256_bytes(data):
    return hashlib.sha256(data).hexdigest()


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--candidate", required=True, help="Versioned candidate .joblib file")
    parser.add_argument("--backup-dir", required=True, help="New/empty destination for baseline rollback copies")
    parser.add_argument("--model-path", required=True, help="Production classifier pickle to replace")
    parser.add_argument("--vectorizer-path", required=True, help="Production TF-IDF pickle to replace")
    parser.add_argument("--confirm-candidate-evaluated", action="store_true")
    parser.add_argument("--approve-production-overwrite", action="store_true")
    args = parser.parse_args(argv)
    if not args.confirm_candidate_evaluated or not args.approve_production_overwrite:
        parser.error("Promotion requires both --confirm-candidate-evaluated and --approve-production-overwrite")

    candidate_path = Path(args.candidate).resolve()
    manifest_path = candidate_path.with_suffix(".json")
    if not candidate_path.is_file() or not manifest_path.is_file():
        parser.error("Candidate artifact and its adjacent JSON manifest are both required")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if manifest.get("candidate_is_deployed") is not False or not manifest.get("candidate_metrics"):
        parser.error("Candidate manifest does not show an evaluated, undeployed candidate")
    payload = candidate_path.read_bytes()
    if sha256_bytes(payload) != manifest.get("artifact_sha256"):
        parser.error("Candidate artifact hash does not match its manifest")
    candidate = joblib.load(candidate_path)
    if not hasattr(candidate, "named_steps") or not {"tfidf", "classifier"}.issubset(candidate.named_steps):
        parser.error("Candidate must be a Pipeline containing tfidf and classifier steps")
    model_path = Path(args.model_path).resolve()
    vectorizer_path = Path(args.vectorizer_path).resolve()
    if not model_path.is_file() or not vectorizer_path.is_file():
        parser.error("Both existing production artifacts must exist so they can be backed up")
    if model_path == vectorizer_path:
        parser.error("Model and vectorizer paths must be different")

    backup_dir = Path(args.backup_dir).resolve()
    backup_dir.mkdir(parents=True, exist_ok=False)
    model_backup = backup_dir / model_path.name
    vectorizer_backup = backup_dir / vectorizer_path.name
    shutil.copy2(model_path, model_backup)
    shutil.copy2(vectorizer_path, vectorizer_backup)

    staged = []
    replaced = []
    try:
        for target, artifact in ((model_path, candidate.named_steps["classifier"]),
                                 (vectorizer_path, candidate.named_steps["tfidf"])):
            with tempfile.NamedTemporaryFile(suffix=".pkl", dir=target.parent, delete=False) as handle:
                temporary = Path(handle.name)
            joblib.dump(artifact, temporary)
            joblib.load(temporary)  # Verify the staged artifact is readable before replacing anything.
            staged.append((target, temporary))
        for target, temporary in staged:
            os.replace(temporary, target)
            replaced.append(target)
    except Exception:
        for target in replaced:
            backup = model_backup if target == model_path else vectorizer_backup
            shutil.copy2(backup, target)
        raise
    finally:
        for _target, temporary in staged:
            temporary.unlink(missing_ok=True)

    record = {
        "candidate_version": manifest["candidate_version"],
        "candidate_artifact": str(candidate_path),
        "promoted_utc": datetime.now(timezone.utc).isoformat(),
        "baseline_backups": {"model": str(model_backup), "vectorizer": str(vectorizer_backup)},
        "baseline_sha256": {"model": sha256_bytes(model_backup.read_bytes()),
                            "vectorizer": sha256_bytes(vectorizer_backup.read_bytes())},
        "candidate_evaluation_metrics": manifest["candidate_metrics"],
    }
    (backup_dir / "promotion-record.json").write_text(json.dumps(record, indent=2), encoding="utf-8")
    print(json.dumps(record, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
