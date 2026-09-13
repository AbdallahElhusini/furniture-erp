from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path
from typing import Any

import torch


LOCAL_AI_ROOT = Path(__file__).resolve().parents[1]
if str(LOCAL_AI_ROOT) not in sys.path:
    sys.path.insert(0, str(LOCAL_AI_ROOT))

from generation import (  # noqa: E402
    MAX_GENERATED_ACTIONS,
    MAX_GENERATION_SECONDS,
    MAX_NEW_TOKENS,
    generate_json_completion,
    generation_policy_metadata,
    scan_json_object,
)


class _Tokenizer:
    eos_token_id = 0

    def __init__(self, pieces: dict[int, str]) -> None:
        self.pieces = pieces

    def decode(self, token_ids: Any, **_kwargs: Any) -> str:
        if isinstance(token_ids, torch.Tensor):
            values = token_ids.detach().cpu().tolist()
        else:
            values = list(token_ids)
        return "".join(self.pieces.get(int(value), "") for value in values)


class _Model:
    def __init__(self, emitted: list[int]) -> None:
        self.emitted = emitted
        self.received: dict[str, Any] | None = None

    def generate(self, **kwargs: Any) -> torch.Tensor:
        self.received = kwargs
        sequence = kwargs["input_ids"].clone()
        stopping_criteria = kwargs["stopping_criteria"]
        for token in self.emitted[: kwargs["max_new_tokens"]]:
            next_token = torch.tensor([[token]], dtype=sequence.dtype, device=sequence.device)
            sequence = torch.cat((sequence, next_token), dim=1)
            if bool(stopping_criteria(sequence, None)[0].item()):
                break
        return sequence


class _IgnoringModel(_Model):
    def generate(self, **kwargs: Any) -> torch.Tensor:
        self.received = kwargs
        suffix = torch.tensor([self.emitted], dtype=kwargs["input_ids"].dtype)
        return torch.cat((kwargs["input_ids"], suffix), dim=1)


class _AdvancingClock:
    def __init__(self, values: list[float]) -> None:
        self.values = iter(values)
        self.last = values[-1]

    def __call__(self) -> float:
        self.last = next(self.values, self.last)
        return self.last


def _generate(pieces: list[str], **kwargs: Any):
    tokenizer = _Tokenizer({index + 1: piece for index, piece in enumerate(pieces)})
    model = _Model(list(range(1, len(pieces) + 1)))
    result = generate_json_completion(
        model,
        tokenizer,
        {"input_ids": torch.tensor([[999]], dtype=torch.long)},
        **kwargs,
    )
    return result, model


class JsonGenerationTests(unittest.TestCase):
    def test_policy_has_a_fixed_maximum_action_cpu_budget(self) -> None:
        self.assertEqual(MAX_GENERATED_ACTIONS, 25)
        self.assertEqual(MAX_NEW_TOKENS, 1024)
        self.assertEqual(MAX_GENERATION_SECONDS, 240.0)
        self.assertEqual(generation_policy_metadata()["maxActions"], 25)

    def test_stops_at_first_complete_top_level_object(self) -> None:
        payload = '{"actions":[],"unparsed":[]}'
        result, model = _generate(["  {", '"actions":[]', ',"unparsed":[]', "}", "prose"])
        self.assertEqual(result.text, "  " + payload)
        self.assertEqual(result.stop_reason, "complete_json")
        self.assertTrue(result.complete_json)
        self.assertFalse(result.truncated)
        self.assertEqual(result.generated_tokens, 4)
        self.assertEqual(model.received["max_new_tokens"], MAX_NEW_TOKENS)
        self.assertFalse(model.received["do_sample"])

    def test_does_not_rescue_prose_or_markdown_prefix(self) -> None:
        result, _ = _generate(["Result: ", '{"actions":[],"unparsed":[]}'])
        self.assertEqual(result.text, "Result: ")
        self.assertEqual(result.stop_reason, "invalid_prefix")
        self.assertFalse(result.complete_json)
        with self.assertRaises(json.JSONDecodeError):
            json.loads(result.text.strip())

    def test_same_token_trailing_content_remains_invalid(self) -> None:
        result, _ = _generate(['{"actions":[],"unparsed":[]} trailing'])
        self.assertEqual(result.stop_reason, "trailing_content")
        self.assertFalse(result.complete_json)
        self.assertFalse(result.truncated)
        with self.assertRaises(json.JSONDecodeError):
            json.loads(result.text.strip())

    def test_final_output_is_rechecked_if_backend_ignores_stop_signal(self) -> None:
        tokenizer = _Tokenizer({1: "{}", 2: " trailing"})
        model = _IgnoringModel([1, 2])
        result = generate_json_completion(
            model,
            tokenizer,
            {"input_ids": torch.tensor([[999]], dtype=torch.long)},
        )
        self.assertEqual(result.stop_reason, "trailing_content")
        self.assertFalse(result.complete_json)

    def test_nested_braces_quotes_and_escapes_do_not_stop_early(self) -> None:
        pieces = [
            '{"actions":[{"notes":"brace } and quote \\"',
            ' stays in string"}],',
            '"unparsed":[]}',
            "ignored",
        ]
        result, _ = _generate(pieces)
        self.assertEqual(result.stop_reason, "complete_json")
        self.assertEqual(result.generated_tokens, 3)
        self.assertEqual(json.loads(result.text)["unparsed"], [])

    def test_unclosed_object_hits_token_limit_and_is_marked_truncated(self) -> None:
        result, _ = _generate(["{"] + ['"x"'] * 10, max_new_tokens=3)
        self.assertEqual(result.stop_reason, "token_limit")
        self.assertEqual(result.generated_tokens, 3)
        self.assertTrue(result.truncated)
        self.assertFalse(result.complete_json)

    def test_model_stop_before_complete_object_is_marked_truncated(self) -> None:
        result, _ = _generate(['{"actions":'])
        self.assertEqual(result.stop_reason, "model_stop")
        self.assertTrue(result.truncated)

    def test_time_limit_is_fail_closed_and_reported(self) -> None:
        result, _ = _generate(
            ["{", '"actions"'],
            clock=_AdvancingClock([10.0, 251.0, 251.0]),
        )
        self.assertEqual(result.stop_reason, "time_limit")
        self.assertEqual(result.generated_tokens, 1)
        self.assertTrue(result.truncated)

    def test_balanced_but_invalid_json_fails_closed(self) -> None:
        result, _ = _generate(['{"actions":,}'], max_new_tokens=4)
        self.assertEqual(result.stop_reason, "invalid_json")
        self.assertFalse(result.complete_json)
        self.assertFalse(result.truncated)

    def test_scan_accepts_only_one_object_with_json_whitespace(self) -> None:
        self.assertEqual(scan_json_object(" \n{}\t").state, "complete")
        self.assertEqual(scan_json_object("[]").reason, "invalid_prefix")
        self.assertEqual(scan_json_object("{}{}").reason, "trailing_content")

    def test_callers_cannot_expand_the_hard_limits(self) -> None:
        with self.assertRaises(ValueError):
            _generate(["{}"], max_new_tokens=MAX_NEW_TOKENS + 1)
        with self.assertRaises(ValueError):
            _generate(["{}"], max_seconds=MAX_GENERATION_SECONDS + 1)


if __name__ == "__main__":
    unittest.main()
