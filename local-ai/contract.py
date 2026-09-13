from __future__ import annotations

import hashlib
import json
import math
import re
import unicodedata
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable, Mapping, Sequence


CONTRACT_PATH = Path(__file__).resolve().parents[1] / "contracts" / "admin-assistant-operations.v2.json"
SUPPORTED_FIELD_TYPES = {"string", "reference", "integer", "number", "enum"}

# Canonical enum values may be emitted when the user wrote one of these exact
# bilingual aliases. These are deliberately finite: fuzzy matching or semantic
# guessing would turn the grounding check into another hallucination surface.
ENUM_GROUNDING_ALIASES: Mapping[str, tuple[str, ...]] = {
    "LOW": ("low", "منخفض", "منخفضة"),
    "MEDIUM": ("medium", "متوسط", "متوسطة"),
    "HIGH": ("high", "عالي", "عالية"),
    "URGENT": ("urgent", "عاجل", "عاجلة"),
    "LEAD": ("lead", "prospect", "عميل محتمل"),
    "INSPECTION": ("inspection", "معاينة"),
    "DESIGNING": ("designing", "in design", "قيد التصميم", "تصميم"),
    "PENDING_APPROVAL": (
        "pending_approval", "pending approval", "pending-approval",
        "بانتظار الاعتماد", "في انتظار الاعتماد",
    ),
    "APPROVED": ("approved", "معتمد", "تم الاعتماد"),
    "IN_PRODUCTION": (
        "in_production", "in production", "in-production", "قيد التصنيع",
    ),
    "READY": ("ready", "جاهز", "جاهزة"),
    "INSTALLING": ("installing", "in installation", "قيد التركيب", "مرحلة التركيب", "تركيب"),
    "COMPLETED": ("completed", "complete", "مكتمل", "مكتملة", "منتهي", "منتهى"),
    "CANCELLED": ("cancelled", "canceled", "ملغي", "ملغى", "ملغية"),
    "SUPPLIER_FOLLOWUP": (
        "supplier_followup", "supplier followup", "supplier follow-up",
        "متابعة مورد", "متابعة المورد",
    ),
    "DESIGN": ("design", "تصميم"),
    "INSTALLATION": ("installation", "تركيب"),
    "DELIVERY": ("delivery", "توصيل", "تسليم"),
    "GENERAL": ("general", "عام", "عامة"),
    "PENDING": ("pending", "معلق", "معلّق", "قيد الانتظار"),
    "ORDERED": ("ordered", "تم الطلب"),
    "DELIVERED": ("delivered", "تم التسليم", "تم التوصيل"),
    "INSTALLED": ("installed", "تم التركيب"),
    "TODO": ("todo", "to do", "new", "جديد", "جديدة"),
    "IN_PROGRESS": ("in_progress", "in progress", "in-progress", "قيد التنفيذ", "جاري", "جار"),
    "DONE": ("done", "مكتمل", "مكتملة", "تمت"),
    "CONFIRMED": ("confirmed", "مؤكد", "مؤكدة"),
    "SHIPPED": ("shipped", "تم الشحن"),
}

PLACEHOLDER_VALUES = frozenset({
    "-", "--", "—", "?", "n/a", "na", "none", "null", "tbd", "unknown",
    "not provided", "غير متاح", "غير معروف", "غير محدد",
})

CLEAR_INTENT_ALIASES = (
    "clear", "remove", "delete", "erase", "unset",
    "امسح", "احذف", "ازل", "أزل", "إزالة", "افرغ", "أفرغ",
    "وامسح", "واحذف", "وازال", "وأزال", "وازاله", "وإزالة", "وافرغ", "وأفرغ",
    "خلي فارغ", "وخلي فارغ", "خليه فاضي", "وخليه فاضي", "بدون", "وبدون",
)

NULLABLE_FIELD_ALIASES: Mapping[str, tuple[str, ...]] = {
    "company": ("company", "الشركة", "شركة"),
    "email": ("email", "e-mail", "البريد", "الايميل", "الإيميل"),
    "address": ("address", "العنوان", "عنوان"),
    "notes": ("notes", "note", "الملاحظات", "ملاحظات"),
    "estimatedDelivery": (
        "estimated delivery", "delivery estimate", "موعد التسليم المتوقع", "التسليم المتوقع",
    ),
    "description": ("description", "الوصف", "وصف"),
}


class ContractDefinitionError(RuntimeError):
    """The checked-in operation contract is missing or internally inconsistent."""


class ContractValidationError(ValueError):
    def __init__(self, errors: Sequence[str]):
        self.errors = tuple(errors)
        super().__init__("; ".join(self.errors))


@dataclass(frozen=True)
class ContractInfo:
    path: Path
    value: Mapping[str, Any]
    operations: Mapping[str, Mapping[str, Any]]
    semantic_sha256: str
    file_sha256: str

    @property
    def schema_version(self) -> str:
        return str(self.value["schemaVersion"])

    @property
    def contract_version(self) -> int:
        return int(self.value["contractVersion"])

    @property
    def registered_kinds(self) -> frozenset[str]:
        return frozenset(self.operations)

    @property
    def model_enabled_kinds(self) -> frozenset[str]:
        return frozenset(
            kind for kind, operation in self.operations.items() if operation["modelEnabled"] is True
        )


def _canonical_bytes(value: Any) -> bytes:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _definition_error(message: str) -> None:
    raise ContractDefinitionError(message)


def load_contract(path: Path = CONTRACT_PATH) -> ContractInfo:
    resolved = path.resolve()
    if not resolved.is_file():
        _definition_error(f"Assistant operation contract not found: {resolved}")
    try:
        value = json.loads(resolved.read_text(encoding="utf-8"))
    except json.JSONDecodeError as error:
        raise ContractDefinitionError(f"Invalid contract JSON at {resolved}: {error}") from error
    if not isinstance(value, dict):
        _definition_error("Assistant operation contract must be a JSON object")
    if not isinstance(value.get("schemaVersion"), str) or not value["schemaVersion"].strip():
        _definition_error("Contract schemaVersion must be a non-empty string")
    if not isinstance(value.get("contractVersion"), int) or isinstance(value["contractVersion"], bool):
        _definition_error("Contract contractVersion must be an integer")
    envelope = value.get("envelope")
    if not isinstance(envelope, dict):
        _definition_error("Contract envelope must be an object")
    if envelope.get("required") != ["actions", "unparsed"]:
        _definition_error("Contract envelope.required must be ['actions', 'unparsed']")
    if envelope.get("additionalProperties") is not False:
        _definition_error("Contract envelope must forbid additional properties")
    operations_value = value.get("operations")
    if not isinstance(operations_value, list) or not operations_value:
        _definition_error("Contract operations must be a non-empty array")

    operations: dict[str, Mapping[str, Any]] = {}
    for index, raw_operation in enumerate(operations_value):
        if not isinstance(raw_operation, dict):
            _definition_error(f"operations[{index}] must be an object")
        kind = raw_operation.get("kind")
        if not isinstance(kind, str) or not kind.strip():
            _definition_error(f"operations[{index}].kind must be a non-empty string")
        if kind in operations:
            _definition_error(f"Duplicate operation kind: {kind}")
        if not isinstance(raw_operation.get("modelEnabled"), bool):
            _definition_error(f"{kind}.modelEnabled must be boolean")
        fields = raw_operation.get("fields")
        if not isinstance(fields, dict):
            _definition_error(f"{kind}.fields must be an object")
        if "kind" in fields:
            _definition_error(f"{kind}.fields must not redefine the discriminator 'kind'")
        for field_name, raw_field in fields.items():
            if not isinstance(field_name, str) or not field_name:
                _definition_error(f"{kind} contains an invalid field name")
            if not isinstance(raw_field, dict):
                _definition_error(f"{kind}.{field_name} must be an object")
            field_type = raw_field.get("type")
            if field_type not in SUPPORTED_FIELD_TYPES:
                _definition_error(f"{kind}.{field_name} has unsupported type: {field_type!r}")
            if not isinstance(raw_field.get("required"), bool):
                _definition_error(f"{kind}.{field_name}.required must be boolean")
            if not isinstance(raw_field.get("grounded"), bool):
                _definition_error(f"{kind}.{field_name}.grounded must be boolean")
            if field_type == "enum":
                values = raw_field.get("values")
                if not isinstance(values, list) or not values or not all(isinstance(item, str) for item in values):
                    _definition_error(f"{kind}.{field_name}.values must be a non-empty string array")
            if field_type in {"integer", "number"}:
                minimum, maximum = raw_field.get("minimum"), raw_field.get("maximum")
                boundary_types = (int,) if field_type == "integer" else (int, float)
                if minimum is not None and (not isinstance(minimum, boundary_types) or isinstance(minimum, bool)):
                    _definition_error(f"{kind}.{field_name}.minimum must be numeric")
                if maximum is not None and (not isinstance(maximum, boundary_types) or isinstance(maximum, bool)):
                    _definition_error(f"{kind}.{field_name}.maximum must be numeric")
                if minimum is not None and maximum is not None and minimum > maximum:
                    _definition_error(f"{kind}.{field_name} has minimum greater than maximum")
        field_names = set(fields)
        at_least_one = raw_operation.get("atLeastOneOf", [])
        if not isinstance(at_least_one, list) or not all(item in field_names for item in at_least_one):
            _definition_error(f"{kind}.atLeastOneOf must reference declared fields")
        mutually_exclusive = raw_operation.get("mutuallyExclusive", [])
        if not isinstance(mutually_exclusive, list):
            _definition_error(f"{kind}.mutuallyExclusive must be an array")
        for group in mutually_exclusive:
            if not isinstance(group, list) or len(group) < 2 or not all(item in field_names for item in group):
                _definition_error(f"{kind}.mutuallyExclusive contains an invalid field group")
        operations[kind] = raw_operation

    file_bytes = resolved.read_bytes()
    return ContractInfo(
        path=resolved,
        value=value,
        operations=operations,
        semantic_sha256=hashlib.sha256(_canonical_bytes(value)).hexdigest(),
        file_sha256=hashlib.sha256(file_bytes).hexdigest(),
    )


CONTRACT = load_contract()
REGISTERED_KINDS = CONTRACT.registered_kinds
MODEL_ENABLED_KINDS = CONTRACT.model_enabled_kinds


def contract_metadata() -> dict[str, Any]:
    return {
        "schemaVersion": CONTRACT.schema_version,
        "contractVersion": CONTRACT.contract_version,
        "contractSha256": CONTRACT.semantic_sha256,
        "contractFileSha256": CONTRACT.file_sha256,
        "registeredKinds": sorted(REGISTERED_KINDS),
        "modelEnabledKinds": sorted(MODEL_ENABLED_KINDS),
    }


def normalize_text(value: str) -> str:
    digit_map = str.maketrans("٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹", "01234567890123456789")
    return " ".join(unicodedata.normalize("NFKC", value).translate(digit_map).casefold().split())


def _normalized_span_ranges(normalized_source: str, candidate: str) -> list[tuple[int, int]]:
    normalized_candidate = normalize_text(candidate)
    if not normalized_candidate:
        return []
    prefix = r"(?<!\w)" if re.match(r"\w", normalized_candidate[0], re.UNICODE) else ""
    suffix = r"(?!\w)" if re.match(r"\w", normalized_candidate[-1], re.UNICODE) else ""
    return [
        match.span()
        for match in re.finditer(
            prefix + re.escape(normalized_candidate) + suffix,
            normalized_source,
            re.UNICODE,
        )
    ]


def _contains_normalized_span(normalized_source: str, candidate: str) -> bool:
    return bool(_normalized_span_ranges(normalized_source, candidate))


def _contains_numeric_value(normalized_source: str, value: int | float) -> bool:
    """Ground a JSON number on an explicitly written decimal amount.

    Thousands separators and Arabic/Persian digits are canonical presentation
    differences, not permission to infer units such as "thousand" or perform
    arithmetic on another value in the message.
    """
    for match in re.finditer(
        r"(?<!\d)(?:\d{1,3}(?:[\s,٬]\d{3})+|\d+)(?:\.\d{1,2})?(?!\d)",
        normalized_source,
    ):
        token = re.sub(r"[\s,٬]", "", match.group(0))
        try:
            if float(token) == float(value):
                return True
        except ValueError:
            continue
    return False


def _null_has_clear_intent(normalized_source: str, field_name: str) -> bool:
    field_aliases = NULLABLE_FIELD_ALIASES.get(field_name, (field_name,))
    clear_ranges = [
        span
        for alias in CLEAR_INTENT_ALIASES
        for span in _normalized_span_ranges(normalized_source, alias)
    ]
    field_ranges = [
        span
        for alias in field_aliases
        for span in _normalized_span_ranges(normalized_source, alias)
    ]
    for clear_start, clear_end in clear_ranges:
        for field_start, field_end in field_ranges:
            gap = max(0, field_start - clear_end, clear_start - field_end)
            if gap <= 32:
                return True
    return False


def _validate_grounded_field(
    path: str,
    field_name: str,
    value: Any,
    field: Mapping[str, Any],
    *,
    source: str,
) -> list[str]:
    normalized_source = normalize_text(source)
    if value is None:
        if field.get("nullRequiresClearIntent") is True and not _null_has_clear_intent(
            normalized_source, field_name
        ):
            return [f"action.ungrounded_field:{path}"]
        return []

    normalized_value = normalize_text(str(value))
    if field["type"] == "number":
        return [] if _contains_numeric_value(normalized_source, value) else [
            f"action.ungrounded_field:{path}"
        ]
    if field["type"] in {"string", "reference"} and normalized_value in PLACEHOLDER_VALUES:
        return [f"action.placeholder_value:{path}"]

    candidates = (str(value),)
    if field["type"] == "enum" and isinstance(value, str):
        candidates = ENUM_GROUNDING_ALIASES.get(value, (value,))
    if not any(_contains_normalized_span(normalized_source, candidate) for candidate in candidates):
        return [f"action.ungrounded_field:{path}"]
    return []


def _validate_field(path: str, value: Any, field: Mapping[str, Any]) -> list[str]:
    errors: list[str] = []
    if value is None:
        if field.get("nullable") is not True:
            errors.append(f"action.invalid_type:{path}:null")
        return errors
    field_type = field["type"]
    if field_type in {"string", "reference"}:
        valid = isinstance(value, str) or (
            field_type == "reference" and isinstance(value, int) and not isinstance(value, bool)
        )
        if not valid:
            errors.append(f"action.invalid_type:{path}:{field_type}")
            return errors
        normalized = str(value).strip()
        if not normalized:
            errors.append(f"action.invalid_value:{path}:empty")
        max_length = field.get("maxLength")
        if isinstance(max_length, int) and len(normalized) > max_length:
            errors.append(f"action.too_long:{path}:{max_length}")
    elif field_type == "integer":
        if not isinstance(value, int) or isinstance(value, bool):
            errors.append(f"action.invalid_type:{path}:integer")
            return errors
        minimum, maximum = field.get("minimum"), field.get("maximum")
        if isinstance(minimum, int) and value < minimum:
            errors.append(f"action.out_of_range:{path}:minimum={minimum}")
        if isinstance(maximum, int) and value > maximum:
            errors.append(f"action.out_of_range:{path}:maximum={maximum}")
    elif field_type == "number":
        if not isinstance(value, (int, float)) or isinstance(value, bool) or not math.isfinite(value):
            errors.append(f"action.invalid_type:{path}:number")
            return errors
        minimum, maximum = field.get("minimum"), field.get("maximum")
        if isinstance(minimum, (int, float)) and value < minimum:
            errors.append(f"action.out_of_range:{path}:minimum={minimum}")
        if isinstance(maximum, (int, float)) and value > maximum:
            errors.append(f"action.out_of_range:{path}:maximum={maximum}")
    elif field_type == "enum":
        if not isinstance(value, str):
            errors.append(f"action.invalid_type:{path}:enum")
        elif value not in field["values"]:
            errors.append(f"action.invalid_enum:{path}:{value}")
    return errors


def validate_action(
    action: Any,
    *,
    index: int = 0,
    allowed_kinds: Iterable[str] | None = None,
    source: str | None = None,
) -> list[str]:
    path = f"actions[{index}]"
    if not isinstance(action, dict):
        return [f"action.invalid_type:{path}:object"]
    kind = action.get("kind")
    if not isinstance(kind, str) or kind not in REGISTERED_KINDS:
        return [f"action.unsupported_kind:{path}:{kind}"]
    allowed = frozenset(allowed_kinds) if allowed_kinds is not None else None
    if allowed is not None and kind not in allowed:
        return [f"action.model_disabled:{path}:{kind}"]
    operation = CONTRACT.operations[kind]
    fields: Mapping[str, Mapping[str, Any]] = operation["fields"]
    errors: list[str] = []
    extra = sorted(set(action) - ({"kind"} | set(fields)))
    errors.extend(f"action.extra_field:{path}.{field}" for field in extra)
    for field_name, field in fields.items():
        if field.get("required") is True and field_name not in action:
            errors.append(f"action.missing_required:{path}.{field_name}")
        elif field_name in action:
            field_path = f"{path}.{field_name}"
            field_errors = _validate_field(field_path, action[field_name], field)
            errors.extend(field_errors)
            if not field_errors and source is not None and field.get("grounded") is True:
                errors.extend(
                    _validate_grounded_field(
                        field_path,
                        field_name,
                        action[field_name],
                        field,
                        source=source,
                    )
                )
    patch_fields = operation.get("atLeastOneOf", [])
    if patch_fields and not any(field in action for field in patch_fields):
        errors.append(f"action.missing_patch:{path}:{','.join(patch_fields)}")
    for group in operation.get("mutuallyExclusive", []):
        present = [field for field in group if field in action]
        if len(present) > 1:
            errors.append(f"action.mutually_exclusive:{path}:{','.join(present)}")
    return errors


def validate_envelope(
    value: Any,
    *,
    allowed_kinds: Iterable[str] | None = None,
    source: str | None = None,
    require_nonempty: bool = True,
) -> list[str]:
    if not isinstance(value, dict):
        return ["envelope.invalid_type:object"]
    envelope = CONTRACT.value["envelope"]
    errors: list[str] = []
    extra = sorted(set(value) - set(envelope["required"]))
    errors.extend(f"envelope.extra_field:{field}" for field in extra)
    for field in envelope["required"]:
        if field not in value:
            errors.append(f"envelope.missing_required:{field}")
    actions = value.get("actions")
    unparsed = value.get("unparsed")
    if not isinstance(actions, list):
        errors.append("envelope.invalid_type:actions:array")
        actions = []
    elif len(actions) > int(envelope["maxActions"]):
        errors.append(f"envelope.too_many_actions:{len(actions)}")
    if not isinstance(unparsed, list):
        errors.append("envelope.invalid_type:unparsed:array")
        unparsed = []
    elif len(unparsed) > int(envelope["maxUnparsed"]):
        errors.append(f"envelope.too_many_unparsed:{len(unparsed)}")
    if isinstance(actions, list):
        for index, action in enumerate(actions):
            errors.extend(
                validate_action(
                    action,
                    index=index,
                    allowed_kinds=allowed_kinds,
                    source=source,
                )
            )
    if isinstance(unparsed, list):
        normalized_source = normalize_text(source) if source is not None else None
        for index, item in enumerate(unparsed):
            if not isinstance(item, str) or not item.strip():
                errors.append(f"envelope.invalid_unparsed_item:{index}")
                continue
            if len(item) > int(envelope["maxUnparsedItemLength"]):
                errors.append(f"envelope.unparsed_too_long:{index}")
            if normalized_source is not None and normalize_text(item) not in normalized_source:
                errors.append(f"envelope.ungrounded_unparsed:{index}")
    if require_nonempty and not actions and not unparsed:
        errors.append("envelope.empty_result")
    return errors


def require_valid_envelope(
    value: Any,
    *,
    allowed_kinds: Iterable[str] | None = None,
    source: str | None = None,
    require_nonempty: bool = True,
) -> dict[str, Any]:
    errors = validate_envelope(
        value,
        allowed_kinds=allowed_kinds,
        source=source,
        require_nonempty=require_nonempty,
    )
    if errors:
        raise ContractValidationError(errors)
    return value
