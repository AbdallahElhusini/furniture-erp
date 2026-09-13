from __future__ import annotations

import argparse
import collections
import dataclasses
import hashlib
import json
import random
import sys
from pathlib import Path
from typing import Any, Iterable

from contract import MODEL_ENABLED_KINDS


BALANCED_POLICY = "balanced-round-robin"
NATURAL_POLICY = "natural"
SAMPLING_POLICIES = (BALANCED_POLICY, NATURAL_POLICY)
ABSTENTION_BUCKET = "__ABSTAIN__"
MULTI_ACTION_BUCKET = "__MULTI__"


@dataclasses.dataclass(frozen=True)
class SamplingResult:
    rows: tuple[dict[str, Any], ...]
    metadata: dict[str, Any]


def row_bucket(row: dict[str, Any]) -> str:
    try:
        completion = json.loads(row["completion"][0]["content"])
        actions = completion["actions"]
    except (KeyError, IndexError, TypeError, json.JSONDecodeError) as error:
        raise ValueError("Cannot derive sampling bucket from malformed completion") from error
    if not isinstance(actions, list):
        raise ValueError("Cannot derive sampling bucket: actions must be an array")
    if not actions:
        return ABSTENTION_BUCKET
    if not all(isinstance(action, dict) and isinstance(action.get("kind"), str) for action in actions):
        raise ValueError("Cannot derive sampling bucket: action kind is missing")
    if len(actions) == 1:
        return actions[0]["kind"]
    # Keep linked workflows in one explicit bucket so combinations with two to
    # five actions gain equal exposure without multiplying the balanced corpus.
    return MULTI_ACTION_BUCKET


def row_action_kinds(row: dict[str, Any]) -> frozenset[str]:
    try:
        completion = json.loads(row["completion"][0]["content"])
        actions = completion["actions"]
    except (KeyError, IndexError, TypeError, json.JSONDecodeError) as error:
        raise ValueError("Cannot derive action coverage from malformed completion") from error
    if not isinstance(actions, list):
        raise ValueError("Cannot derive action coverage: actions must be an array")
    if not all(isinstance(action, dict) and isinstance(action.get("kind"), str) for action in actions):
        raise ValueError("Cannot derive action coverage: action kind is missing")
    return frozenset(action["kind"] for action in actions)


def row_fingerprint(row: dict[str, Any]) -> str:
    encoded = json.dumps(row, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def natural_only_rows(rows: Iterable[dict[str, Any]]) -> list[dict[str, Any]]:
    selected: list[dict[str, Any]] = []
    for row in rows:
        try:
            message = row["prompt"][-1]["content"]
        except (KeyError, IndexError, TypeError) as error:
            raise ValueError("Cannot apply natural-only filter to malformed prompt") from error
        if not isinstance(message, str):
            raise ValueError("Cannot apply natural-only filter: user content must be text")
        if "|" not in message:
            selected.append(row)
    return selected


def _bucket_seed(seed: int, bucket: str) -> int:
    digest = hashlib.sha256(f"{seed}:{bucket}".encode("utf-8")).digest()
    return int.from_bytes(digest[:8], "big", signed=False)


def _order_sha256(rows: Iterable[dict[str, Any]]) -> str:
    digest = hashlib.sha256()
    for row in rows:
        digest.update(row_fingerprint(row).encode("ascii"))
        digest.update(b"\n")
    return digest.hexdigest()


def sample_rows(
    rows: list[dict[str, Any]],
    *,
    policy: str = BALANCED_POLICY,
    seed: int = 260901,
    required_kinds: Iterable[str] = (),
    require_abstention: bool = False,
    bucket_weights: dict[str, int] | None = None,
) -> SamplingResult:
    if policy not in SAMPLING_POLICIES:
        raise ValueError(f"Unsupported sampling policy: {policy}")
    if not rows:
        raise ValueError("Cannot sample an empty dataset")
    buckets: dict[str, list[dict[str, Any]]] = collections.defaultdict(list)
    observed_kinds: set[str] = set()
    for row in rows:
        buckets[row_bucket(row)].append(row)
        observed_kinds.update(row_action_kinds(row))
    source_counts = {bucket: len(values) for bucket, values in sorted(buckets.items())}
    required = frozenset(required_kinds)
    missing_kinds = sorted(required - observed_kinds)
    abstention_present = ABSTENTION_BUCKET in source_counts
    requested_weights = {
        bucket: weight
        for bucket, weight in (bucket_weights or {}).items()
        if bucket in source_counts or weight != 1
    }
    invalid_weight_buckets = sorted(set(requested_weights) - set(source_counts))
    if invalid_weight_buckets:
        raise ValueError(
            "Sampling weights reference buckets absent from the training slice: "
            + ", ".join(invalid_weight_buckets)
        )
    if any(
        not isinstance(weight, int) or isinstance(weight, bool) or weight < 1
        for weight in requested_weights.values()
    ):
        raise ValueError("Sampling bucket weights must be positive integers")
    effective_weights = {
        bucket: requested_weights.get(bucket, 1)
        for bucket in sorted(source_counts)
    }
    if missing_kinds:
        raise ValueError("Training slice is missing required action kinds: " + ", ".join(missing_kinds))
    if require_abstention and not abstention_present:
        raise ValueError("Training slice is missing required abstention/negative rows")

    if policy == NATURAL_POLICY:
        if any(weight != 1 for weight in effective_weights.values()):
            raise ValueError("Custom bucket weights require balanced-round-robin sampling")
        sampled = list(rows)
        random.Random(seed).shuffle(sampled)
        target_per_bucket = None
    else:
        shuffled: dict[str, list[dict[str, Any]]] = {}
        for bucket, values in sorted(buckets.items()):
            shuffled[bucket] = list(values)
            random.Random(_bucket_seed(seed, bucket)).shuffle(shuffled[bucket])
        target_per_bucket = max(len(values) for values in shuffled.values())
        sampled = []
        # Interleaving, rather than merely weighting a random loader, guarantees that every
        # bucket appears once per cycle even when CPU training stops after very few steps.
        ordered_buckets = sorted(shuffled)
        for index in range(target_per_bucket):
            for bucket in ordered_buckets:
                values = shuffled[bucket]
                weight = effective_weights[bucket]
                for repetition in range(weight):
                    sampled.append(values[(index * weight + repetition) % len(values)])

    sampled_counts = collections.Counter(row_bucket(row) for row in sampled)
    metadata = {
        "policy": policy,
        "seed": seed,
        "sourceRows": len(rows),
        "sampledRows": len(sampled),
        "bucketCount": len(source_counts),
        "sourceBucketCounts": source_counts,
        "sampledBucketCounts": dict(sorted(sampled_counts.items())),
        "observedKinds": sorted(observed_kinds),
        "requiredKinds": sorted(required),
        "abstentionRequired": require_abstention,
        "abstentionPresent": abstention_present,
        "targetRowsPerBucket": target_per_bucket,
        "bucketWeights": effective_weights,
        "weightedCycleSize": sum(effective_weights.values()),
        "oversampledRows": len(sampled) - len(rows),
        "oversampledByBucket": {
            bucket: sampled_counts[bucket] - count for bucket, count in source_counts.items()
        },
        "orderSha256": _order_sha256(sampled),
    }
    return SamplingResult(rows=tuple(sampled), metadata=metadata)


def read_rows(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    with path.open("r", encoding="utf-8") as source:
        for line_number, line in enumerate(source, 1):
            if not line.strip():
                continue
            try:
                value = json.loads(line)
            except json.JSONDecodeError as error:
                raise ValueError(f"Invalid JSON at {path}:{line_number}: {error.msg}") from error
            if not isinstance(value, dict):
                raise ValueError(f"Expected object at {path}:{line_number}")
            rows.append(value)
    return rows


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    base = Path(__file__).resolve().parent
    parser = argparse.ArgumentParser(description="Preview deterministic HATAB training sampling without loading a model")
    parser.add_argument("--input", type=Path, default=base / "data" / "train.jsonl")
    parser.add_argument("--policy", choices=SAMPLING_POLICIES, default=BALANCED_POLICY)
    parser.add_argument("--seed", type=int, default=260901)
    parser.add_argument("--required-kinds", default=",".join(sorted(MODEL_ENABLED_KINDS)))
    parser.add_argument("--allow-missing-abstention", action="store_true")
    parser.add_argument("--natural-only", action="store_true")
    parser.add_argument("--abstention-weight", type=int, default=1)
    parser.add_argument("--multi-action-weight", type=int, default=1)
    parser.add_argument("--output", type=Path, default=base / "reports" / "sampling-preflight-v2.json")
    args = parser.parse_args()
    required_kinds = {value.strip() for value in args.required_kinds.split(",") if value.strip()}
    input_rows = read_rows(args.input.resolve())
    selected_rows = natural_only_rows(input_rows) if args.natural_only else input_rows
    result = sample_rows(
        selected_rows,
        policy=args.policy,
        seed=args.seed,
        required_kinds=required_kinds,
        require_abstention=not args.allow_missing_abstention,
        bucket_weights={
            ABSTENTION_BUCKET: args.abstention_weight,
            MULTI_ACTION_BUCKET: args.multi_action_weight,
        },
    )
    report = {
        "schema": "hatab-local-ai-sampling-v2",
        "inputPath": str(args.input.resolve()),
        "inputSha256": hashlib.sha256(args.input.read_bytes()).hexdigest(),
        "inputRows": len(input_rows),
        "naturalOnly": args.natural_only,
        **result.metadata,
    }
    payload = json.dumps(report, ensure_ascii=False, indent=2) + "\n"
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(payload, encoding="utf-8")
    print(payload, end="")


if __name__ == "__main__":
    main()
