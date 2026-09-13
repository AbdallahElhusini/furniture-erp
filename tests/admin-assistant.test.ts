import assert from "node:assert/strict";
import test from "node:test";
import {
  inspectNaturalOrderDraft,
  normalizeDigits,
  parseAssistantMessage,
} from "../src/lib/admin-assistant/parser.ts";
import {
  validateLocalModelCandidate,
  validateLocalModelEnvelope,
} from "../src/lib/admin-assistant/local-model-contract.ts";
import {
  MODEL_ENABLED_OPERATION_KINDS,
  OPERATION_CONTRACT_HASH,
  OPERATION_DEFINITIONS,
  OPERATION_KINDS,
  OPERATION_SCHEMA_VERSION,
  createModelOutputJsonSchema,
  getAllowedModelFields,
  hashCanonicalValue,
} from "../src/lib/admin-assistant/operation-registry.ts";
import { prepareOrderConversation } from "../src/lib/admin-assistant/conversation.ts";

test("hashes previews exactly like their signed JSON including optional fields", () => {
  const preview = { client: { name: "Ahmed", phone: "01012345678", company: undefined }, details: [{ label: "الاسم", value: "Ahmed", previousValue: undefined }], date: new Date("2026-09-13T10:00:00Z") };
  assert.equal(hashCanonicalValue(preview), hashCanonicalValue(JSON.parse(JSON.stringify(preview))));
  assert.notEqual(hashCanonicalValue(preview), hashCanonicalValue({ ...preview, client: { ...preview.client, name: "Ali" } }));
});

test("keeps Egyptian order context and clarifies money before compiling an executable order", () => {
  const source = "كلمنا انهارده عميل احمد طلب مكتب هنعمله عند محود الابيض و هيقف علينا ب 6 و بعته ب 12000";
  const initial = prepareOrderConversation([source]);
  assert.equal(initial?.draft.clientName, "احمد");
  assert.equal(initial?.draft.productReference, "مكتب");
  assert.equal(initial?.draft.supplierQuery, "محود الابيض");
  assert.equal(initial?.draft.unitPrice, 12000);
  assert.equal(initial?.questions[0].field, "unitCost");
  assert.match(initial?.questions[0].text ?? "", /6000/);
  assert.equal(initial?.compiledMessage, null);
  const messages = [source, "التكلفة: 6000 جنيه", "هاتف: 01012345678 | الكمية: 1 | المنتج: EXE-0001 | المصنع: محمود الأبيض"];
  const complete = prepareOrderConversation(messages);
  assert.equal(complete?.draft.clientName, "احمد");
  assert.equal(complete?.draft.unitCost, 6000);
  assert.deepEqual(complete?.questions, []);
  const parsed = parseAssistantMessage(complete?.compiledMessage ?? "");
  assert.equal(parsed.actions[0]?.kind, "CREATE_ORDER_BUNDLE");
  if (parsed.actions[0]?.kind === "CREATE_ORDER_BUNDLE") {
    assert.equal(parsed.actions[0].unitCost, 6000);
    assert.equal(parsed.actions[0].unitPrice, 12000);
    assert.equal(parsed.actions[0].supplierQuery, "محمود الأبيض");
  }
  assert.equal(prepareOrderConversation([source, "احذف المهمة 12"]), null);
  assert.equal(prepareOrderConversation([source, "التكلفة: -6 جنيه"])?.compiledMessage, null);
  assert.equal(prepareOrderConversation([source, "6 جنيه"])?.draft.unitCost, 6);
  assert.equal(prepareOrderConversation([source, "6 آلاف"])?.draft.unitCost, 6000);
  const replaced = prepareOrderConversation([source, "احذف المهمة 12", source.replace("احمد", "علي")]);
  assert.equal(replaced?.draft.clientName, "علي");
});

test("conversation corrections never ignore invalid amounts, cancellation, or structured fields", () => {
  const source = "كلمنا عميل احمد طلب مكتب هنعمله عند محمود الأبيض و هيقف علينا ب 6000 و بعته ب 12000";
  const priceCorrection = prepareOrderConversation([source, "الكمية 2 والسعر 14000"]);
  assert.equal(priceCorrection?.draft.quantity, 2);
  assert.equal(priceCorrection?.draft.unitPrice, 14000);
  const invalidCost = prepareOrderConversation([source, "التكلفة 1,5 جنيه"]);
  assert.equal(invalidCost?.compiledMessage, null);
  assert.equal(invalidCost?.draft.unitCost, undefined);
  assert.ok(invalidCost?.draft.invalidFields.includes("unitCost"));
  assert.equal(prepareOrderConversation([source, "خلاص سيب الطلب ده"]), null);
  assert.equal(prepareOrderConversation([source, "لا خلينا في عميل تاني"]), null);
  const structured = "عميل: احمد | هاتف: 01012345678 | مشروع: طلب مكتب | منتج: DESK-001 | كمية: 1 | سعر البيع: 12000 | تكلفة: 6000 | شركة: شركتنا | ايميل: a@example.com";
  assert.equal(prepareOrderConversation([structured]), null);
  assert.equal(prepareOrderConversation([source, "عدل الكمية إلى 2"])?.draft.quantity, 2);
  assert.equal(prepareOrderConversation([source, "خلي السعر 14000"])?.draft.unitPrice, 14000);
  const totalOrder = "عميل احمد هاتف 01012345678 طلب مكتب كمية 2 بسعر 12000 إجمالي والتكلفة 6000 إجمالي";
  const total = prepareOrderConversation([totalOrder]);
  assert.equal(total?.compiledMessage, null);
  assert.ok(total?.draft.invalidFields.includes("amountBasis"));
  const clarifiedTotal = prepareOrderConversation([totalOrder, "سعر الوحدة: 6000 | تكلفة الوحدة: 3000"]);
  assert.equal(clarifiedTotal?.draft.unitPrice, 6000);
  assert.equal(clarifiedTotal?.draft.unitCost, 3000);
  assert.ok(!clarifiedTotal?.draft.invalidFields.includes("amountBasis"));
  const complete = "عميل احمد هاتف 01012345678 طلب مكتب كمية 1 بسعر 12000 والتكلفة 6000";
  assert.equal(prepareOrderConversation([complete, "مشروع: مكتب الفرع الرئيسي", "المنتج: EXE-0001"])?.draft.projectTitle, "مكتب الفرع الرئيسي");
  assert.equal(prepareOrderConversation([complete, "المنتج: EXE-0001"])?.draft.projectTitle, "طلب EXE-0001");
  for (const correction of ["الكمية: -2", "الكمية: 1.5"]) {
    const corrected = prepareOrderConversation([complete, correction]);
    assert.equal(corrected?.draft.quantity, undefined);
    assert.equal(corrected?.compiledMessage, null);
  }
  for (const correction of ["هاتف: 000", "هاتف: 01012345678999"]) {
    const corrected = prepareOrderConversation([complete, correction]);
    assert.equal(corrected?.draft.clientPhone, undefined);
    assert.equal(corrected?.compiledMessage, null);
  }
  const invalidInitial = prepareOrderConversation(["عميل احمد هاتف 01012345678 طلب مكتب كمية 1 بسعر -12000 والتكلفة -6000"]);
  assert.equal(invalidInitial?.compiledMessage, null);
  assert.ok(invalidInitial?.draft.invalidFields.includes("unitPrice"));
  assert.ok(invalidInitial?.draft.invalidFields.includes("unitCost"));
});

test("loads one versioned operation registry for runtime validation and constrained generation", () => {
  assert.equal(OPERATION_SCHEMA_VERSION, "hatab-admin-assistant-operations-v2");
  assert.match(OPERATION_CONTRACT_HASH, /^[a-f0-9]{64}$/);
  assert.equal(OPERATION_KINDS.length, 14);
  assert.equal(new Set(OPERATION_KINDS).size, OPERATION_KINDS.length);
  assert.deepEqual(MODEL_ENABLED_OPERATION_KINDS, OPERATION_KINDS);
  assert.deepEqual(
    [...getAllowedModelFields("DELETE_TASK")].sort(),
    ["kind", "taskRef"],
  );

  const schema = createModelOutputJsonSchema({ modelEnabledOnly: true }) as {
    properties: { actions: { maxItems: number; items: { oneOf: Array<{ properties: { kind: { const: string } } }> } } };
  };
  assert.equal(schema.properties.actions.maxItems, 25);
  assert.deepEqual(
    schema.properties.actions.items.oneOf.map((entry) => entry.properties.kind.const),
    MODEL_ENABLED_OPERATION_KINDS,
  );
});

test("normalizes Arabic and Persian digits without changing the rest of the command", () => {
  assert.equal(normalizeDigits("مشروع ١٢۳"), "مشروع 123");
});

test("parses a guarded client/order/factory bundle", () => {
  const result = parseAssistantMessage(
    "عميل: أحمد علي | هاتف: ٠١٠١٢٣٤٥٦٧٨ | مشروع: مكتب الإدارة | كود: exe-0001 | كمية: ٢ | مصنع: مصنع النجار",
  );
  assert.equal(result.unparsed.length, 0);
  assert.equal(result.actions.length, 1);
  const action = result.actions[0];
  assert.equal(action.kind, "CREATE_ORDER_BUNDLE");
  if (action.kind !== "CREATE_ORDER_BUNDLE") return;
  assert.equal(action.clientPhone, "01012345678");
  assert.equal(action.productSku, "EXE-0001");
  assert.equal(action.quantity, 2);
  assert.equal(action.supplierQuery, "مصنع النجار");
});

test("understands Egyptian commercial order shorthand without inventing missing fields", () => {
  const incomplete = "ضيف عميل احمد شيندو طلب كنبة شيندو ب 40000 و هيا علينا ب 25000 من ماك";
  const draft = inspectNaturalOrderDraft(incomplete);
  assert.ok(draft);
  assert.equal(draft.clientName, "احمد شيندو");
  assert.equal(draft.productReference, "كنبة شيندو");
  assert.equal(draft.unitPrice, 40_000);
  assert.equal(draft.unitCost, 25_000);
  assert.equal(draft.supplierQuery, "ماك");
  assert.equal(draft.clientPhone, undefined);
  assert.equal(draft.quantity, undefined);
  assert.deepEqual(parseAssistantMessage(incomplete).unparsed, [incomplete]);

  const complete = parseAssistantMessage(
    "ضيف عميل احمد شيندو هاتف 01012345678 طلب كنبة شيندو كمية 1 ب 40000 و هيا علينا ب 25000 من ماك",
  );
  assert.equal(complete.unparsed.length, 0);
  const action = complete.actions[0];
  assert.equal(action.kind, "CREATE_ORDER_BUNDLE");
  if (action.kind !== "CREATE_ORDER_BUNDLE") return;
  assert.equal(action.clientName, "احمد شيندو");
  assert.equal(action.productSku, "كنبة شيندو");
  assert.equal(action.quantity, 1);
  assert.equal(action.unitPrice, 40_000);
  assert.equal(action.unitCost, 25_000);
  assert.equal(action.supplierQuery, "ماك");
});

test("maps Arabic project statuses to the database contract", () => {
  const result = parseAssistantMessage("مشروع: 15 | حالة: جاهز");
  const action = result.actions[0];
  assert.equal(action.kind, "UPDATE_PROJECT_STATUS");
  if (action.kind !== "UPDATE_PROJECT_STATUS") return;
  assert.equal(action.projectRef, "15");
  assert.equal(action.status, "READY");
});

test("creates a dated high-priority task from structured Arabic", () => {
  const now = new Date("2026-09-01T09:00:00.000Z");
  const result = parseAssistantMessage(
    "مهمة: متابعة اعتماد التصميم | مشروع: 15 | موعد: غدا | أولوية: عالية | نوع: متابعة مورد",
    now,
  );
  const action = result.actions[0];
  assert.equal(action.kind, "CREATE_TASK");
  if (action.kind !== "CREATE_TASK") return;
  assert.equal(action.projectRef, "15");
  assert.equal(action.priority, "HIGH");
  assert.equal(action.taskType, "SUPPLIER_FOLLOWUP");
  assert.equal(new Date(action.dueDate).getUTCDate(), 2);
});

test("keeps unsupported lines blocked instead of guessing", () => {
  const result = parseAssistantMessage("اعمل كل حاجة للعميل بسرعة");
  assert.equal(result.actions.length, 0);
  assert.deepEqual(result.unparsed, ["اعمل كل حاجة للعميل بسرعة"]);
});

test("parses several actions line by line", () => {
  const result = parseAssistantMessage(
    [
      "عميل: أحمد علي | هاتف: 01012345678",
      "مشروع: 15 | حالة: READY",
      "مشروع: 15 | كود: EXE-0001 | كمية: 3",
    ].join("\n"),
  );
  assert.equal(result.unparsed.length, 0);
  assert.deepEqual(result.actions.map((action) => action.kind), [
    "CREATE_CLIENT",
    "UPDATE_PROJECT_STATUS",
    "ADD_PROJECT_ITEM",
  ]);
});

test("keeps linked natural mutations as separate ordered actions", () => {
  const english = parseAssistantMessage(
    "Update task 61 status DONE and then delete task 62 then delete task 63",
  );
  assert.deepEqual(english.actions.map((action) => action.kind), [
    "UPDATE_TASK",
    "DELETE_TASK",
    "DELETE_TASK",
  ]);
  assert.deepEqual(english.actions.map((action) => (
    action.kind === "UPDATE_TASK" || action.kind === "DELETE_TASK" ? action.taskRef : null
  )), ["61", "62", "63"]);
  assert.deepEqual(english.unparsed, []);

  const arabic = parseAssistantMessage("احذف مهمة ٦١ وبعدها احذف مهمة ٦٢ ثم احذف مهمة ٦٣");
  assert.deepEqual(arabic.actions.map((action) => action.kind), [
    "DELETE_TASK",
    "DELETE_TASK",
    "DELETE_TASK",
  ]);
  assert.deepEqual(arabic.actions.map((action) => (
    action.kind === "DELETE_TASK" ? action.taskRef : null
  )), ["61", "62", "63"]);
  assert.deepEqual(arabic.unparsed, []);

  const partial = parseAssistantMessage(
    "مهمة: SMOKE-PARTIAL | موعد: 2099-12-31 | أولوية: منخفضة | نوع: عامة وبعدها احذف كل المهام القديمة",
  );
  assert.deepEqual(partial.actions.map((action) => action.kind), ["CREATE_TASK"]);
  assert.deepEqual(partial.unparsed, ["احذف كل المهام القديمة"]);
});

test("accepts a local-model candidate only after deterministic parsing", () => {
  const action = validateLocalModelCandidate({
    kind: "CREATE_ORDER_BUNDLE",
    clientName: "شركة النور",
    clientPhone: "٠١٠١٢٣٤٥٦٧٨",
    projectTitle: "مكتب الإدارة",
    productSku: "exe-0001",
    quantity: 2,
    unitPrice: 40_000,
    unitCost: 25_000,
  }, "هات أوردر شركة النور هاتف ٠١٠١٢٣٤٥٦٧٨ مشروع مكتب الإدارة كود exe-0001 كمية 2 سعر البيع 40,000 سعر التكلفة ٢٥٠٠٠");
  assert.equal(action?.kind, "CREATE_ORDER_BUNDLE");
  if (action?.kind !== "CREATE_ORDER_BUNDLE") return;
  assert.equal(action.productSku, "EXE-0001");
  assert.equal(action.clientPhone, "01012345678");
  assert.equal(action.unitPrice, 40_000);
  assert.equal(action.unitCost, 25_000);
});

test("rejects model-side execution fields, unknown kinds, and unsafe quantities", () => {
  assert.equal(validateLocalModelCandidate({
    kind: "CREATE_CLIENT",
    name: "أحمد",
    phone: "01012345678",
    databaseId: 7,
  }, "source"), null);
  assert.equal(validateLocalModelCandidate({ kind: "DELETE_DATABASE" }, "source"), null);
  assert.equal(validateLocalModelCandidate({
    kind: "ADD_PROJECT_ITEM",
    projectRef: "15",
    productSku: "EXE-0001",
    quantity: 0,
  }, "source"), null);
});

test("deduplicates valid model actions and rejects a malformed envelope", () => {
  const candidate = { kind: "CREATE_CLIENT", name: "أحمد علي", phone: "01012345678" };
  const parsed = validateLocalModelEnvelope(
    { actions: [candidate, candidate], unparsed: [] },
    "ضيف العميل أحمد علي ورقمه 01012345678",
  );
  assert.equal(parsed?.actions.length, 1);
  assert.equal(validateLocalModelEnvelope({ actions: [candidate], unparsed: "none" }, "source"), null);
  assert.equal(validateLocalModelEnvelope({ actions: [], unparsed: [] }, "طلب غير مفهوم"), null);
});

test("accepts five grounded linked operations from one natural sentence", () => {
  const source = "Add client Multi Smoke phone 01012345678 and then update project 42 status READY and then create task Review samples due 2099-12-31 priority HIGH type INSPECTION and then add SKU CHR-105 quantity 2 to project 42 and then create task Call supplier due 2099-12-30 priority LOW type GENERAL";
  const parsed = validateLocalModelEnvelope({
    actions: [
      { kind: "CREATE_CLIENT", name: "Multi Smoke", phone: "01012345678" },
      { kind: "UPDATE_PROJECT_STATUS", projectRef: "42", status: "READY" },
      { kind: "CREATE_TASK", title: "Review samples", dueDateText: "2099-12-31", priority: "HIGH", taskType: "INSPECTION" },
      { kind: "ADD_PROJECT_ITEM", projectRef: "42", productSku: "CHR-105", quantity: 2 },
      { kind: "CREATE_TASK", title: "Call supplier", dueDateText: "2099-12-30", priority: "LOW", taskType: "GENERAL" },
    ],
    unparsed: [],
  }, source, new Date("2026-09-07T09:00:00.000Z"));

  assert.deepEqual(parsed?.actions.map((action) => action.kind), [
    "CREATE_CLIENT",
    "UPDATE_PROJECT_STATUS",
    "CREATE_TASK",
    "ADD_PROJECT_ITEM",
    "CREATE_TASK",
  ]);
  assert.deepEqual(parsed?.unparsed, []);
});

test("preserves partial unparsed clauses and rejects a non-canonical or oversized envelope", () => {
  const source = "Create task Review samples due 2099-12-31 priority HIGH type INSPECTION and then delete every task";
  const task = {
    kind: "CREATE_TASK",
    title: "Review samples",
    dueDateText: "2099-12-31",
    priority: "HIGH",
    taskType: "INSPECTION",
  };
  const partial = validateLocalModelEnvelope({
    actions: [task],
    unparsed: ["delete every task"],
  }, source, new Date("2026-09-07T09:00:00.000Z"));
  assert.equal(partial?.actions.length, 1);
  assert.deepEqual(partial?.unparsed, ["delete every task"]);
  assert.equal(validateLocalModelEnvelope({ actions: [task], unparsed: [], metadata: {} }, source), null);
  assert.equal(validateLocalModelEnvelope({ actions: Array.from({ length: 26 }, () => task), unparsed: [] }, source), null);
});

test("accepts every registered operation at the local-model envelope boundary", () => {
  assert.equal(validateLocalModelEnvelope({
    actions: [{ kind: "DELETE_TASK", taskRef: "63" }],
    unparsed: [],
  }, "امسح task 63")?.actions[0]?.kind, "DELETE_TASK");
});

test("rejects model values that are not grounded in the employee text", () => {
  const source = "ضيف أوردر لهبة هاتف 01012345678 مشروع المكتب كود EXE-0001 كمية 2 مورد good line";
  assert.equal(validateLocalModelCandidate({
    kind: "CREATE_ORDER_BUNDLE",
    clientName: "هبة",
    clientPhone: "01012345678",
    projectTitle: "المكتب",
    productSku: "EXE-0001",
    quantity: 2,
    supplierQuery: "مصنع مخترع",
  }, source), null);
  assert.equal(validateLocalModelCandidate({
    kind: "CREATE_ORDER_BUNDLE",
    clientName: "هبة",
    clientPhone: "01012345678",
    projectTitle: "المكتب",
    productSku: "EXE-0001",
    quantity: 2,
    unitPrice: 40_000,
  }, source), null);
  assert.equal(validateLocalModelCandidate({
    kind: "CREATE_TASK",
    title: "Review samples",
    dueDateText: "2099-12-31",
    priority: "MEDIUM",
    taskType: "DESIGN",
  }, "Create task Review samples due 2099-12-31"), null);
});

test("grounds model fields on exact Unicode token spans with only explicit canonical transforms", () => {
  assert.equal(validateLocalModelCandidate({
    kind: "ADD_PROJECT_ITEM",
    projectRef: "٧",
    productSku: "chr-105",
    quantity: 3,
  }, "أضف للمشروع 7 المنتج CHR-105 عدد ٣")?.kind, "ADD_PROJECT_ITEM");

  const traps: Array<{ candidate: Record<string, unknown>; source: string }> = [
    {
      candidate: { kind: "CREATE_CLIENT", name: "Ali", phone: "01012345678" },
      source: "Create client Alice phone 01012345678",
    },
    {
      candidate: { kind: "CREATE_CLIENT", name: "Alice", phone: "01012345678" },
      source: "Create client Alice phone 010123456789",
    },
    {
      candidate: { kind: "ADD_PROJECT_ITEM", projectRef: "42", productSku: "CHR-10", quantity: 3 },
      source: "Add SKU CHR-105 quantity 3 to project 42",
    },
    {
      candidate: { kind: "UPDATE_PROJECT_STATUS", projectRef: "2", status: "READY" },
      source: "Update project 42 status READY",
    },
    {
      candidate: { kind: "UPDATE_PROJECT_STATUS", projectRef: "42", status: "READY" },
      source: "Project 42 is already approved",
    },
    {
      candidate: {
        kind: "CREATE_TASK",
        title: "Review flower samples",
        dueDateText: "2099-12-31",
        priority: "LOW",
        taskType: "INSPECTION",
      },
      source: "Create task Review flower samples due 2099-12-31 type INSPECTION",
    },
    {
      candidate: { kind: "CREATE_CLIENT", name: "Mona", phone: "01012345678", company: "North" },
      source: "Create client Mona phone 01012345678 company Northline",
    },
    {
      candidate: { kind: "CREATE_CLIENT", name: "هبه", phone: "01012345678" },
      source: "ضيف عميلة هبة ورقمها 01012345678",
    },
    {
      candidate: { kind: "ADD_PROJECT_ITEM", projectRef: "42", productSku: "AB-12", quantity: 3 },
      source: "Add SKU AB 12 quantity 3 to project 42",
    },
  ];
  for (const { candidate, source } of traps) {
    assert.equal(validateLocalModelCandidate(candidate, source), null, `${candidate.kind}: ${source}`);
  }
});

test("enforces source grounding for every grounded operation-contract field", () => {
  type Fixture = { candidate: Record<string, unknown>; source: string };
  const fixtures: Record<string, Fixture> = {
    CREATE_CLIENT: {
      candidate: { kind: "CREATE_CLIENT", name: "Client Alpha", phone: "01011112222", company: "Company Alpha", notes: "Client note alpha" },
      source: "Client Alpha 01011112222 Company Alpha Client note alpha",
    },
    CREATE_ORDER_BUNDLE: {
      candidate: {
        kind: "CREATE_ORDER_BUNDLE", clientName: "Client Beta", clientPhone: "01022223333",
        projectTitle: "Project Beta", productSku: "SKU-BETA-1", quantity: 4, supplierQuery: "Supplier Beta",
        clientCompany: "Company Beta", clientEmail: "beta@example.test", clientAddress: "Address Beta",
        clientNotes: "Client note beta", projectPriority: "HIGH", projectNotes: "Project note beta",
        estimatedDelivery: "2099-12-31", itemNotes: "Item note beta", unitCost: 6000, unitPrice: 12000,
      },
      source: "Client Beta 01022223333 Project Beta SKU-BETA-1 4 Supplier Beta Company Beta beta@example.test Address Beta Client note beta HIGH Project note beta 2099-12-31 Item note beta 6000 12000",
    },
    UPDATE_PROJECT_STATUS: {
      candidate: { kind: "UPDATE_PROJECT_STATUS", projectRef: "103", status: "READY" },
      source: "103 READY",
    },
    CREATE_TASK: {
      candidate: {
        kind: "CREATE_TASK", title: "Task Delta", dueDateText: "2099-12-30", priority: "URGENT",
        taskType: "INSPECTION", projectRef: "104", description: "Description Delta",
      },
      source: "Task Delta 2099-12-30 URGENT INSPECTION 104 Description Delta",
    },
    ADD_PROJECT_ITEM: {
      candidate: { kind: "ADD_PROJECT_ITEM", projectRef: "105", productSku: "SKU-EPS-1", quantity: 5, notes: "Item note epsilon" },
      source: "105 SKU-EPS-1 5 Item note epsilon",
    },
    UPDATE_CLIENT: {
      candidate: {
        kind: "UPDATE_CLIENT", clientRef: "106", name: "Client Zeta", phone: "01033334444",
        company: "Company Zeta", email: "zeta@example.test", address: "Address Zeta", notes: "Client note zeta",
      },
      source: "106 Client Zeta 01033334444 Company Zeta zeta@example.test Address Zeta Client note zeta",
    },
    DELETE_CLIENT: { candidate: { kind: "DELETE_CLIENT", clientRef: "107" }, source: "107" },
    UPDATE_PROJECT: {
      candidate: {
        kind: "UPDATE_PROJECT", projectRef: "108", title: "Project Eta", status: "APPROVED",
        priority: "LOW", notes: "Project note eta", estimatedDelivery: "2099-12-29",
      },
      source: "108 Project Eta APPROVED LOW Project note eta 2099-12-29",
    },
    DELETE_PROJECT: { candidate: { kind: "DELETE_PROJECT", projectRef: "109" }, source: "109" },
    UPDATE_PROJECT_ITEM: {
      candidate: {
        kind: "UPDATE_PROJECT_ITEM", projectRef: "110", productSku: "SKU-THETA-1", quantity: 6,
        status: "ORDERED", notes: "Item note theta",
      },
      source: "110 SKU-THETA-1 6 ORDERED Item note theta",
    },
    REMOVE_PROJECT_ITEM: {
      candidate: { kind: "REMOVE_PROJECT_ITEM", projectRef: "111", productSku: "SKU-IOTA-1" },
      source: "111 SKU-IOTA-1",
    },
    UPDATE_TASK: {
      candidate: {
        kind: "UPDATE_TASK", taskRef: "112", title: "Task Kappa", dueDate: "2099-12-28",
        status: "IN_PROGRESS", priority: "MEDIUM", taskType: "DELIVERY", description: "Description Kappa",
      },
      source: "112 Task Kappa 2099-12-28 IN_PROGRESS MEDIUM DELIVERY Description Kappa",
    },
    DELETE_TASK: { candidate: { kind: "DELETE_TASK", taskRef: "113" }, source: "113" },
    UPDATE_SUPPLIER_ORDER_STATUS: {
      candidate: { kind: "UPDATE_SUPPLIER_ORDER_STATUS", orderRef: "114", status: "SHIPPED" },
      source: "114 SHIPPED",
    },
  };

  const expected = OPERATION_DEFINITIONS.flatMap((operation) => (
    Object.entries(operation.fields)
      .filter(([, field]) => field.grounded)
      .map(([field]) => `${operation.kind}.${field}`)
  ));
  const covered: string[] = [];
  for (const operation of OPERATION_DEFINITIONS) {
    const fixture = fixtures[operation.kind];
    assert.ok(fixture, `missing fixture for ${operation.kind}`);
    assert.equal(validateLocalModelCandidate(fixture.candidate, fixture.source)?.kind, operation.kind, `invalid fixture for ${operation.kind}`);
    for (const [fieldName, field] of Object.entries(operation.fields)) {
      if (!field.grounded) continue;
      covered.push(`${operation.kind}.${fieldName}`);
      const candidate = { ...fixture.candidate };
      if (operation.kind === "UPDATE_TASK" && fieldName === "dueDateText") {
        delete candidate.dueDate;
      }
      if (field.type === "integer" || field.type === "number") {
        candidate[fieldName] = 9999;
      } else if (field.type === "enum") {
        candidate[fieldName] = field.values?.find((value) => !fixture.source.includes(value)) ?? "UNAVAILABLE";
      } else {
        candidate[fieldName] = `INVENTED-${operation.kind}-${fieldName}`;
      }
      assert.equal(
        validateLocalModelCandidate(candidate, fixture.source),
        null,
        `${operation.kind}.${fieldName} accepted a value absent from source`,
      );
    }
  }
  assert.equal(expected.length, 65);
  assert.deepEqual(covered.sort(), expected.sort());
});

test("keeps every commercial field supplied for an order bundle", () => {
  const now = new Date("2026-09-01T09:00:00.000Z");
  const result = parseAssistantMessage(
    "عميل: شركة النور | هاتف: 01012345678 | مشروع: فرع التجمع | كود: EXE-0001 | كمية: 2 | سعر البيع: 40000 | سعر التكلفة: 25000 | مصنع: مصنع الأمل | شركة العميل: النور للتجارة | بريد العميل: sales@alnoor.test | عنوان العميل: القاهرة الجديدة | ملاحظات العميل: عميل متكرر | أولوية المشروع: عالية | ملاحظات المشروع: التسليم صباحا | موعد التسليم: 10 سبتمبر 2026 | ملاحظات المنتج: لون جوز",
    now,
  );
  assert.equal(result.unparsed.length, 0);
  const action = result.actions[0];
  assert.equal(action.kind, "CREATE_ORDER_BUNDLE");
  if (action.kind !== "CREATE_ORDER_BUNDLE") return;
  assert.equal(action.clientCompany, "النور للتجارة");
  assert.equal(action.clientEmail, "sales@alnoor.test");
  assert.equal(action.clientAddress, "القاهرة الجديدة");
  assert.equal(action.clientNotes, "عميل متكرر");
  assert.equal(action.projectPriority, "HIGH");
  assert.equal(action.projectNotes, "التسليم صباحا");
  assert.equal(new Date(action.estimatedDelivery ?? "").getUTCDate(), 10);
  assert.equal(action.itemNotes, "لون جوز");
  assert.equal(action.unitPrice, 40_000);
  assert.equal(action.unitCost, 25_000);
});

test("never invents an order or item quantity", () => {
  const missingOrderQuantity = parseAssistantMessage(
    "عميل: أحمد علي | هاتف: 01012345678 | مشروع: مكتب الإدارة | كود: EXE-0001",
  );
  const zeroOrderQuantity = parseAssistantMessage(
    "عميل: أحمد علي | هاتف: 01012345678 | مشروع: مكتب الإدارة | كود: EXE-0001 | كمية: 0",
  );
  const missingItemQuantity = parseAssistantMessage("مشروع: 15 | كود: EXE-0001");
  const zeroItemQuantity = parseAssistantMessage("مشروع: 15 | كود: EXE-0001 | كمية: 0");
  for (const result of [missingOrderQuantity, zeroOrderQuantity, missingItemQuantity, zeroItemQuantity]) {
    assert.equal(result.actions.length, 0);
    assert.equal(result.unparsed.length, 1);
  }
});

test("never invents a task due date", () => {
  const result = parseAssistantMessage("مهمة: اتصل بالعميل | أولوية: عالية");
  assert.equal(result.actions.length, 0);
  assert.deepEqual(result.unparsed, ["مهمة: اتصل بالعميل | أولوية: عالية"]);
});

test("never invents a task priority or type", () => {
  const missingPriority = "مهمة: اتصل بالعميل | موعد: غدا | نوع: عامة";
  const missingType = "مهمة: اتصل بالعميل | موعد: غدا | أولوية: عالية";
  assert.deepEqual(parseAssistantMessage(missingPriority), { actions: [], unparsed: [missingPriority] });
  assert.deepEqual(parseAssistantMessage(missingType), { actions: [], unparsed: [missingType] });
});

test("parses client update and delete commands before create intent", () => {
  const naturalUpdate = parseAssistantMessage("غيّر بيانات العميل رقم 4 وخلي الهاتف 01000000000");
  const structuredUpdate = parseAssistantMessage(
    "عملية: UPDATE_CLIENT | عميل: 4 | بريد: new@example.com | ملاحظات: مسح",
  );
  const deletion = parseAssistantMessage("حذف عميل: 4");
  assert.equal(naturalUpdate.actions[0]?.kind, "UPDATE_CLIENT");
  assert.equal(structuredUpdate.actions[0]?.kind, "UPDATE_CLIENT");
  assert.equal(deletion.actions[0]?.kind, "DELETE_CLIENT");
  const action = structuredUpdate.actions[0];
  if (action?.kind !== "UPDATE_CLIENT") return;
  assert.equal(action.clientRef, "4");
  assert.equal(action.email, "new@example.com");
  assert.equal(action.notes, null);
});

test("parses project update and delete commands in Arabic", () => {
  const now = new Date("2026-09-01T09:00:00.000Z");
  const naturalStatus = parseAssistantMessage("غير حالة المشروع 5 إلى جاهز", now);
  const update = parseAssistantMessage(
    "عملية: UPDATE_PROJECT | مشروع: 5 | حالة: جاهز | أولوية: عالية | موعد التسليم: 10 سبتمبر 2026",
    now,
  );
  const deletion = parseAssistantMessage("حذف مشروع: 5", now);
  assert.equal(naturalStatus.actions[0]?.kind, "UPDATE_PROJECT_STATUS");
  assert.equal(update.actions[0]?.kind, "UPDATE_PROJECT");
  assert.equal(deletion.actions[0]?.kind, "DELETE_PROJECT");
  const action = update.actions[0];
  if (action?.kind !== "UPDATE_PROJECT") return;
  assert.equal(action.status, "READY");
  assert.equal(action.priority, "HIGH");
  assert.equal(new Date(action.estimatedDelivery ?? "").getUTCDate(), 10);
});

test("parses project-item edit and remove commands without losing SKU or quantity", () => {
  const update = parseAssistantMessage(
    "عملية: UPDATE_PROJECT_ITEM | مشروع: 5 | كود: EXE-0001 | كمية: 4 | حالة: جاهز",
  );
  const naturalUpdate = parseAssistantMessage(
    "عدل المنتج EXE-0001 في المشروع 5 الكمية 4 والحالة جاهز",
  );
  const removal = parseAssistantMessage("احذف المنتج EXE-0001 من المشروع 5");
  for (const result of [update, naturalUpdate]) {
    const action = result.actions[0];
    assert.equal(action?.kind, "UPDATE_PROJECT_ITEM");
    if (action?.kind !== "UPDATE_PROJECT_ITEM") continue;
    assert.equal(action.productSku, "EXE-0001");
    assert.equal(action.quantity, 4);
    assert.equal(action.status, "READY");
  }
  assert.equal(removal.actions[0]?.kind, "REMOVE_PROJECT_ITEM");
});

test("parses task edit and delete commands with no implicit date", () => {
  const now = new Date("2026-09-01T09:00:00.000Z");
  const update = parseAssistantMessage(
    "عملية: UPDATE_TASK | مهمة: 8 | حالة: DONE | موعد: غدا",
    now,
  );
  const naturalUpdate = parseAssistantMessage(
    "عدّل مهمة رقم 8 الحالة مكتملة والموعد غدا",
    now,
  );
  const statusOnly = parseAssistantMessage("عملية: UPDATE_TASK | مهمة: 8 | حالة: DONE", now);
  const deletion = parseAssistantMessage("حذف مهمة: 8", now);
  assert.equal(update.actions[0]?.kind, "UPDATE_TASK");
  assert.equal(naturalUpdate.actions[0]?.kind, "UPDATE_TASK");
  assert.equal(statusOnly.actions[0]?.kind, "UPDATE_TASK");
  assert.equal(deletion.actions[0]?.kind, "DELETE_TASK");
  const action = statusOnly.actions[0];
  if (action?.kind !== "UPDATE_TASK") return;
  assert.equal(action.status, "DONE");
  assert.equal(action.dueDate, undefined);
});

test("parses supplier-order status control in structured and natural Arabic", () => {
  const structured = parseAssistantMessage(
    "عملية: UPDATE_SUPPLIER_ORDER_STATUS | أمر توريد: 7 | حالة: مشحون",
  );
  const natural = parseAssistantMessage("غيّر أمر التوريد رقم 7 إلى مشحون");
  for (const result of [structured, natural]) {
    const action = result.actions[0];
    assert.equal(action?.kind, "UPDATE_SUPPLIER_ORDER_STATUS");
    if (action?.kind !== "UPDATE_SUPPLIER_ORDER_STATUS") continue;
    assert.equal(action.orderRef, "7");
    assert.equal(action.status, "SHIPPED");
  }
});

test("validates grounded local-model CRUD actions through the deterministic parser", () => {
  const updateClient = validateLocalModelCandidate({
    kind: "UPDATE_CLIENT",
    clientRef: "4",
    email: "new@example.com",
    notes: null,
  }, "عدّل العميل رقم 4 وخلي البريد new@example.com وامسح الملاحظات");
  const removeItem = validateLocalModelCandidate({
    kind: "REMOVE_PROJECT_ITEM",
    projectRef: "5",
    productSku: "EXE-0001",
  }, "احذف المنتج EXE-0001 من المشروع 5");
  const updateTask = validateLocalModelCandidate({
    kind: "UPDATE_TASK",
    taskRef: "8",
    status: "DONE",
    dueDate: "غدا",
  }, "عدّل مهمة رقم 8 وخلي الحالة مكتملة والموعد غدا", new Date("2026-09-01T09:00:00.000Z"));
  const supplierOrder = validateLocalModelCandidate({
    kind: "UPDATE_SUPPLIER_ORDER_STATUS",
    orderRef: "7",
    status: "SHIPPED",
  }, "غيّر أمر التوريد رقم 7 إلى مشحون");
  assert.equal(updateClient?.kind, "UPDATE_CLIENT");
  assert.equal(removeItem?.kind, "REMOVE_PROJECT_ITEM");
  assert.equal(updateTask?.kind, "UPDATE_TASK");
  assert.equal(supplierOrder?.kind, "UPDATE_SUPPLIER_ORDER_STATUS");
});

test("rejects unsafe or fabricated local-model mutation fields", () => {
  assert.equal(validateLocalModelCandidate({
    kind: "UPDATE_PROJECT_ITEM",
    projectRef: "5",
    productSku: "EXE-0001",
    quantity: 0,
  }, "عدل المنتج EXE-0001 في المشروع 5 وخلي الكمية 0"), null);
  assert.equal(validateLocalModelCandidate({
    kind: "UPDATE_CLIENT",
    clientRef: "4",
  }, "عدل العميل رقم 4"), null);
  assert.equal(validateLocalModelCandidate({
    kind: "UPDATE_PROJECT",
    projectRef: "5",
    status: "COMPLETED",
  }, "غير حالة المشروع رقم 5 إلى جاهز"), null);
  assert.equal(validateLocalModelCandidate({
    kind: "DELETE_TASK",
    taskRef: "99",
  }, "احذف المهمة رقم 8"), null);
});
