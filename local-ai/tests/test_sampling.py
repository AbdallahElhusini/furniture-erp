from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path


LOCAL_AI = Path(__file__).resolve().parents[1]
if str(LOCAL_AI) not in sys.path:
    sys.path.insert(0, str(LOCAL_AI))

from sampling import (  # noqa: E402
    ABSTENTION_BUCKET,
    BALANCED_POLICY,
    MULTI_ACTION_BUCKET,
    NATURAL_POLICY,
    natural_only_rows,
    read_rows,
    row_bucket,
    row_fingerprint,
    sample_rows,
)
from contract import MODEL_ENABLED_KINDS, validate_envelope  # noqa: E402
from generate_dataset import (  # noqa: E402
    build_long_action_examples,
    build_multi_action_examples,
    split_by_template_family,
    template_family,
)


def training_row(identifier: str, kind: str | None) -> dict[str, object]:
    expected = {
        "actions": [] if kind is None else [{"kind": kind, "name": identifier}],
        "unparsed": [identifier] if kind is None else [],
    }
    return {
        "prompt": [
            {"role": "system", "content": "test"},
            {"role": "user", "content": identifier},
        ],
        "completion": [{"role": "assistant", "content": json.dumps(expected)}],
    }


class BalancedSamplingTests(unittest.TestCase):
    def setUp(self) -> None:
        self.rows = (
            [training_row(f"order-{index}", "CREATE_ORDER_BUNDLE") for index in range(5)]
            + [training_row(f"task-{index}", "CREATE_TASK") for index in range(2)]
            + [training_row(f"negative-{index}", None) for index in range(3)]
        )

    def test_balanced_round_robin_equalizes_and_interleaves_buckets(self) -> None:
        result = sample_rows(self.rows, seed=77)
        self.assertEqual(result.metadata["policy"], BALANCED_POLICY)
        self.assertEqual(result.metadata["sourceBucketCounts"], {
            "CREATE_ORDER_BUNDLE": 5,
            "CREATE_TASK": 2,
            ABSTENTION_BUCKET: 3,
        })
        self.assertEqual(set(result.metadata["sampledBucketCounts"].values()), {5})
        self.assertEqual(result.metadata["sampledRows"], 15)
        self.assertEqual(
            {row_bucket(row) for row in result.rows[:3]},
            {"CREATE_ORDER_BUNDLE", "CREATE_TASK", ABSTENTION_BUCKET},
        )

    def test_balanced_sampling_is_seed_deterministic(self) -> None:
        first = sample_rows(self.rows, policy=BALANCED_POLICY, seed=260901)
        second = sample_rows(self.rows, policy=BALANCED_POLICY, seed=260901)
        different = sample_rows(self.rows, policy=BALANCED_POLICY, seed=260902)
        self.assertEqual(first.metadata["orderSha256"], second.metadata["orderSha256"])
        self.assertEqual(
            [row_fingerprint(row) for row in first.rows],
            [row_fingerprint(row) for row in second.rows],
        )
        self.assertNotEqual(first.metadata["orderSha256"], different.metadata["orderSha256"])

    def test_balanced_sampling_records_and_applies_special_bucket_weights(self) -> None:
        multi = training_row("multi", "CREATE_TASK")
        multi_expected = json.loads(multi["completion"][0]["content"])
        multi_expected["actions"].append({"kind": "CREATE_ORDER_BUNDLE", "name": "multi"})
        multi["completion"][0]["content"] = json.dumps(multi_expected)
        result = sample_rows(
            self.rows + [multi],
            seed=77,
            bucket_weights={ABSTENTION_BUCKET: 2, MULTI_ACTION_BUCKET: 2},
        )
        target = result.metadata["targetRowsPerBucket"]
        self.assertEqual(result.metadata["bucketWeights"][ABSTENTION_BUCKET], 2)
        self.assertEqual(result.metadata["bucketWeights"][MULTI_ACTION_BUCKET], 2)
        self.assertEqual(result.metadata["weightedCycleSize"], 6)
        self.assertEqual(result.metadata["sampledBucketCounts"][ABSTENTION_BUCKET], target * 2)
        self.assertEqual(result.metadata["sampledBucketCounts"][MULTI_ACTION_BUCKET], target * 2)
        self.assertEqual(result.metadata["sampledBucketCounts"]["CREATE_TASK"], target)

    def test_sampling_rejects_invalid_or_unknown_weights(self) -> None:
        with self.assertRaisesRegex(ValueError, "positive integers"):
            sample_rows(self.rows, bucket_weights={ABSTENTION_BUCKET: 0})
        with self.assertRaisesRegex(ValueError, "absent"):
            sample_rows(self.rows, bucket_weights={MULTI_ACTION_BUCKET: 2})

    def test_natural_policy_preserves_source_counts_and_size(self) -> None:
        result = sample_rows(self.rows, policy=NATURAL_POLICY, seed=7)
        self.assertEqual(result.metadata["sourceRows"], len(self.rows))
        self.assertEqual(result.metadata["sampledRows"], len(self.rows))
        self.assertEqual(result.metadata["sourceBucketCounts"], result.metadata["sampledBucketCounts"])
        self.assertIsNone(result.metadata["targetRowsPerBucket"])

    def test_checked_in_dataset_balances_every_action_and_abstention(self) -> None:
        rows = read_rows(LOCAL_AI / "data" / "train.jsonl")
        result = sample_rows(
            rows,
            policy=BALANCED_POLICY,
            seed=260901,
            required_kinds=MODEL_ENABLED_KINDS,
            require_abstention=True,
        )
        self.assertIn(ABSTENTION_BUCKET, result.metadata["sourceBucketCounts"])
        target = max(result.metadata["sourceBucketCounts"].values())
        self.assertEqual(set(result.metadata["sampledBucketCounts"].values()), {target})
        self.assertEqual(result.metadata["sampledRows"], target * result.metadata["bucketCount"])
        self.assertEqual(len(result.metadata["orderSha256"]), 64)

    def test_checked_in_natural_slice_covers_every_enabled_kind_and_abstention(self) -> None:
        rows = natural_only_rows(read_rows(LOCAL_AI / "data" / "train.jsonl"))
        result = sample_rows(
            rows,
            required_kinds=MODEL_ENABLED_KINDS,
            require_abstention=True,
        )
        self.assertEqual(set(result.metadata["requiredKinds"]), set(MODEL_ENABLED_KINDS))
        self.assertEqual(
            set(MODEL_ENABLED_KINDS) | {ABSTENTION_BUCKET},
            set(result.metadata["sourceBucketCounts"]) & (set(MODEL_ENABLED_KINDS) | {ABSTENTION_BUCKET}),
        )

    def test_generator_builds_natural_two_to_five_action_workflows(self) -> None:
        products = [
            {"sku": "TEST-CHAIR-01", "nameAr": "كرسي", "supplier": "Factory A"},
            {"sku": "TEST-DESK-02", "nameAr": "مكتب", "supplier": "Factory B"},
        ]
        rows = build_multi_action_examples(products, count=12)
        self.assertEqual(len(rows), 12)
        observed_counts: set[int] = set()
        observed_partial = False
        for row in rows:
            message = row["prompt"][-1]["content"]
            expected = json.loads(row["completion"][0]["content"])
            observed_counts.add(len(expected["actions"]))
            observed_partial = observed_partial or bool(expected["unparsed"])
            self.assertNotIn("|", message)
            self.assertEqual(row_bucket(row), MULTI_ACTION_BUCKET)
            self.assertEqual(
                validate_envelope(
                    expected,
                    allowed_kinds=MODEL_ENABLED_KINDS,
                    source=message,
                    require_nonempty=True,
                ),
                [],
            )
        self.assertEqual(observed_counts, {2, 3, 4, 5})
        self.assertTrue(observed_partial)

    def test_generator_covers_six_twelve_and_contract_max_actions(self) -> None:
        rows = build_long_action_examples()
        observed_counts: dict[int, int] = {}
        for row in rows:
            message = row["prompt"][-1]["content"]
            expected = json.loads(row["completion"][0]["content"])
            count = len(expected["actions"])
            observed_counts[count] = observed_counts.get(count, 0) + 1
            self.assertIn("\n", message)
            self.assertNotIn("|", message)
            self.assertEqual(row_bucket(row), MULTI_ACTION_BUCKET)
            self.assertEqual(
                validate_envelope(
                    expected,
                    allowed_kinds=MODEL_ENABLED_KINDS,
                    source=message,
                    require_nonempty=True,
                ),
                [],
            )
        self.assertEqual(observed_counts, {6: 4, 12: 4, 25: 4})

    def test_template_family_split_is_deterministic_disjoint_and_keeps_multi_actions(self) -> None:
        products = [
            {"sku": "TEST-CHAIR-01", "nameAr": "كرسي", "supplier": "Factory A"},
            {"sku": "TEST-DESK-02", "nameAr": "مكتب", "supplier": "Factory B"},
        ]
        rows = build_multi_action_examples(products, count=24)
        first = split_by_template_family(rows, eval_target_rows=8, seed=17)
        second = split_by_template_family(rows, eval_target_rows=8, seed=17)
        train, evaluation, metadata = first
        self.assertEqual(
            [row_fingerprint(row) for row in train],
            [row_fingerprint(row) for row in second[0]],
        )
        self.assertEqual(
            [row_fingerprint(row) for row in evaluation],
            [row_fingerprint(row) for row in second[1]],
        )
        self.assertFalse(
            {template_family(row) for row in train} & {template_family(row) for row in evaluation}
        )
        self.assertEqual(metadata["overlapCount"], 0)
        self.assertTrue(all(row_bucket(row) == MULTI_ACTION_BUCKET for row in train + evaluation))

    def test_required_coverage_rejects_incomplete_training_slice(self) -> None:
        with self.assertRaisesRegex(ValueError, "CREATE_CLIENT"):
            sample_rows(
                self.rows,
                required_kinds={"CREATE_ORDER_BUNDLE", "CREATE_CLIENT"},
                require_abstention=True,
            )

        without_negatives = [row for row in self.rows if row_bucket(row) != ABSTENTION_BUCKET]
        with self.assertRaisesRegex(ValueError, "abstention"):
            sample_rows(
                without_negatives,
                required_kinds={"CREATE_ORDER_BUNDLE", "CREATE_TASK"},
                require_abstention=True,
            )

    def test_malformed_completion_is_rejected(self) -> None:
        with self.assertRaises(ValueError):
            sample_rows([{"completion": []}], policy=BALANCED_POLICY)


if __name__ == "__main__":
    unittest.main()
