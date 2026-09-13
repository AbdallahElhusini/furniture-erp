from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path


LOCAL_AI = Path(__file__).resolve().parents[1]
if str(LOCAL_AI) not in sys.path:
    sys.path.insert(0, str(LOCAL_AI))

from contract import MODEL_ENABLED_KINDS, REGISTERED_KINDS, validate_envelope  # noqa: E402
from evaluation_core import (  # noqa: E402
    PROMOTION_MINIMUM_ABSTENTION_RATE,
    PROMOTION_MINIMUM_EXACT_RATE,
    PROMOTION_MINIMUM_KIND_RATE,
    evaluation_report,
    golden_fixture_identity,
    model_eligible,
    promotion_gates,
    parse_json_object,
    read_jsonl,
    score_case,
    validate_contract_cases,
    validate_golden_cases,
)
from evaluate_adapter import require_safe_promotion_evaluation  # noqa: E402
from prompt import SYSTEM_PROMPT, build_base_system_prompt, prompt_sha256  # noqa: E402


class ContractTests(unittest.TestCase):
    def test_contract_has_registered_and_gated_model_kinds(self) -> None:
        self.assertEqual(len(REGISTERED_KINDS), 14)
        self.assertEqual(MODEL_ENABLED_KINDS, REGISTERED_KINDS)

    def test_runtime_prompt_only_advertises_model_enabled_kinds(self) -> None:
        for kind in MODEL_ENABLED_KINDS:
            self.assertIn(f"{kind}{{", SYSTEM_PROMPT)
        for kind in REGISTERED_KINDS - MODEL_ENABLED_KINDS:
            self.assertNotIn(f"{kind}{{", SYSTEM_PROMPT)
        self.assertEqual(SYSTEM_PROMPT, build_base_system_prompt(MODEL_ENABLED_KINDS))
        self.assertIn("Read the whole message left-to-right", SYSTEM_PROMPT)
        self.assertIn("up to 25 actions", SYSTEM_PROMPT)
        self.assertIn("Large batches should use one command per line", SYSTEM_PROMPT)
        self.assertIn("Copy each ambiguous, bulk-destructive, unsupported, incomplete, or unlisted clause verbatim", SYSTEM_PROMPT)
        self.assertIn("Never invent, translate, merge, drop, explain, or execute", SYSTEM_PROMPT)
        self.assertEqual(len(prompt_sha256()), 64)

    def test_every_registered_action_is_enabled_at_model_boundary(self) -> None:
        value = {
            "actions": [{"kind": "DELETE_TASK", "taskRef": "4"}],
            "unparsed": [],
        }
        self.assertEqual(validate_envelope(value, allowed_kinds=MODEL_ENABLED_KINDS), [])

        unsupported = {"actions": [{"kind": "UPDATE_PRICE", "productSku": "A-1"}], "unparsed": []}
        errors = validate_envelope(unsupported, allowed_kinds=MODEL_ENABLED_KINDS)
        self.assertTrue(any(error.startswith("action.unsupported_kind") for error in errors))

    def test_extra_field_and_empty_patch_are_rejected(self) -> None:
        extra = {
            "actions": [{
                "kind": "UPDATE_PROJECT_ITEM",
                "projectRef": "5",
                "productSku": "EXE-0001",
                "quantity": 4,
                "supplierQuery": "none",
            }],
            "unparsed": [],
        }
        empty_patch = {
            "actions": [{"kind": "UPDATE_CLIENT", "clientRef": "4"}],
            "unparsed": [],
        }
        self.assertTrue(any(error.startswith("action.extra_field") for error in validate_envelope(extra)))
        self.assertTrue(any(error.startswith("action.missing_patch") for error in validate_envelope(empty_patch)))

    def test_grounded_fields_reject_invented_optional_values_and_placeholders(self) -> None:
        source = "Create client Mona phone 01011112222"
        invented = {
            "actions": [{
                "kind": "CREATE_CLIENT",
                "name": "Mona",
                "phone": "01011112222",
                "company": "Acme",
            }],
            "unparsed": [],
        }
        errors = validate_envelope(invented, allowed_kinds=MODEL_ENABLED_KINDS, source=source)
        self.assertIn("action.ungrounded_field:actions[0].company", errors)

        placeholder = {
            "actions": [{
                "kind": "CREATE_CLIENT",
                "name": "Mona",
                "phone": "01011112222",
                "notes": "none",
            }],
            "unparsed": [],
        }
        errors = validate_envelope(placeholder, allowed_kinds=MODEL_ENABLED_KINDS, source=source)
        self.assertIn("action.placeholder_value:actions[0].notes", errors)

    def test_grounding_uses_token_boundaries_not_numeric_substrings(self) -> None:
        value = {
            "actions": [{
                "kind": "ADD_PROJECT_ITEM",
                "projectRef": "12",
                "productSku": "CHR-9",
                "quantity": 2,
            }],
            "unparsed": [],
        }
        source = "Add SKU CHR-9 to project 12 and call 01022222222"
        errors = validate_envelope(value, allowed_kinds=MODEL_ENABLED_KINDS, source=source)
        self.assertIn("action.ungrounded_field:actions[0].quantity", errors)

    def test_arabic_digits_and_declared_enum_aliases_are_grounded(self) -> None:
        value = {
            "actions": [{
                "kind": "UPDATE_PROJECT_STATUS",
                "projectRef": "7",
                "status": "IN_PRODUCTION",
            }],
            "unparsed": [],
        }
        self.assertEqual(
            validate_envelope(
                value,
                allowed_kinds=MODEL_ENABLED_KINDS,
                source="غير حالة المشروع ٧ إلى قيد التصنيع",
            ),
            [],
        )

    def test_commercial_amounts_require_explicit_grounded_numbers(self) -> None:
        value = {
            "actions": [{
                "kind": "CREATE_ORDER_BUNDLE",
                "clientName": "أحمد",
                "clientPhone": "01012345678",
                "projectTitle": "طلب كنبة",
                "productSku": "SOF-101",
                "quantity": 1,
                "unitPrice": 40_000,
                "unitCost": 25_000,
            }],
            "unparsed": [],
        }
        source = (
            "ضيف عميل أحمد هاتف 01012345678 مشروع طلب كنبة كود SOF-101 كمية 1 "
            "سعر البيع 40,000 وسعر التكلفة ٢٥٠٠٠"
        )
        self.assertEqual(validate_envelope(value, source=source), [])
        value["actions"][0]["unitCost"] = 20_000
        self.assertIn(
            "action.ungrounded_field:actions[0].unitCost",
            validate_envelope(value, source=source),
        )

    def test_nullable_field_requires_clear_intent_for_that_field(self) -> None:
        value = {
            "actions": [{"kind": "UPDATE_CLIENT", "clientRef": "4", "company": None}],
            "unparsed": [],
        }
        self.assertEqual(
            validate_envelope(value, source="امسح شركة العميل 4"),
            [],
        )
        errors = validate_envelope(value, source="عدل العميل 4")
        self.assertIn("action.ungrounded_field:actions[0].company", errors)


class GoldenEvaluationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.golden = read_jsonl(LOCAL_AI / "data" / "golden-evaluation.v2.jsonl")
        cls.contract_cases = read_jsonl(LOCAL_AI / "data" / "golden-contract-cases.v2.jsonl")

    def test_golden_suite_is_valid_and_covers_every_kind(self) -> None:
        result = validate_golden_cases(self.golden)
        self.assertTrue(result["valid"], result["errors"])
        self.assertEqual(result["missingRegisteredCoverage"], [])
        self.assertGreater(result["languageDistribution"]["ar"], 0)
        self.assertGreater(result["languageDistribution"]["en"], 0)
        self.assertGreater(result["languageDistribution"]["mixed"], 0)
        self.assertGreater(result["categoryDistribution"]["ambiguity"], 0)
        self.assertGreater(result["categoryDistribution"]["safety"], 0)

    def test_negative_contract_fixture_matches_validator(self) -> None:
        result = validate_contract_cases(self.contract_cases)
        self.assertTrue(result["valid"], result["failures"])

    def test_perfect_predictions_pass_all_metrics(self) -> None:
        selected = self.golden[:8]
        predictions = {case["id"]: json.loads(json.dumps(case["expected"], ensure_ascii=False)) for case in selected}
        report = evaluation_report(selected, predictions)
        self.assertEqual(report["metrics"]["contractValidRate"], 1.0)
        self.assertEqual(report["metrics"]["actionKindsExactRate"], 1.0)
        self.assertEqual(report["metrics"]["exactMatchRate"], 1.0)
        self.assertEqual(report["metrics"]["meanFieldF1"], 1.0)

    def test_multi_action_gate_requires_every_linked_workflow_to_match(self) -> None:
        selected = [case for case in self.golden if len(case["expected"]["actions"]) >= 2]
        self.assertGreaterEqual(len(selected), 3)
        self.assertEqual({case["language"] for case in selected}, {"ar", "en", "mixed"})
        predictions = {case["id"]: case["expected"] for case in selected}
        perfect = evaluation_report(selected, predictions, allowed_kinds=MODEL_ENABLED_KINDS)
        self.assertEqual(perfect["metrics"]["multiActionExactRate"], 1.0)
        self.assertTrue(promotion_gates(perfect["metrics"])["multiActionExactRate"])

        first = selected[0]
        predictions[first["id"]] = {
            "actions": first["expected"]["actions"][:-1],
            "unparsed": first["expected"]["unparsed"],
        }
        imperfect = evaluation_report(selected, predictions, allowed_kinds=MODEL_ENABLED_KINDS)
        self.assertLess(imperfect["metrics"]["multiActionExactRate"], 1.0)
        self.assertFalse(promotion_gates(imperfect["metrics"])["multiActionExactRate"])

    def test_evaluator_marks_hallucinated_grounded_field_contract_invalid(self) -> None:
        case = {
            "id": "adversarial-invented-company",
            "language": "en",
            "category": "supported",
            "message": "Create client Mona phone 01011112222",
            "expected": {
                "actions": [{"kind": "CREATE_CLIENT", "name": "Mona", "phone": "01011112222"}],
                "unparsed": [],
            },
        }
        prediction = {
            "actions": [{
                "kind": "CREATE_CLIENT",
                "name": "Mona",
                "phone": "01011112222",
                "company": "Acme",
            }],
            "unparsed": [],
        }
        result = score_case(case, prediction, allowed_kinds=MODEL_ENABLED_KINDS)
        self.assertFalse(result["contractValid"])
        self.assertIn("action.ungrounded_field:actions[0].company", result["contractErrors"])

    def test_model_completion_must_be_exactly_one_json_object(self) -> None:
        payload = '{"actions":[],"unparsed":["unsupported"]}'
        self.assertIsNotNone(parse_json_object(payload))
        self.assertIsNone(parse_json_object(f"Result: {payload}"))
        self.assertIsNone(parse_json_object(f"```json\n{payload}\n```"))
        self.assertIsNone(parse_json_object(f"{payload}\n{payload}"))

    def test_golden_identity_binds_exact_model_scope(self) -> None:
        path = LOCAL_AI / "data" / "golden-evaluation.v2.jsonl"
        identity = golden_fixture_identity(path, self.golden)
        expected_ids = sorted(case["id"] for case in self.golden if model_eligible(case))
        self.assertEqual(identity["goldenTotalCaseCount"], len(self.golden))
        self.assertEqual(identity["goldenEligibleCaseCount"], len(expected_ids))
        self.assertEqual(identity["goldenEligibleCaseIds"], expected_ids)
        self.assertEqual(len(identity["goldenFixtureSha256"]), 64)
        self.assertEqual(len(identity["goldenSemanticSha256"]), 64)

    def test_promotion_evaluation_rejects_diagnostic_subsets_and_threshold_overrides(self) -> None:
        safe = {
            "golden": LOCAL_AI / "data" / "golden-evaluation.v2.jsonl",
            "limit": 0,
            "selected_kinds": set(),
            "natural_only": False,
            "allow_disabled": False,
            "minimum_kind_rate": PROMOTION_MINIMUM_KIND_RATE,
            "minimum_exact_rate": PROMOTION_MINIMUM_EXACT_RATE,
            "minimum_abstention_rate": PROMOTION_MINIMUM_ABSTENTION_RATE,
        }
        require_safe_promotion_evaluation(**safe)
        for override in (
            {"limit": 1},
            {"selected_kinds": {"CREATE_TASK"}},
            {"natural_only": True},
            {"allow_disabled": True},
            {"golden": None},
            {"minimum_exact_rate": 0.0},
        ):
            with self.subTest(override=override):
                with self.assertRaises(ValueError):
                    require_safe_promotion_evaluation(**(safe | override))


if __name__ == "__main__":
    unittest.main()
