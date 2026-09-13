from __future__ import annotations

import json
import time
from dataclasses import dataclass
from typing import Any, Callable, Literal


# The operation envelope advertises up to 25 actions. Keep the generation
# policy aligned with that public contract while retaining hard CPU/runtime
# bounds for a malformed or non-closing completion.
MAX_GENERATED_ACTIONS = 25
MAX_NEW_TOKENS = 1024
# Long batches are intentionally formatted as one short command per line. A
# four-minute ceiling is finite, accommodates the 25-action CPU case, and is
# mirrored by the web client and HTTP evaluation timeouts.
MAX_GENERATION_SECONDS = 240.0

ScanState = Literal["incomplete", "complete", "invalid"]
StopReason = Literal[
    "complete_json",
    "invalid_prefix",
    "invalid_json",
    "trailing_content",
    "time_limit",
    "token_limit",
    "model_stop",
]


@dataclass(frozen=True)
class JsonObjectScan:
    state: ScanState
    reason: StopReason | None = None


@dataclass(frozen=True)
class JsonGenerationResult:
    text: str
    stop_reason: StopReason
    generated_tokens: int
    max_new_tokens: int
    elapsed_ms: int
    complete_json: bool
    truncated: bool

    def metadata(self) -> dict[str, Any]:
        return {
            "stopReason": self.stop_reason,
            "generatedTokens": self.generated_tokens,
            "maxNewTokens": self.max_new_tokens,
            "elapsedMs": self.elapsed_ms,
            "completeJson": self.complete_json,
            "truncated": self.truncated,
        }


def generation_policy_metadata() -> dict[str, Any]:
    return {
        "schema": "hatab-json-generation-v1",
        "maxActions": MAX_GENERATED_ACTIONS,
        "maxNewTokens": MAX_NEW_TOKENS,
        "maxSeconds": MAX_GENERATION_SECONDS,
        "stopAtCompleteTopLevelObject": True,
        "rejectNonJsonPrefix": True,
    }


def scan_json_object(text: str) -> JsonObjectScan:
    """Classify a completion without extracting or repairing embedded JSON.

    Leading/trailing JSON whitespace is accepted because the production parser
    strips it.  Any prose/Markdown prefix or content emitted in the same token
    after the object is invalid and is retained for the strict parser to reject.
    """

    start = 0
    while start < len(text) and text[start].isspace():
        start += 1
    if start == len(text):
        return JsonObjectScan("incomplete")
    if text[start] != "{":
        return JsonObjectScan("invalid", "invalid_prefix")

    depth = 0
    in_string = False
    escaped = False
    for index in range(start, len(text)):
        character = text[index]
        if in_string:
            if escaped:
                escaped = False
            elif character == "\\":
                escaped = True
            elif character == '"':
                in_string = False
            continue

        if character == '"':
            in_string = True
        elif character == "{":
            depth += 1
        elif character == "}":
            depth -= 1
            if depth < 0:
                return JsonObjectScan("invalid", "invalid_json")
            if depth == 0:
                if text[index + 1 :].strip():
                    return JsonObjectScan("invalid", "trailing_content")
                try:
                    value = json.loads(text.strip())
                except json.JSONDecodeError:
                    return JsonObjectScan("invalid", "invalid_json")
                if not isinstance(value, dict):
                    return JsonObjectScan("invalid", "invalid_json")
                return JsonObjectScan("complete", "complete_json")

    return JsonObjectScan("incomplete")


class _CompleteJsonStoppingCriteria:
    def __init__(
        self,
        *,
        tokenizer: Any,
        prompt_tokens: int,
        max_new_tokens: int,
        deadline: float,
        clock: Callable[[], float],
    ) -> None:
        self.tokenizer = tokenizer
        self.prompt_tokens = prompt_tokens
        self.max_new_tokens = max_new_tokens
        self.deadline = deadline
        self.clock = clock
        self.stop_reason: StopReason | None = None

    def __call__(
        self,
        input_ids: Any,
        _scores: Any,
        **_kwargs: Any,
    ) -> Any:
        import torch

        if input_ids.shape[0] != 1:
            raise ValueError("HATAB JSON generation only supports one prompt at a time")
        generated = input_ids[0, self.prompt_tokens :]
        text = self.tokenizer.decode(generated, skip_special_tokens=True)
        scan = scan_json_object(text)
        reason: StopReason | None = scan.reason if scan.state != "incomplete" else None
        if reason is None and self.clock() >= self.deadline:
            reason = "time_limit"
        if reason is None and generated.shape[0] >= self.max_new_tokens:
            reason = "token_limit"
        if reason is not None:
            self.stop_reason = reason
        return torch.tensor([reason is not None], device=input_ids.device, dtype=torch.bool)


def generate_json_completion(
    model: Any,
    tokenizer: Any,
    encoded: dict[str, Any],
    *,
    max_new_tokens: int = MAX_NEW_TOKENS,
    max_seconds: float = MAX_GENERATION_SECONDS,
    clock: Callable[[], float] = time.perf_counter,
) -> JsonGenerationResult:
    """Generate one strict JSON object under the shared evaluation/runtime policy."""

    # Keep evaluation dataset/contract preflight lightweight.  These heavy
    # dependencies are loaded only when generation actually begins.
    import torch
    from transformers import StoppingCriteriaList

    if not isinstance(max_new_tokens, int) or isinstance(max_new_tokens, bool):
        raise ValueError("max_new_tokens must be an integer")
    if max_new_tokens < 1 or max_new_tokens > MAX_NEW_TOKENS:
        raise ValueError(f"max_new_tokens must be between 1 and {MAX_NEW_TOKENS}")
    if not isinstance(max_seconds, (int, float)) or isinstance(max_seconds, bool):
        raise ValueError("max_seconds must be a number")
    if max_seconds <= 0 or max_seconds > MAX_GENERATION_SECONDS:
        raise ValueError(f"max_seconds must be greater than 0 and at most {MAX_GENERATION_SECONDS}")

    input_ids = encoded.get("input_ids")
    if not isinstance(input_ids, torch.Tensor) or input_ids.ndim != 2 or input_ids.shape[0] != 1:
        raise ValueError("encoded input_ids must contain exactly one tokenized prompt")
    prompt_tokens = int(input_ids.shape[1])
    started = clock()
    stopper = _CompleteJsonStoppingCriteria(
        tokenizer=tokenizer,
        prompt_tokens=prompt_tokens,
        max_new_tokens=max_new_tokens,
        deadline=started + float(max_seconds),
        clock=clock,
    )
    generation_args: dict[str, Any] = {
        **encoded,
        "max_new_tokens": max_new_tokens,
        "do_sample": False,
        "stopping_criteria": StoppingCriteriaList([stopper]),
    }
    eos_token_id = getattr(tokenizer, "eos_token_id", None)
    if eos_token_id is not None:
        generation_args["pad_token_id"] = eos_token_id

    with torch.inference_mode():
        output = model.generate(**generation_args)
    elapsed_ms = round((clock() - started) * 1000)
    if not isinstance(output, torch.Tensor) or output.ndim != 2 or output.shape[0] != 1:
        raise RuntimeError("Model generation returned an invalid token tensor")
    if output.shape[1] < prompt_tokens:
        raise RuntimeError("Model generation returned fewer tokens than the prompt")
    generated = output[0, prompt_tokens:]
    generated_tokens = int(generated.shape[0])
    text = tokenizer.decode(generated, skip_special_tokens=True)
    scan = scan_json_object(text)

    # Re-classify the final bytes instead of blindly trusting the callback.
    # This stays fail-closed even with a non-conforming generation backend that
    # ignores a stopping signal and appends content after a valid object.
    if scan.state == "invalid":
        reason = scan.reason or "invalid_json"
    elif scan.state == "complete":
        reason = "complete_json"
    elif stopper.stop_reason is not None:
        reason = stopper.stop_reason
    elif generated_tokens >= max_new_tokens:
        reason = "token_limit"
    else:
        reason = "model_stop"
    complete_json = scan.state == "complete" and reason == "complete_json"
    truncated = not complete_json and reason in {"time_limit", "token_limit", "model_stop"}
    return JsonGenerationResult(
        text=text,
        stop_reason=reason,
        generated_tokens=generated_tokens,
        max_new_tokens=max_new_tokens,
        elapsed_ms=elapsed_ms,
        complete_json=complete_json,
        truncated=truncated,
    )
