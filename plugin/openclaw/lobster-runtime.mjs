import { createRequire } from "node:module";
import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import { createHash } from "node:crypto";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { Type } from "typebox";
import { readFileSync } from "node:fs";
import { Readable, Writable } from "node:stream";
import { pathToFileURL } from "node:url";
import { resolvePreferredOpenClawTmpDir } from "openclaw/plugin-sdk/temp-path";
import { parse, stringify } from "yaml";
import AjvPkg from "ajv";
import { ErrorCodes, errorShape } from "openclaw/plugin-sdk/gateway-runtime";
//#region extensions/lobster/src/lobster-ajv-cache.ts
const installedSymbol = Symbol.for("openclaw.lobster.ajv-compile-cache.installed");
const cacheSymbol = Symbol.for("openclaw.lobster.ajv-compile-cache.entries");
const maxEntries = 512;
const AjvCtor = AjvPkg;
function stableJsonStringify(value, seen = /* @__PURE__ */ new WeakSet()) {
	if (value === null || typeof value !== "object") return JSON.stringify(value);
	if (seen.has(value)) throw new TypeError("Cannot cache cyclic JSON schema");
	seen.add(value);
	if (Array.isArray(value)) {
		const items = value.map((entry) => stableJsonStringify(entry, seen));
		seen.delete(value);
		return `[${items.join(",")}]`;
	}
	const record = value;
	const properties = Object.keys(record).toSorted().filter((key) => record[key] !== void 0).map((key) => `${JSON.stringify(key)}:${stableJsonStringify(record[key], seen)}`);
	seen.delete(value);
	return `{${properties.join(",")}}`;
}
function compileCacheKey(schema) {
	try {
		return createHash("sha256").update(stableJsonStringify(schema)).digest("hex");
	} catch {
		return null;
	}
}
function readCompileCache(instance) {
	let cache = instance[cacheSymbol];
	if (!cache) {
		cache = /* @__PURE__ */ new Map();
		Object.defineProperty(instance, cacheSymbol, {
			value: cache,
			configurable: true
		});
	}
	return cache;
}
function rememberCompiledValidator(params) {
	const { cache, instance, key, removeSchema, schema, validate } = params;
	if (!cache.has(key) && cache.size >= maxEntries) {
		const oldest = cache.keys().next().value;
		if (oldest !== void 0) {
			const evicted = cache.get(oldest);
			cache.delete(oldest);
			if (evicted) removeSchema.call(instance, evicted.schema);
		}
	}
	cache.set(key, {
		schema,
		validate
	});
}
function installLobsterAjvCompileCache() {
	const proto = AjvCtor.prototype;
	if (proto[installedSymbol]) return;
	const originalCompile = proto.compile;
	const originalRemoveSchema = proto.removeSchema;
	Object.defineProperty(proto, installedSymbol, {
		value: true,
		configurable: true
	});
	proto.compile = function compileWithContentCache(schema) {
		const key = compileCacheKey(schema);
		if (!key) return originalCompile.call(this, schema);
		const cache = readCompileCache(this);
		const cached = cache.get(key);
		if (cached) return cached.validate;
		const validate = originalCompile.call(this, schema);
		rememberCompiledValidator({
			cache,
			instance: this,
			key,
			removeSchema: originalRemoveSchema,
			schema,
			validate
		});
		return validate;
	};
	proto.removeSchema = function removeSchemaAndClearContentCache(schemaKeyRef) {
		this[cacheSymbol]?.clear();
		return originalRemoveSchema.call(this, schemaKeyRef);
	};
}
//#endregion
//#region extensions/lobster/src/lobster-runner.ts
const lobsterRequire = createRequire(import.meta.url);
function toEmbeddedToolRuntime(moduleExports, source) {
	const { runToolRequest, resumeToolRequest } = moduleExports;
	if (typeof runToolRequest === "function" && typeof resumeToolRequest === "function") return {
		...typeof moduleExports.createDefaultRegistry === "function" ? { createDefaultRegistry: moduleExports.createDefaultRegistry } : {},
		runToolRequest,
		resumeToolRequest
	};
	throw new Error(`${source} does not export Lobster embedded runtime functions`);
}
function findLobsterPackageRoot(resolvedEntryPath) {
	let dir = path.dirname(resolvedEntryPath);
	while (true) {
		const packageJsonPath = path.join(dir, "package.json");
		try {
			if (JSON.parse(readFileSync(packageJsonPath, "utf8")).name === "@clawdbot/lobster") return dir;
		} catch {}
		const parent = path.dirname(dir);
		if (parent === dir) throw new Error(`Could not locate @clawdbot/lobster package root from ${resolvedEntryPath}`);
		dir = parent;
	}
}
function normalizeForCwdSandbox(p) {
	const normalized = path.normalize(p);
	return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}
function resolveLobsterCwd(cwdRaw) {
	if (typeof cwdRaw !== "string" || !cwdRaw.trim()) return process.cwd();
	const cwd = cwdRaw.trim();
	if (path.isAbsolute(cwd)) throw new Error("cwd must be a relative path");
	const base = process.cwd();
	const resolved = path.resolve(base, cwd);
	const rel = path.relative(normalizeForCwdSandbox(base), normalizeForCwdSandbox(resolved));
	if (rel === "" || rel === ".") return resolved;
	if (rel.startsWith("..") || path.isAbsolute(rel)) throw new Error("cwd must stay within the gateway working directory");
	return resolved;
}
function createLimitedSink(maxBytes, label) {
	let bytes = 0;
	return new Writable({ write(chunk, _encoding, callback) {
		bytes += Buffer.byteLength(String(chunk), "utf8");
		if (bytes > maxBytes) {
			callback(/* @__PURE__ */ new Error(`lobster ${label} exceeded maxStdoutBytes`));
			return;
		}
		callback();
	} });
}
function normalizeEnvelope(envelope) {
	if (envelope.ok) {
		if (envelope.status === "needs_input") return {
			ok: false,
			error: {
				type: "unsupported_status",
				message: "Lobster input requests are not supported by the OpenClaw Lobster tool yet"
			}
		};
		return {
			ok: true,
			status: envelope.status ?? "ok",
			output: Array.isArray(envelope.output) ? envelope.output : [],
			requiresApproval: envelope.requiresApproval ? {
				type: "approval_request",
				prompt: envelope.requiresApproval.prompt,
				items: envelope.requiresApproval.items,
				...envelope.requiresApproval.resumeToken ? { resumeToken: envelope.requiresApproval.resumeToken } : {},
				...envelope.requiresApproval.approvalId ? { approvalId: envelope.requiresApproval.approvalId } : {}
			} : null
		};
	}
	return {
		ok: false,
		error: {
			type: envelope.error?.type,
			message: envelope.error?.message ?? "lobster runtime failed"
		}
	};
}
function throwOnErrorEnvelope(envelope) {
	if (envelope.ok) return envelope;
	const message = envelope.error.message;
	if (/^OpenClaw tool ".+" unavailable for invoking agent:/u.test(message)) {
		const err = new Error(message);
		err.name = "ToolAuthorizationError";
		err.status = 403;
		throw err;
	}
	throw new Error(message);
}
async function resolveWorkflowFile(candidate, cwd) {
	const resolved = path.isAbsolute(candidate) ? candidate : path.resolve(cwd, candidate);
	if (!(await stat(resolved)).isFile()) throw new Error("Workflow path is not a file");
	const ext = path.extname(resolved).toLowerCase();
	if (![
		".lobster",
		".yaml",
		".yml",
		".json"
	].includes(ext)) throw new Error("Workflow file must end in .lobster, .yaml, .yml, or .json");
	return resolved;
}
async function detectWorkflowFile(candidate, cwd) {
	const trimmed = candidate.trim();
	if (!trimmed || trimmed.includes("|")) return null;
	try {
		return await resolveWorkflowFile(trimmed, cwd);
	} catch {
		return null;
	}
}
function parseWorkflowArgs(argsJson) {
	return JSON.parse(argsJson);
}
function quotePipelineArg(value) {
	return `'${value.replaceAll("'", "'\\''")}'`;
}
async function* streamFromItems(items) {
	for (const item of items) yield item;
}
async function drainInput(input) {
	for await (const item of input);
}
function readBooleanArg(value) {
	return value === true || value === "true" || value === "1";
}
function readStringArg(value) {
	return typeof value === "string" && value.trim() ? value.trim() : void 0;
}
function readPositiveIntegerArg(value, label) {
	if (value === void 0 || value === null || value === "") return;
	const parsed = typeof value === "number" ? value : Number(value);
	if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`${label} must be a positive integer`);
	return parsed;
}
function parseArgsJson(raw, commandName) {
	if (raw === void 0) return {};
	if (typeof raw !== "string") throw new Error(`${commandName} --args-json must be a JSON object`);
	let parsed;
	try {
		parsed = JSON.parse(raw);
	} catch {
		throw new Error(`${commandName} --args-json must be valid JSON`);
	}
	if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error(`${commandName} --args-json must be a JSON object`);
	return parsed;
}
function isRecord(value) {
	return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
function looksLikeWorkflowFile(value) {
	return /\.(lobster|ya?ml|json)$/iu.test(value) || value.includes("/") || value.includes("\\");
}
function workflowStepArgs(step) {
	return isRecord(step.workflow_args) ? { ...step.workflow_args } : void 0;
}
function buildWorkflowPipeline(params) {
	const parts = ["lobster.workflow"];
	if (params.workflowId) {
		parts.push("--workflow-id", quotePipelineArg(params.workflowId));
		if (params.workflowRevision !== void 0) parts.push("--workflow-revision", quotePipelineArg(String(params.workflowRevision)));
	} else if (params.file) parts.push("--file", quotePipelineArg(params.file));
	else throw new Error("workflow step requires workflowId or file");
	if (params.args && Object.keys(params.args).length > 0) parts.push("--args-json", quotePipelineArg(JSON.stringify(params.args)));
	if (params.inputKey) parts.push("--input-key", quotePipelineArg(params.inputKey));
	return parts.join(" ");
}
function normalizeWorkflowReferenceStep(step) {
	if (typeof step.pipeline === "string" && step.pipeline.trim()) return false;
	const workflowValue = readStringArg(step.workflow);
	if (!workflowValue) return false;
	const ref = isRecord(step.openclaw_workflow_ref) ? step.openclaw_workflow_ref : {};
	const refTarget = readStringArg(ref.target);
	const refWorkflowId = readStringArg(ref.workflowId);
	const refFile = readStringArg(ref.file);
	const revision = readPositiveIntegerArg(ref.workflowRevision, "workflowRevision") ?? readPositiveIntegerArg(step.workflowRevision ?? step.workflow_revision, "workflowRevision");
	const args = workflowStepArgs(step);
	const inputKey = readStringArg(ref.inputKey) ?? (typeof args?.input === "string" && args.input.trim() ? "input" : void 0);
	if (inputKey && args && inputKey in args) {
		step.stdin ??= args[inputKey];
		delete args[inputKey];
	}
	step.pipeline = buildWorkflowPipeline({
		...refTarget === "file" || Boolean(refFile) || !refWorkflowId && looksLikeWorkflowFile(workflowValue) ? { file: refFile ?? workflowValue } : { workflowId: refWorkflowId ?? workflowValue },
		...revision !== void 0 ? { workflowRevision: revision } : {},
		...args && Object.keys(args).length > 0 ? { args } : {},
		...inputKey ? { inputKey } : {}
	});
	return true;
}
function normalizeParallelBranch(value) {
	if (!isRecord(value)) return null;
	const id = readStringArg(value.id);
	const pipeline = readStringArg(value.pipeline);
	if (!id || !pipeline) return null;
	return {
		id,
		pipeline
	};
}
function normalizeParallelStep(step) {
	if (typeof step.pipeline === "string" && step.pipeline.trim()) return false;
	const parallel = isRecord(step.parallel) ? step.parallel : void 0;
	const rawBranches = Array.isArray(parallel?.branches) ? parallel.branches : void 0;
	if (!rawBranches?.length) return false;
	const branches = rawBranches.map(normalizeParallelBranch);
	if (branches.some((branch) => branch === null)) return false;
	step.pipeline = `lobster.parallel --branches-json ${quotePipelineArg(JSON.stringify(branches))}`;
	return true;
}
function normalizeWorkflowReferencesInDocument(value) {
	if (!isRecord(value) || !Array.isArray(value.steps)) return false;
	let changed = false;
	for (const step of value.steps) {
		if (!isRecord(step)) continue;
		changed = normalizeWorkflowReferenceStep(step) || changed;
		changed = normalizeParallelStep(step) || changed;
	}
	return changed;
}
async function materializeOpenClawWorkflowFile(filePath) {
	const raw = await readFile(filePath, "utf8");
	const parsed = path.extname(filePath).toLowerCase() === ".json" ? JSON.parse(raw) : parse(raw);
	if (!normalizeWorkflowReferencesInDocument(parsed)) return filePath;
	const serialized = stringify(parsed);
	const hash = createHash("sha256").update(`${filePath}\0${serialized}`).digest("hex").slice(0, 16);
	const normalizedPath = path.join(resolvePreferredOpenClawTmpDir(), "openclaw-lobster-workflows", `${hash}.lobster`);
	await mkdir(path.dirname(normalizedPath), { recursive: true });
	await writeFile(normalizedPath, serialized, "utf8");
	return normalizedPath;
}
async function collectInput(input) {
	const items = [];
	for await (const item of input) items.push(item);
	return items;
}
function mergeWorkflowInputArgs(args, items, inputKey) {
	if (items.length === 0) return args;
	return {
		...args,
		[inputKey]: items.length === 1 ? items[0] : items
	};
}
function readWorkflowDepth(env) {
	const value = Number(env?.OPENCLAW_LOBSTER_WORKFLOW_DEPTH);
	return Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
}
function createLobsterWorkflowCommand(runtime, resolvePublishedWorkflow) {
	return {
		name: "lobster.workflow",
		meta: {
			description: "Run a published or file-based Lobster workflow inside the current Lobster run",
			sideEffects: ["runs_lobster_workflow"]
		},
		async run({ input, args, ctx }) {
			const depth = readWorkflowDepth(ctx.env);
			if (depth >= 16) throw new Error("Nested Lobster workflow depth exceeded");
			const workflowId = readStringArg(args.workflowId) ?? readStringArg(args["workflow-id"]) ?? readStringArg(args.workflow);
			const file = readStringArg(args.file);
			if (workflowId && file) throw new Error("lobster.workflow accepts workflow-id or file, not both");
			if (!workflowId && !file) throw new Error("lobster.workflow requires --workflow-id or --file");
			const workflowRevision = readPositiveIntegerArg(args.workflowRevision, "workflowRevision") ?? readPositiveIntegerArg(args["workflow-revision"], "workflowRevision");
			let filePath;
			if (workflowId) {
				if (!resolvePublishedWorkflow) throw new Error("Published workflow resolution is unavailable");
				filePath = await resolvePublishedWorkflow({
					workflowId,
					workflowRevision
				});
			} else filePath = await resolveWorkflowFile(String(file), ctx.cwd ?? process.cwd());
			const baseArgs = parseArgsJson(args["args-json"], "lobster.workflow");
			const inputKey = readStringArg(args.inputKey) ?? readStringArg(args["input-key"]) ?? "input";
			const workflowArgs = mergeWorkflowInputArgs(baseArgs, await collectInput(input), inputKey);
			const workflowPath = await materializeOpenClawWorkflowFile(filePath);
			const envelope = await runtime.runToolRequest({
				filePath: workflowPath,
				args: workflowArgs,
				ctx: {
					...ctx,
					env: {
						...ctx.env,
						OPENCLAW_LOBSTER_WORKFLOW_DEPTH: String(depth + 1)
					}
				}
			});
			if (!envelope.ok) throw new Error(envelope.error?.message ?? "nested Lobster workflow failed");
			if (envelope.status === "needs_approval" || envelope.status === "needs_input") throw new Error(`Nested Lobster workflow ${workflowId ?? file} paused for ${envelope.status}; nested pause/resume is not supported yet`);
			if (envelope.status === "cancelled") return { output: streamFromItems([]) };
			return { output: streamFromItems(Array.isArray(envelope.output) ? envelope.output : []) };
		}
	};
}
function parseParallelBranches(raw) {
	if (typeof raw !== "string") throw new Error("lobster.parallel --branches-json must be a JSON array");
	let parsed;
	try {
		parsed = JSON.parse(raw);
	} catch {
		throw new Error("lobster.parallel --branches-json must be valid JSON");
	}
	if (!Array.isArray(parsed) || parsed.length === 0) throw new Error("lobster.parallel --branches-json must be a non-empty JSON array");
	return parsed.map((item, index) => {
		if (!isRecord(item)) throw new Error(`lobster.parallel branch ${index + 1} must be an object`);
		const id = readStringArg(item.id);
		const pipeline = readStringArg(item.pipeline);
		if (!id) throw new Error(`lobster.parallel branch ${index + 1} requires id`);
		if (!pipeline) throw new Error(`lobster.parallel branch ${id} requires pipeline`);
		return {
			id,
			pipeline
		};
	});
}
function createLobsterParallelCommand(runtime) {
	return {
		name: "lobster.parallel",
		meta: {
			description: "Run multiple Lobster branch pipelines concurrently inside the current Lobster run",
			sideEffects: ["runs_parallel_lobster_branches"]
		},
		async run({ input, args, ctx }) {
			await drainInput(input);
			const branches = parseParallelBranches(args["branches-json"] ?? args.branchesJson);
			return { output: streamFromItems(await Promise.all(branches.map(async (branch) => {
				const envelope = await runtime.runToolRequest({
					pipeline: branch.pipeline,
					ctx
				});
				if (!envelope.ok) throw new Error(`lobster.parallel branch ${branch.id} failed: ${envelope.error?.message ?? "branch failed"}`);
				if (envelope.status === "needs_approval" || envelope.status === "needs_input") throw new Error(`lobster.parallel branch ${branch.id} paused for ${envelope.status}; parallel pause/resume is not supported yet`);
				return {
					id: branch.id,
					status: envelope.status ?? "ok",
					output: Array.isArray(envelope.output) ? envelope.output : []
				};
			}))) };
		}
	};
}
function createOpenClawInvokeCommand(commandName, invokeNativeTool) {
	return {
		name: commandName,
		meta: {
			description: "Call an OpenClaw tool through the invoking agent's in-process tool context",
			sideEffects: ["calls_openclaw_tool"]
		},
		async run({ input, args, ctx }) {
			if (args.url !== void 0 || args.token !== void 0) throw new Error(`${commandName} runs in-process inside OpenClaw; --url and --token are not accepted`);
			if (args.sessionKey !== void 0 || args["session-key"] !== void 0) throw new Error(`${commandName} uses the invoking agent session; --session-key is not accepted`);
			const tool = readStringArg(args.tool);
			const action = readStringArg(args.action);
			if (!tool || !action) throw new Error(`${commandName} requires --tool and --action`);
			const toolArgs = parseArgsJson(args["args-json"], commandName);
			const each = readBooleanArg(args.each);
			const itemKey = readStringArg(args.itemKey) ?? readStringArg(args["item-key"]) ?? "item";
			const idempotencyKey = readStringArg(args.idempotencyKey) ?? readStringArg(args["idempotency-key"]);
			const dryRun = args.dryRun !== void 0 || args["dry-run"] !== void 0 ? readBooleanArg(args.dryRun ?? args["dry-run"]) : void 0;
			if (!each) {
				await drainInput(input);
				const result = await invokeNativeTool({
					tool,
					action,
					args: toolArgs,
					...idempotencyKey ? { idempotencyKey } : {},
					...dryRun !== void 0 ? { dryRun } : {},
					...ctx?.signal ? { signal: ctx.signal } : {}
				});
				return { output: streamFromItems(Array.isArray(result) ? result : [result]) };
			}
			const output = [];
			for await (const item of input) {
				const result = await invokeNativeTool({
					tool,
					action,
					args: {
						...toolArgs,
						[itemKey]: item
					},
					...idempotencyKey ? { idempotencyKey } : {},
					...dryRun !== void 0 ? { dryRun } : {},
					...ctx?.signal ? { signal: ctx.signal } : {}
				});
				output.push(...Array.isArray(result) ? result : [result]);
			}
			return { output: streamFromItems(output) };
		}
	};
}
function createOpenClawRegistry(base, options) {
	const openclawInvoke = options.invokeNativeTool ? createOpenClawInvokeCommand("openclaw.invoke", options.invokeNativeTool) : void 0;
	const clawdInvoke = options.invokeNativeTool ? createOpenClawInvokeCommand("clawd.invoke", options.invokeNativeTool) : void 0;
	return {
		get(name) {
			if (openclawInvoke && name === openclawInvoke.name) return openclawInvoke;
			if (clawdInvoke && name === clawdInvoke.name) return clawdInvoke;
			if (options.workflowCommand && name === options.workflowCommand.name) return options.workflowCommand;
			if (options.parallelCommand && name === options.parallelCommand.name) return options.parallelCommand;
			return base.get(name);
		},
		list() {
			return Array.from(new Set([
				...base.list(),
				...openclawInvoke ? [openclawInvoke.name] : [],
				...clawdInvoke ? [clawdInvoke.name] : [],
				...options.workflowCommand ? [options.workflowCommand.name] : [],
				...options.parallelCommand ? [options.parallelCommand.name] : []
			])).toSorted();
		}
	};
}
function createEmbeddedToolContext(params, runtime, options, signal) {
	const env = { ...process.env };
	const baseRegistry = runtime.createDefaultRegistry?.();
	const workflowCommand = createLobsterWorkflowCommand(runtime, options?.workflowResolver);
	const parallelCommand = createLobsterParallelCommand(runtime);
	const registry = baseRegistry ? createOpenClawRegistry(baseRegistry, {
		invokeNativeTool: options?.nativeToolInvoker,
		workflowCommand,
		parallelCommand
	}) : void 0;
	return {
		cwd: params.cwd,
		env,
		mode: "tool",
		stdin: Readable.from([]),
		stdout: createLimitedSink(Math.max(1024, params.maxStdoutBytes), "stdout"),
		stderr: createLimitedSink(Math.max(1024, params.maxStdoutBytes), "stderr"),
		signal,
		...registry ? { registry } : {}
	};
}
async function withTimeout(timeoutMs, fn) {
	const timeout = Math.max(200, timeoutMs);
	const controller = new AbortController();
	return await new Promise((resolve, reject) => {
		const onTimeout = () => {
			const error = /* @__PURE__ */ new Error("lobster runtime timed out");
			controller.abort(error);
			reject(error);
		};
		const timer = setTimeout(onTimeout, timeout);
		fn(controller.signal).then((value) => {
			clearTimeout(timer);
			resolve(value);
		}, (error) => {
			clearTimeout(timer);
			reject(error);
		});
	});
}
async function loadEmbeddedToolRuntimeFromPackage(options = {}) {
	installLobsterAjvCompileCache();
	const importModule = options.importModule ?? (async (specifier) => await import(specifier));
	const resolvePackageEntry = options.resolvePackageEntry ?? ((specifier) => lobsterRequire.resolve(specifier));
	let coreLoadError;
	try {
		return toEmbeddedToolRuntime(await importModule([
			"@clawdbot",
			"lobster",
			"core"
		].join("/")), "@clawdbot/lobster/core");
	} catch (error) {
		coreLoadError = error;
	}
	let fallbackLoadError;
	try {
		const packageRoot = findLobsterPackageRoot(resolvePackageEntry("@clawdbot/lobster"));
		const coreRuntimeUrl = pathToFileURL(path.join(packageRoot, "dist/src/core/index.js")).href;
		return toEmbeddedToolRuntime(await importModule(coreRuntimeUrl), coreRuntimeUrl);
	} catch (error) {
		fallbackLoadError = error;
	}
	throw new Error("Failed to load the Lobster embedded runtime", { cause: new AggregateError([coreLoadError, fallbackLoadError], "Both Lobster embedded runtime load paths failed") });
}
function createEmbeddedLobsterRunner(options) {
	const loadRuntime = options?.loadRuntime ?? loadEmbeddedToolRuntimeFromPackage;
	let runtimePromise;
	return { async run(params) {
		runtimePromise ??= loadRuntime();
		const runtime = await runtimePromise;
		return await withTimeout(params.timeoutMs, async (signal) => {
			const ctx = createEmbeddedToolContext(params, runtime, {
				nativeToolInvoker: options?.nativeToolInvoker,
				workflowResolver: options?.workflowResolver
			}, signal);
			if (params.action === "run") {
				const pipeline = params.pipeline?.trim() ?? "";
				if (!pipeline) throw new Error("pipeline required");
				const filePath = await detectWorkflowFile(pipeline, params.cwd);
				if (filePath) {
					const parsedArgsJson = params.argsJson?.trim() ?? "";
					let args;
					if (parsedArgsJson) try {
						args = parseWorkflowArgs(parsedArgsJson);
					} catch {
						throw new Error("run --args-json must be valid JSON");
					}
					const workflowPath = await materializeOpenClawWorkflowFile(filePath);
					return throwOnErrorEnvelope(normalizeEnvelope(await runtime.runToolRequest({
						filePath: workflowPath,
						args,
						ctx
					})));
				}
				return throwOnErrorEnvelope(normalizeEnvelope(await runtime.runToolRequest({
					pipeline,
					ctx
				})));
			}
			const token = params.token?.trim() ?? "";
			const approvalId = params.approvalId?.trim() ?? "";
			if (!token && !approvalId) throw new Error("token or approvalId required");
			if (typeof params.approve !== "boolean") throw new Error("approve required");
			return throwOnErrorEnvelope(normalizeEnvelope(await runtime.resumeToolRequest({
				...token ? { token } : {},
				...approvalId ? { approvalId } : {},
				approved: params.approve,
				ctx
			})));
		});
	} };
}
//#endregion
//#region extensions/lobster/src/lobster-taskflow.ts
function toJsonLike(value, seen = /* @__PURE__ */ new WeakSet()) {
	if (value === null) return null;
	switch (typeof value) {
		case "boolean":
		case "string": return value;
		case "number": return Number.isFinite(value) ? value : String(value);
		case "bigint": return value.toString();
		case "undefined":
		case "function":
		case "symbol": return null;
		case "object": {
			if (value instanceof Date) return value.toISOString();
			if (Array.isArray(value)) return value.map((item) => toJsonLike(item, seen));
			if (seen.has(value)) return "[Circular]";
			seen.add(value);
			const jsonObject = {};
			for (const [key, entry] of Object.entries(value)) {
				if (entry === void 0 || typeof entry === "function" || typeof entry === "symbol") continue;
				jsonObject[key] = toJsonLike(entry, seen);
			}
			seen.delete(value);
			return jsonObject;
		}
	}
	return null;
}
function buildApprovalWaitState(envelope) {
	if (!envelope.requiresApproval) return {
		kind: "lobster_approval",
		prompt: "",
		items: []
	};
	return {
		kind: "lobster_approval",
		prompt: envelope.requiresApproval.prompt,
		items: envelope.requiresApproval.items.map((item) => toJsonLike(item)),
		...envelope.requiresApproval.resumeToken ? { resumeToken: envelope.requiresApproval.resumeToken } : {},
		...envelope.requiresApproval.approvalId ? { approvalId: envelope.requiresApproval.approvalId } : {}
	};
}
function applyEnvelopeToFlow(params) {
	const { taskFlow, flow, envelope, waitingStep } = params;
	if (!envelope.ok) return taskFlow.fail({
		flowId: flow.flowId,
		expectedRevision: flow.revision
	});
	if (envelope.status === "needs_approval") return taskFlow.setWaiting({
		flowId: flow.flowId,
		expectedRevision: flow.revision,
		currentStep: waitingStep,
		waitJson: buildApprovalWaitState(envelope)
	});
	return taskFlow.finish({
		flowId: flow.flowId,
		expectedRevision: flow.revision
	});
}
function buildEnvelopeError(envelope) {
	return new Error(envelope.error.message);
}
async function runManagedLobsterFlow(params) {
	const flow = params.taskFlow.createManaged({
		controllerId: params.controllerId,
		goal: params.goal,
		currentStep: params.currentStep ?? "run_lobster",
		...params.stateJson !== void 0 ? { stateJson: params.stateJson } : {}
	});
	try {
		const envelope = await params.runner.run(params.runnerParams);
		const mutation = applyEnvelopeToFlow({
			taskFlow: params.taskFlow,
			flow,
			envelope,
			waitingStep: params.waitingStep ?? "await_lobster_approval"
		});
		if (!envelope.ok) return {
			ok: false,
			flow,
			mutation,
			error: buildEnvelopeError(envelope)
		};
		return {
			ok: true,
			envelope,
			flow,
			mutation
		};
	} catch (error) {
		const err = error instanceof Error ? error : new Error(String(error));
		try {
			return {
				ok: false,
				flow,
				mutation: params.taskFlow.fail({
					flowId: flow.flowId,
					expectedRevision: flow.revision
				}),
				error: err
			};
		} catch {
			return {
				ok: false,
				flow,
				error: err
			};
		}
	}
}
async function resumeManagedLobsterFlow(params) {
	const resumed = params.taskFlow.resume({
		flowId: params.flowId,
		expectedRevision: params.expectedRevision,
		status: "running",
		currentStep: params.currentStep ?? "resume_lobster"
	});
	if (!resumed.applied) return {
		ok: false,
		mutation: resumed,
		error: /* @__PURE__ */ new Error(`TaskFlow resume failed: ${resumed.code}`)
	};
	try {
		const envelope = await params.runner.run(params.runnerParams);
		const mutation = applyEnvelopeToFlow({
			taskFlow: params.taskFlow,
			flow: resumed.flow,
			envelope,
			waitingStep: params.waitingStep ?? "await_lobster_approval"
		});
		if (!envelope.ok) return {
			ok: false,
			flow: resumed.flow,
			mutation,
			error: buildEnvelopeError(envelope)
		};
		return {
			ok: true,
			envelope,
			flow: resumed.flow,
			mutation
		};
	} catch (error) {
		const err = error instanceof Error ? error : new Error(String(error));
		try {
			const mutation = params.taskFlow.fail({
				flowId: params.flowId,
				expectedRevision: resumed.flow.revision
			});
			return {
				ok: false,
				flow: resumed.flow,
				mutation,
				error: err
			};
		} catch {
			return {
				ok: false,
				flow: resumed.flow,
				error: err
			};
		}
	}
}
//#endregion
//#region extensions/lobster/src/lobster-workflow-store.ts
const WORKFLOW_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,127}$/u;
function sha256(value) {
	return createHash("sha256").update(value).digest("hex");
}
function byteLength(value) {
	return Buffer.byteLength(value, "utf8");
}
function normalizeTrimmedString(value) {
	return typeof value === "string" && value.trim() ? value.trim() : void 0;
}
function slugify(value) {
	return value.trim().toLowerCase().replace(/[^a-z0-9._-]+/gu, "-").replace(/^-+|-+$/gu, "").slice(0, 128);
}
function normalizeWorkflowId(params) {
	const explicitId = normalizeTrimmedString(params.workflowId);
	const explicitSlug = normalizeTrimmedString(params.slug);
	const name = normalizeTrimmedString(params.name);
	const slug = (explicitSlug ? slugify(explicitSlug) : void 0) ?? (name ? slugify(name) : void 0) ?? `workflow-${sha256(params.workflowYaml).slice(0, 12)}`;
	const workflowId = explicitId ? slugify(explicitId) : slug;
	if (!WORKFLOW_ID_PATTERN.test(workflowId)) throw new Error("workflowId must contain a safe lowercase id");
	if (explicitSlug && !WORKFLOW_ID_PATTERN.test(slug)) throw new Error("slug must contain a safe lowercase id");
	return {
		workflowId,
		...slug ? { slug } : {}
	};
}
function normalizeMetadata(value) {
	const serialized = JSON.stringify(value);
	if (serialized === void 0) throw new Error("metadata must be JSON-serializable");
	return JSON.parse(serialized);
}
function workflowDir(stateDir, workflowId) {
	return path.join(stateDir, "lobster", "workflows", workflowId);
}
function workflowPath(stateDir, workflowId, revision) {
	return path.join(workflowDir(stateDir, workflowId), `rev-${revision}.lobster`);
}
function workflowIndexPath(stateDir) {
	return path.join(stateDir, "lobster", "workflows", "index.json");
}
async function readWorkflowIndex(stateDir) {
	try {
		const raw = await readFile(workflowIndexPath(stateDir), "utf8");
		const parsed = JSON.parse(raw);
		if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
		return parsed;
	} catch (error) {
		if (error && typeof error === "object" && error.code === "ENOENT") return {};
		throw error;
	}
}
async function writeWorkflowIndex(stateDir, index) {
	const filePath = workflowIndexPath(stateDir);
	await mkdir(path.dirname(filePath), { recursive: true });
	const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
	await writeFile(tmpPath, JSON.stringify(index, null, 2), "utf8");
	await rename(tmpPath, filePath);
}
function createLobsterWorkflowFileStore(stateDir, maxEntries = 500) {
	return {
		async lookup(key) {
			const index = await readWorkflowIndex(stateDir);
			return index[key];
		},
		async register(key, value) {
			const index = await readWorkflowIndex(stateDir);
			index[key] = value;
			const entries = Object.entries(index).toSorted((a, b) => {
				const aUpdated = typeof a[1]?.updatedAt === "string" ? a[1].updatedAt : "";
				const bUpdated = typeof b[1]?.updatedAt === "string" ? b[1].updatedAt : "";
				return aUpdated.localeCompare(bUpdated) || a[0].localeCompare(b[0]);
			});
			for (const [entryKey] of entries.slice(0, Math.max(0, entries.length - maxEntries))) {
				if (entryKey !== key) delete index[entryKey];
			}
			await writeWorkflowIndex(stateDir, index);
		},
		async delete(key) {
			const index = await readWorkflowIndex(stateDir);
			delete index[key];
			await writeWorkflowIndex(stateDir, index);
		},
		async entries() {
			const index = await readWorkflowIndex(stateDir);
			return Object.entries(index).map(([key, value]) => ({ key, value }));
		}
	};
}
async function assertWorkflowFileAvailable(record) {
	if (!(await stat(record.workflowPath)).isFile()) throw new Error(`Published workflow is not a file: ${record.workflowId}`);
}
function createLobsterWorkflowStore(options) {
	const now = options.now ?? (() => /* @__PURE__ */ new Date());
	return {
		async publish(params) {
			const workflowYaml = normalizeTrimmedString(params.workflowYaml);
			if (!workflowYaml) throw new Error("workflowYaml required");
			const id = normalizeWorkflowId({
				workflowYaml,
				workflowId: params.workflowId,
				slug: params.slug,
				name: params.name
			});
			const existing = await options.store.lookup(id.workflowId);
			if (existing && params.overwrite === false) throw new Error(`workflow already exists: ${id.workflowId}`);
			const revision = existing ? existing.revision + 1 : 1;
			const timestamp = now().toISOString();
			const filePath = workflowPath(options.stateDir, id.workflowId, revision);
			await mkdir(path.dirname(filePath), { recursive: true });
			await writeFile(filePath, workflowYaml, "utf8");
			const record = {
				workflowId: id.workflowId,
				revision,
				...params.name ? { name: params.name } : {},
				...id.slug ? { slug: id.slug } : {},
				...params.cwd ? { cwd: params.cwd } : {},
				...params.metadata !== void 0 ? { metadata: normalizeMetadata(params.metadata) } : {},
				workflowPath: filePath,
				sha256: sha256(workflowYaml),
				bytes: byteLength(workflowYaml),
				createdAt: existing?.createdAt ?? timestamp,
				updatedAt: timestamp
			};
			await options.store.register(record.workflowId, record);
			return record;
		},
		async list(params = {}) {
			const limit = Math.max(1, Math.min(250, params.limit ?? 50));
			const cursor = normalizeTrimmedString(params.cursor);
			const query = normalizeTrimmedString(params.query)?.toLowerCase();
			const sorted = (await options.store.entries()).map((entry) => entry.value).filter((record) => {
				if (!query) return true;
				return record.workflowId.toLowerCase().includes(query) || record.name?.toLowerCase().includes(query) || record.slug?.toLowerCase().includes(query);
			}).toSorted((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.workflowId.localeCompare(b.workflowId));
			const startIndex = cursor ? Math.max(0, sorted.findIndex((record) => record.workflowId === cursor) + 1) : 0;
			const workflows = sorted.slice(startIndex, startIndex + limit);
			const next = sorted[startIndex + limit];
			return {
				workflows,
				...next ? { nextCursor: next.workflowId } : {}
			};
		},
		async get(workflowId, opts = {}) {
			const record = await options.store.lookup(workflowId);
			if (!record) return;
			if (!opts.includeDocument) return record;
			return {
				...record,
				workflowYaml: await readFile(record.workflowPath, "utf8")
			};
		},
		async delete(workflowId, opts = {}) {
			const record = await options.store.lookup(workflowId);
			if (!record) return {
				deleted: false,
				workflowId
			};
			if (opts.expectedRevision !== void 0 && opts.expectedRevision !== record.revision) throw new Error(`workflow revision mismatch: expected ${opts.expectedRevision}, found ${record.revision}`);
			await options.store.delete(workflowId);
			await rm(workflowDir(options.stateDir, workflowId), {
				recursive: true,
				force: true
			});
			return {
				deleted: true,
				workflowId
			};
		},
		async materialize(workflowId, opts = {}) {
			const record = await options.store.lookup(workflowId);
			if (!record) throw new Error(`unknown workflowId: ${workflowId}`);
			if (opts.expectedRevision !== void 0 && opts.expectedRevision !== record.revision) {
				const historicalPath = workflowPath(options.stateDir, workflowId, opts.expectedRevision);
				try {
					const workflowYaml = await readFile(historicalPath, "utf8");
					return {
						...record,
						revision: opts.expectedRevision,
						workflowPath: historicalPath,
						sha256: sha256(workflowYaml),
						bytes: byteLength(workflowYaml)
					};
				} catch {
					throw new Error(`workflow revision mismatch: expected ${opts.expectedRevision}, found ${record.revision}`);
				}
			}
			await assertWorkflowFileAvailable(record);
			return record;
		}
	};
}
function createLobsterWorkflowStoreFromApi(api) {
	const stateDir = api.runtime.state.resolveStateDir();
	return createLobsterWorkflowStore({
		stateDir,
		store: createLobsterWorkflowFileStore(stateDir, 500)
	});
}
//#endregion
//#region extensions/lobster/src/lobster-tool.ts
function readOptionalTrimmedString(value, fieldName) {
	if (value === void 0) return;
	if (typeof value !== "string") throw new Error(`${fieldName} must be a string`);
	const trimmed = value.trim();
	return trimmed ? trimmed : void 0;
}
function readOptionalNumber(value, fieldName) {
	if (value === void 0) return;
	if (typeof value !== "number" || !Number.isInteger(value)) throw new Error(`${fieldName} must be an integer`);
	return value;
}
function readOptionalBoolean(value, fieldName) {
	if (value === void 0) return;
	if (typeof value !== "boolean") throw new Error(`${fieldName} must be a boolean`);
	return value;
}
function readOptionalWorkflowRevision(value) {
	if (value === void 0) return;
	if (typeof value !== "number" || !Number.isInteger(value) || value < 1) throw new Error("workflowRevision must be a positive integer");
	return value;
}
function parseOptionalFlowStateJson(value) {
	if (value === void 0) return;
	if (typeof value !== "string") throw new Error("flowStateJson must be a JSON string");
	try {
		return JSON.parse(value);
	} catch {
		throw new Error("flowStateJson must be valid JSON");
	}
}
function parseRunFlowParams(params) {
	const controllerId = readOptionalTrimmedString(params.flowControllerId, "flowControllerId");
	const goal = readOptionalTrimmedString(params.flowGoal, "flowGoal");
	const currentStep = readOptionalTrimmedString(params.flowCurrentStep, "flowCurrentStep");
	const waitingStep = readOptionalTrimmedString(params.flowWaitingStep, "flowWaitingStep");
	const stateJson = parseOptionalFlowStateJson(params.flowStateJson);
	const resumeFlowId = readOptionalTrimmedString(params.flowId, "flowId");
	const resumeRevision = readOptionalNumber(params.flowExpectedRevision, "flowExpectedRevision");
	if (!(controllerId !== void 0 || goal !== void 0 || currentStep !== void 0 || waitingStep !== void 0 || stateJson !== void 0)) return null;
	if (resumeFlowId !== void 0 || resumeRevision !== void 0) throw new Error("run action does not accept flowId or flowExpectedRevision");
	if (!controllerId) throw new Error("flowControllerId required when using managed TaskFlow run mode");
	if (!goal) throw new Error("flowGoal required when using managed TaskFlow run mode");
	return {
		controllerId,
		goal,
		...currentStep ? { currentStep } : {},
		...waitingStep ? { waitingStep } : {},
		...stateJson !== void 0 ? { stateJson } : {}
	};
}
function parseResumeFlowParams(params) {
	const flowId = readOptionalTrimmedString(params.flowId, "flowId");
	const expectedRevision = readOptionalNumber(params.flowExpectedRevision, "flowExpectedRevision");
	const currentStep = readOptionalTrimmedString(params.flowCurrentStep, "flowCurrentStep");
	const waitingStep = readOptionalTrimmedString(params.flowWaitingStep, "flowWaitingStep");
	const token = readOptionalTrimmedString(params.token, "token");
	const approvalId = readOptionalTrimmedString(params.approvalId, "approvalId");
	const approve = readOptionalBoolean(params.approve, "approve");
	const runControllerId = readOptionalTrimmedString(params.flowControllerId, "flowControllerId");
	const runGoal = readOptionalTrimmedString(params.flowGoal, "flowGoal");
	const stateJson = params.flowStateJson;
	if (!(flowId !== void 0 || expectedRevision !== void 0 || currentStep !== void 0 || waitingStep !== void 0)) return null;
	if (runControllerId !== void 0 || runGoal !== void 0 || stateJson !== void 0) throw new Error("resume action does not accept flowControllerId, flowGoal, or flowStateJson");
	if (!flowId) throw new Error("flowId required when using managed TaskFlow resume mode");
	if (expectedRevision === void 0) throw new Error("flowExpectedRevision required when using managed TaskFlow resume mode");
	if (!token && !approvalId) throw new Error("token or approvalId required when using managed TaskFlow resume mode");
	if (approve === void 0) throw new Error("approve required when using managed TaskFlow resume mode");
	return {
		flowId,
		expectedRevision,
		...currentStep ? { currentStep } : {},
		...waitingStep ? { waitingStep } : {}
	};
}
function formatManagedFlowResult(result) {
	const details = {
		...result.envelope && typeof result.envelope === "object" && !Array.isArray(result.envelope) ? result.envelope : { envelope: result.envelope },
		flow: result.flow,
		mutation: result.mutation
	};
	return {
		content: [{
			type: "text",
			text: JSON.stringify(details, null, 2)
		}],
		details
	};
}
function requireTaskFlowRuntime(taskFlow, action) {
	if (!taskFlow) throw new Error(`Managed TaskFlow ${action} mode requires a bound taskFlow runtime`);
	return taskFlow;
}
function resolveTaskFlowRuntime(api, options) {
	if (options?.taskFlow) return options.taskFlow;
	const toolContext = options?.toolContext;
	if (!toolContext?.sessionKey) return;
	return api.runtime?.tasks.managedFlows?.fromToolContext(toolContext);
}
function resolveWorkflowStore(api, options) {
	return options?.workflowStore ?? createLobsterWorkflowStoreFromApi(api);
}
async function materializeInlineWorkflowYaml(api, workflowYaml) {
	const trimmed = workflowYaml.trim();
	if (!trimmed) throw new Error("workflowYaml must not be empty");
	const hash = createHash("sha256").update(trimmed).digest("hex").slice(0, 16);
	const stateDir = api.runtime.state.resolveStateDir();
	const filePath = path.join(stateDir, "lobster", "inline-runs", `${hash}.lobster`);
	await mkdir(path.dirname(filePath), { recursive: true });
	await writeFile(filePath, trimmed, "utf8");
	return filePath;
}
async function resolveWorkflowPipeline(params) {
	const pipeline = typeof params.pipeline === "string" ? params.pipeline : void 0;
	const workflowId = readOptionalTrimmedString(params.workflowId, "workflowId");
	const workflowYaml = typeof params.workflowYaml === "string" && params.workflowYaml.trim() ? params.workflowYaml : void 0;
	const workflowRevision = readOptionalWorkflowRevision(params.workflowRevision);
	if (params.action !== "run") {
		if (workflowId !== void 0 || workflowYaml !== void 0 || workflowRevision !== void 0) throw new Error("resume action does not accept workflowId, workflowRevision, or workflowYaml");
		return pipeline;
	}
	if ([
		pipeline,
		workflowId,
		workflowYaml
	].filter((value) => value !== void 0).length > 1) throw new Error("run action accepts only one of pipeline, workflowId, or workflowYaml");
	if (workflowRevision !== void 0 && !workflowId) throw new Error("workflowRevision requires workflowId");
	if (workflowId) return (await resolveWorkflowStore(params.api, params.options).materialize(workflowId, { expectedRevision: workflowRevision })).workflowPath;
	if (workflowYaml) return await materializeInlineWorkflowYaml(params.api, workflowYaml);
	return pipeline;
}
function resolveManagedFlowToolResult(result) {
	if (!result.ok) throw result.error;
	return formatManagedFlowResult(result);
}
function createOpenClawNativeToolInvoker(api, toolContext) {
	if (!toolContext) return;
	return async ({ tool, action, args, idempotencyKey, dryRun, signal }) => {
		const invoke = api.runtime?.tools?.invoke;
		if (!invoke) throw new Error("OpenClaw runtime tools.invoke unavailable");
		const outcome = await invoke({
			ctx: toolContext,
			tool,
			action,
			args,
			...idempotencyKey ? { idempotencyKey } : {},
			...dryRun !== void 0 ? { dryRun } : {},
			...signal ? { signal } : {},
			toolCallIdPrefix: "lobster"
		});
		if (outcome.ok) return outcome.result;
		throw new Error(`OpenClaw tool "${outcome.toolName || tool}" unavailable for invoking agent: ${outcome.error.message}`);
	};
}
function createLobsterTool(api, options) {
	const nativeToolInvoker = options?.nativeToolInvoker ?? createOpenClawNativeToolInvoker(api, options?.toolContext);
	const runner = options?.runner ?? createEmbeddedLobsterRunner({
		nativeToolInvoker,
		workflowResolver: async ({ workflowId, workflowRevision }) => {
			return (await resolveWorkflowStore(api, options).materialize(workflowId, { expectedRevision: workflowRevision })).workflowPath;
		}
	});
	return {
		name: "lobster",
		label: "Lobster Workflow",
		description: "Run Lobster pipelines as a local-first workflow runtime (typed JSON envelope + resumable approvals).",
		parameters: Type.Object({
			action: Type.Unsafe({
				type: "string",
				enum: ["run", "resume"]
			}),
			pipeline: Type.Optional(Type.String()),
			workflowId: Type.Optional(Type.String()),
			workflowRevision: Type.Optional(Type.Number()),
			workflowYaml: Type.Optional(Type.String()),
			argsJson: Type.Optional(Type.String()),
			token: Type.Optional(Type.String()),
			approvalId: Type.Optional(Type.String()),
			approve: Type.Optional(Type.Boolean()),
			cwd: Type.Optional(Type.String({ description: "Relative working directory (optional). Must stay within the gateway working directory." })),
			timeoutMs: Type.Optional(Type.Number()),
			maxStdoutBytes: Type.Optional(Type.Number()),
			flowControllerId: Type.Optional(Type.String()),
			flowGoal: Type.Optional(Type.String()),
			flowStateJson: Type.Optional(Type.String()),
			flowId: Type.Optional(Type.String()),
			flowExpectedRevision: Type.Optional(Type.Number()),
			flowCurrentStep: Type.Optional(Type.String()),
			flowWaitingStep: Type.Optional(Type.String())
		}),
		async execute(_id, params) {
			const action = typeof params.action === "string" ? params.action.trim() : "";
			if (!action) throw new Error("action required");
			if (action !== "run" && action !== "resume") throw new Error(`Unknown action: ${action}`);
			const cwd = resolveLobsterCwd(params.cwd);
			const timeoutMs = typeof params.timeoutMs === "number" ? params.timeoutMs : 2e4;
			const maxStdoutBytes = typeof params.maxStdoutBytes === "number" ? params.maxStdoutBytes : 512e3;
			const pipeline = await resolveWorkflowPipeline({
				api,
				options,
				action,
				pipeline: params.pipeline,
				workflowId: params.workflowId,
				workflowRevision: params.workflowRevision,
				workflowYaml: params.workflowYaml
			});
			const runnerParams = {
				action,
				...pipeline ? { pipeline } : {},
				...typeof params.argsJson === "string" ? { argsJson: params.argsJson } : {},
				...typeof params.token === "string" ? { token: params.token } : {},
				...typeof params.approvalId === "string" ? { approvalId: params.approvalId } : {},
				...typeof params.approve === "boolean" ? { approve: params.approve } : {},
				cwd,
				timeoutMs,
				maxStdoutBytes
			};
			if (action === "run") {
				const flowParams = parseRunFlowParams(params);
				if (flowParams) return resolveManagedFlowToolResult(await runManagedLobsterFlow({
					taskFlow: requireTaskFlowRuntime(resolveTaskFlowRuntime(api, options), "run"),
					runner,
					runnerParams,
					controllerId: flowParams.controllerId,
					goal: flowParams.goal,
					...flowParams.stateJson !== void 0 ? { stateJson: flowParams.stateJson } : {},
					...flowParams.currentStep ? { currentStep: flowParams.currentStep } : {},
					...flowParams.waitingStep ? { waitingStep: flowParams.waitingStep } : {}
				}));
			} else {
				const flowParams = parseResumeFlowParams(params);
				if (flowParams) return resolveManagedFlowToolResult(await resumeManagedLobsterFlow({
					taskFlow: requireTaskFlowRuntime(resolveTaskFlowRuntime(api, options), "resume"),
					runner,
					runnerParams,
					flowId: flowParams.flowId,
					expectedRevision: flowParams.expectedRevision,
					...flowParams.currentStep ? { currentStep: flowParams.currentStep } : {},
					...flowParams.waitingStep ? { waitingStep: flowParams.waitingStep } : {}
				}));
			}
			const envelope = await runner.run(runnerParams);
			if (!envelope.ok) throw new Error(envelope.error.message);
			return {
				content: [{
					type: "text",
					text: JSON.stringify(envelope, null, 2)
				}],
				details: envelope
			};
		}
	};
}
//#endregion
//#region extensions/lobster/src/lobster-workflow-gateway.ts
function stringParam(params, ...keys) {
	for (const key of keys) {
		const value = params[key];
		if (typeof value === "string" && value.trim()) return value.trim();
	}
}
function numberParam(params, key) {
	const value = params[key];
	if (value === void 0) return;
	if (typeof value !== "number" || !Number.isInteger(value)) throw new Error(`${key} must be an integer`);
	return value;
}
function booleanParam(params, key) {
	const value = params[key];
	if (value === void 0) return;
	if (typeof value !== "boolean") throw new Error(`${key} must be a boolean`);
	return value;
}
function objectParam(params, key) {
	const value = params[key];
	if (value === void 0) return;
	if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${key} must be an object`);
	return value;
}
function workflowIdParam(params) {
	const workflowId = stringParam(params, "workflowId", "id");
	if (!workflowId) throw new Error("workflowId required");
	return workflowId;
}
function respondError(respond, error, code = ErrorCodes.INVALID_REQUEST) {
	respond(false, void 0, errorShape(code, error instanceof Error ? error.message : String(error)));
}
function registerLobsterWorkflowGatewayMethods(api, options = {}) {
	const resolveStore = () => options.store ?? createLobsterWorkflowStoreFromApi(api);
	api.registerGatewayMethod("lobster.workflow.publish", async ({ params, respond }) => {
		try {
			respond(true, {
				ok: true,
				workflow: await resolveStore().publish({
					workflowYaml: stringParam(params, "workflowYaml", "document", "yaml") ?? "",
					workflowId: stringParam(params, "workflowId", "id"),
					slug: stringParam(params, "slug"),
					name: stringParam(params, "name"),
					cwd: stringParam(params, "cwd"),
					metadata: objectParam(params, "metadata"),
					overwrite: booleanParam(params, "overwrite")
				})
			});
		} catch (error) {
			respondError(respond, error);
		}
	}, { scope: "operator.write" });
	api.registerGatewayMethod("lobster.workflow.list", async ({ params, respond }) => {
		try {
			respond(true, {
				ok: true,
				...await resolveStore().list({
					limit: numberParam(params, "limit"),
					cursor: stringParam(params, "cursor"),
					query: stringParam(params, "query")
				})
			});
		} catch (error) {
			respondError(respond, error);
		}
	}, { scope: "operator.read" });
	api.registerGatewayMethod("lobster.workflow.get", async ({ params, respond }) => {
		try {
			const store = resolveStore();
			const workflowId = workflowIdParam(params);
			const workflow = await store.get(workflowId, { includeDocument: booleanParam(params, "includeDocument") });
			if (!workflow) {
				respond(false, void 0, errorShape(ErrorCodes.INVALID_REQUEST, "workflow not found"));
				return;
			}
			respond(true, {
				ok: true,
				workflow
			});
		} catch (error) {
			respondError(respond, error);
		}
	}, { scope: "operator.read" });
	api.registerGatewayMethod("lobster.workflow.delete", async ({ params, respond }) => {
		try {
			respond(true, {
				ok: true,
				...await resolveStore().delete(workflowIdParam(params), { expectedRevision: numberParam(params, "expectedRevision") })
			});
		} catch (error) {
			respondError(respond, error);
		}
	}, { scope: "operator.write" });
}
//#endregion
//#region extensions/lobster/index.ts
var lobster_default = definePluginEntry({
	id: "lobster",
	name: "Lobster",
	description: "Optional local shell helper tools",
	register(api) {
		registerLobsterWorkflowGatewayMethods(api);
		api.registerTool(((ctx) => {
			if (ctx.sandboxed) return null;
			return createLobsterTool(api, { toolContext: ctx });
		}), { optional: true });
	}
});
//#endregion
export { lobster_default as default };
