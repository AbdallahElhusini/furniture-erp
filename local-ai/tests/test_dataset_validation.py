from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path


LOCAL_AI = Path(__file__).resolve().parents[1]
if str(LOCAL_AI) not in sys.path:
    sys.path.insert(0, str(LOCAL_AI))

from contract import MODEL_ENABLED_KINDS, contract_metadata, sha256_file  # noqa: E402
from dataset_validation import validate_dataset  # noqa: E402
from prompt import SYSTEM_PROMPT, prompt_sha256  # noqa: E402


def row(
    message: str,
    expected: dict[str, object],
    *,
    system_prompt: str = SYSTEM_PROMPT,
    family: str | None = None,
) -> dict[str, object]:
    value: dict[str, object] = {
        "prompt": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": message},
        ],
        "completion": [
            {"role": "assistant", "content": json.dumps(expected, ensure_ascii=False, separators=(",", ":"))},
        ],
    }
    if family is not None:
        value["metadata"] = {"templateFamily": family}
    return value


def write_jsonl(path: Path, rows: list[dict[str, object]]) -> None:
    path.write_text("".join(json.dumps(value, ensure_ascii=False) + "\n" for value in rows), encoding="utf-8")


class DatasetValidationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.base = Path(self.temp.name)
        self.train = self.base / "train.jsonl"
        self.eval = self.base / "eval.jsonl"
        self.manifest = self.base / "manifest.json"
        self.manifest_extras: dict[str, object] = {}
        self.train_rows = [
            row("ضيف عميل Ahmed هاتف 01000000001", {"actions": [{"kind": "CREATE_CLIENT", "name": "Ahmed", "phone": "01000000001"}], "unparsed": []}),
            row("عميل Sara هاتف 01000000002 مشروع HQ كود EXE-1 كمية 2", {"actions": [{"kind": "CREATE_ORDER_BUNDLE", "clientName": "Sara", "clientPhone": "01000000002", "projectTitle": "HQ", "productSku": "EXE-1", "quantity": 2}], "unparsed": []}),
            row("Update project 7 status to READY", {"actions": [{"kind": "UPDATE_PROJECT_STATUS", "projectRef": "7", "status": "READY"}], "unparsed": []}),
            row("اعمل مهمة مراجعة موعدها غدا أولوية عالية نوعها معاينة", {"actions": [{"kind": "CREATE_TASK", "title": "مراجعة", "dueDateText": "غدا", "priority": "HIGH", "taskType": "INSPECTION"}], "unparsed": []}),
            row("Add sku CHR-1 qty 2 to project 6", {"actions": [{"kind": "ADD_PROJECT_ITEM", "projectRef": "6", "productSku": "CHR-1", "quantity": 2}], "unparsed": []}),
            row("Update client 201 company to Acme Train", {"actions": [{"kind": "UPDATE_CLIENT", "clientRef": "201", "company": "Acme Train"}], "unparsed": []}),
            row("Delete client 202", {"actions": [{"kind": "DELETE_CLIENT", "clientRef": "202"}], "unparsed": []}),
            row("Update project 203 priority HIGH", {"actions": [{"kind": "UPDATE_PROJECT", "projectRef": "203", "priority": "HIGH"}], "unparsed": []}),
            row("Delete project 204", {"actions": [{"kind": "DELETE_PROJECT", "projectRef": "204"}], "unparsed": []}),
            row("Update SKU DESK-205 in project 205 quantity 3", {"actions": [{"kind": "UPDATE_PROJECT_ITEM", "projectRef": "205", "productSku": "DESK-205", "quantity": 3}], "unparsed": []}),
            row("Remove SKU CHR-206 from project 206", {"actions": [{"kind": "REMOVE_PROJECT_ITEM", "projectRef": "206", "productSku": "CHR-206"}], "unparsed": []}),
            row("Update task 207 status DONE", {"actions": [{"kind": "UPDATE_TASK", "taskRef": "207", "status": "DONE"}], "unparsed": []}),
            row("Delete task 208", {"actions": [{"kind": "DELETE_TASK", "taskRef": "208"}], "unparsed": []}),
            row("Update supplier order 209 status SHIPPED", {"actions": [{"kind": "UPDATE_SUPPLIER_ORDER_STATUS", "orderRef": "209", "status": "SHIPPED"}], "unparsed": []}),
        ]
        self.eval_rows = [
            row("اعمل مهمة قياس موعدها غدا أولوية عالية نوعها معاينة", {"actions": [{"kind": "CREATE_TASK", "title": "قياس", "dueDateText": "غدا", "priority": "HIGH", "taskType": "INSPECTION"}], "unparsed": []}),
            row("Add sku CHR-2 qty 3 to project 8", {"actions": [{"kind": "ADD_PROJECT_ITEM", "projectRef": "8", "productSku": "CHR-2", "quantity": 3}], "unparsed": []}),
            row("غير حالة المشروع", {"actions": [], "unparsed": ["غير حالة المشروع"]}),
            row("Create client Nader phone 01000000003", {"actions": [{"kind": "CREATE_CLIENT", "name": "Nader", "phone": "01000000003"}], "unparsed": []}),
            row("عميل Hoda هاتف 01000000004 مشروع Branch كود EXE-2 كمية 1", {"actions": [{"kind": "CREATE_ORDER_BUNDLE", "clientName": "Hoda", "clientPhone": "01000000004", "projectTitle": "Branch", "productSku": "EXE-2", "quantity": 1}], "unparsed": []}),
            row("غير حالة المشروع 8 إلى جاهز", {"actions": [{"kind": "UPDATE_PROJECT_STATUS", "projectRef": "8", "status": "READY"}], "unparsed": []}),
            row("Update client 301 company to Acme Eval", {"actions": [{"kind": "UPDATE_CLIENT", "clientRef": "301", "company": "Acme Eval"}], "unparsed": []}),
            row("Delete client 302", {"actions": [{"kind": "DELETE_CLIENT", "clientRef": "302"}], "unparsed": []}),
            row("Update project 303 priority URGENT", {"actions": [{"kind": "UPDATE_PROJECT", "projectRef": "303", "priority": "URGENT"}], "unparsed": []}),
            row("Delete project 304", {"actions": [{"kind": "DELETE_PROJECT", "projectRef": "304"}], "unparsed": []}),
            row("Update SKU DESK-305 in project 305 quantity 4", {"actions": [{"kind": "UPDATE_PROJECT_ITEM", "projectRef": "305", "productSku": "DESK-305", "quantity": 4}], "unparsed": []}),
            row("Remove SKU CHR-306 from project 306", {"actions": [{"kind": "REMOVE_PROJECT_ITEM", "projectRef": "306", "productSku": "CHR-306"}], "unparsed": []}),
            row("Update task 307 status IN_PROGRESS", {"actions": [{"kind": "UPDATE_TASK", "taskRef": "307", "status": "IN_PROGRESS"}], "unparsed": []}),
            row("Delete task 308", {"actions": [{"kind": "DELETE_TASK", "taskRef": "308"}], "unparsed": []}),
            row("Update supplier order 309 status DELIVERED", {"actions": [{"kind": "UPDATE_SUPPLIER_ORDER_STATUS", "orderRef": "309", "status": "DELIVERED"}], "unparsed": []}),
        ]
        self._write()

    def tearDown(self) -> None:
        self.temp.cleanup()

    def _write(self) -> None:
        write_jsonl(self.train, self.train_rows)
        write_jsonl(self.eval, self.eval_rows)
        manifest = {
            "trainRows": len(self.train_rows),
            "evalRows": len(self.eval_rows),
            "trainSha256": sha256_file(self.train),
            "evalSha256": sha256_file(self.eval),
            **contract_metadata(),
            "promptSha256": prompt_sha256(),
            **self.manifest_extras,
        }
        self.manifest.write_text(json.dumps(manifest), encoding="utf-8")

    def _validate(self) -> dict[str, object]:
        return validate_dataset(
            self.train,
            self.eval,
            manifest_path=self.manifest,
            allowed_kinds=MODEL_ENABLED_KINDS,
            required_coverage=MODEL_ENABLED_KINDS,
        )

    def test_clean_dataset_passes_contract_coverage_and_leakage_checks(self) -> None:
        report = self._validate()
        self.assertTrue(report["valid"], report["errors"])
        self.assertEqual(report["missingCoverage"], [])
        self.assertEqual(report["leakage"]["crossSplitMessageCount"], 0)

    def test_prompt_drift_is_detected(self) -> None:
        self.eval_rows[0] = row(
            "اعمل مهمة قياس موعدها غدا أولوية عالية نوعها معاينة",
            {"actions": [{"kind": "CREATE_TASK", "title": "قياس", "dueDateText": "غدا", "priority": "HIGH", "taskType": "INSPECTION"}], "unparsed": []},
            system_prompt="legacy prompt",
        )
        self._write()
        report = self._validate()
        self.assertFalse(report["valid"])
        self.assertTrue(any(error.startswith("row.system_prompt_drift") for error in report["errors"]))

    def test_cross_split_leakage_is_detected(self) -> None:
        self.eval_rows.append(self.train_rows[0])
        self._write()
        report = self._validate()
        self.assertFalse(report["valid"])
        self.assertTrue(any(error.startswith("dataset.cross_split_message_leakage") for error in report["errors"]))

    def test_family_disjoint_manifest_is_verified_against_rows(self) -> None:
        self.train_rows = [
            ({**value, "metadata": {"templateFamily": f"train-family-{index}"}})
            for index, value in enumerate(self.train_rows, 1)
        ]
        self.eval_rows = [
            ({**value, "metadata": {"templateFamily": f"eval-family-{index}"}})
            for index, value in enumerate(self.eval_rows, 1)
        ]
        self.train_rows[0] = row(
            "ضيف عميل Ahmed هاتف 01000000001 ثم حدث المشروع 90 إلى READY",
            {
                "actions": [
                    {"kind": "CREATE_CLIENT", "name": "Ahmed", "phone": "01000000001"},
                    {"kind": "UPDATE_PROJECT_STATUS", "projectRef": "90", "status": "READY"},
                ],
                "unparsed": [],
            },
            family="train-family-1",
        )
        self.eval_rows[0] = row(
            "اعمل مهمة قياس موعدها غدا أولوية عالية نوعها معاينة ثم أضف CHR-9 عدد 2 للمشروع 91",
            {
                "actions": [
                    {"kind": "CREATE_TASK", "title": "قياس", "dueDateText": "غدا", "priority": "HIGH", "taskType": "INSPECTION"},
                    {"kind": "ADD_PROJECT_ITEM", "projectRef": "91", "productSku": "CHR-9", "quantity": 2},
                ],
                "unparsed": [],
            },
            family="eval-family-1",
        )
        train_families = sorted(value["metadata"]["templateFamily"] for value in self.train_rows)
        eval_families = sorted(value["metadata"]["templateFamily"] for value in self.eval_rows)
        self.manifest_extras = {
            "splitPolicy": "template-family-disjoint-stratified-seeded",
            "splitMetadata": {
                "policy": "template-family-disjoint-stratified-seeded",
                "evalTargetRows": len(self.eval_rows),
                "evalActualRows": len(self.eval_rows),
                "trainFamilyCount": len(train_families),
                "evalFamilyCount": len(eval_families),
                "overlapCount": 0,
                "trainFamilies": train_families,
                "evalFamilies": eval_families,
            },
        }
        self._write()
        report = self._validate()
        self.assertTrue(report["valid"], report["errors"])
        self.assertGreaterEqual(report["splits"]["train"]["multiActionRows"], 1)
        self.assertGreaterEqual(report["splits"]["eval"]["multiActionRows"], 1)
        self.assertEqual(report["leakage"]["crossSplitTemplateFamilyCount"], 0)

        self.eval_rows[0]["metadata"] = {"templateFamily": "train-family-1"}
        self._write()
        leaked = self._validate()
        self.assertFalse(leaked["valid"])
        self.assertTrue(
            any(error.startswith("dataset.cross_split_template_family_leakage") for error in leaked["errors"]),
            leaked["errors"],
        )


if __name__ == "__main__":
    unittest.main()
