import {
  LOG_TRANSFORM_END_MARKER,
  LOG_TRANSFORM_MARKER,
  formatTransformDiff,
} from "./log-transform.js";

const colors = {
  green: "\u001b[32;1m",
  red: "\u001b[31;1m",
  yellow: "\u001b[33;1m",
  dim: "\u001b[38;5;236m",
  lightGray: "\u001b[38;5;247m",
  reset: "\u001b[0m",
};

function formatSectionLabel(label) {
  return `      ${colors.dim}[${label}]${colors.reset}`;
}

function getSuiteAndCaseTitles(task) {
  const segments = [];
  let current = task.suite;
  while (current) {
    if (current.name) {
      segments.unshift(current.name);
    }
    current = current.suite;
  }

  const project = task.projectName ? `[${task.projectName}] ` : "";
  return {
    suiteTitle: `${project}${segments.join(" > ")}`,
    caseTitle: task.name,
  };
}

function getSuiteKey(task) {
  const { suiteTitle } = getSuiteAndCaseTitles(task);
  const filepath = task?.file?.filepath ?? "";
  return `${filepath}::${suiteTitle}`;
}

export function formatStatus(status) {
  if (status === "pass") {
    return `${colors.green}${status}${colors.reset}`;
  }
  if (status === "fail") {
    return `${colors.red}${status}${colors.reset}`;
  }
  if (status === "skip") {
    return `${colors.yellow}${status}${colors.reset}`;
  }
  if (status === "todo") {
    return `${colors.dim}${status}${colors.reset}`;
  }
  return status;
}

export function colorizeDuration(duration, slowTestThreshold = 300) {
  if (typeof duration !== "number") {
    return "";
  }

  const rounded = Math.round(duration);
  const color = rounded > slowTestThreshold ? colors.yellow : colors.green;
  return `${color}${rounded}ms${colors.reset}`;
}

export function formatTestCaseSummary(task, slowTestThreshold) {
  const status = task.result?.state ?? "unknown";
  const duration = colorizeDuration(task.result?.duration, slowTestThreshold);
  const { caseTitle } = getSuiteAndCaseTitles(task);
  return `  └─ ${caseTitle} [${formatStatus(status)}]${
    duration ? ` (${duration})` : ""
  }`;
}

export function getStatusIcon(status) {
  if (status === "pass") {
    return `${colors.green}✓${colors.reset}`;
  }
  if (status === "fail") {
    return `${colors.red}✗${colors.reset}`;
  }
  if (status === "skip") {
    return `${colors.yellow}○${colors.reset}`;
  }
  if (status === "todo") {
    return `${colors.dim}◌${colors.reset}`;
  }
  return `${colors.dim}·${colors.reset}`;
}

export function getRelativePath(filepath, root = process.cwd()) {
  if (!filepath) return "";
  if (filepath.startsWith(`${root}/`)) {
    return filepath.slice(root.length + 1);
  }
  return filepath;
}

export function countTests(task) {
  if (!task) return 0;
  if (task.type === "test") return 1;
  if (!Array.isArray(task.tasks)) return 0;
  return task.tasks.reduce((sum, child) => sum + countTests(child), 0);
}

export function formatFileSummary(fileTask, root, slowTestThreshold) {
  const status = fileTask.result?.state ?? "unknown";
  const duration = colorizeDuration(fileTask.result?.duration, slowTestThreshold);
  const testCount = countTests(fileTask);
  const testLabel = testCount === 1 ? "test" : "tests";
  const path = getRelativePath(fileTask.filepath, root);
  return `${getStatusIcon(status)} ${path} ${colors.dim}(${testCount} ${testLabel})${colors.reset}${
    duration ? ` ${duration}` : ""
  }`;
}

export function collectTests(task) {
  if (!task) return [];
  if (task.type === "test") return [task];
  if (!Array.isArray(task.tasks)) return [];
  const tests = [];
  const stack = [...task.tasks];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    if (current.type === "test") {
      tests.push(current);
      continue;
    }
    if (Array.isArray(current.tasks)) {
      stack.push(...current.tasks);
    }
  }
  return tests;
}

export function formatStateCount(label, count, color) {
  if (!count) return null;
  return `${color}${count} ${label}${colors.reset}`;
}

export function formatSummaryLine(label, counts, total) {
  const segments = [
    formatStateCount("passed", counts.pass ?? 0, colors.green),
    formatStateCount("failed", counts.fail ?? 0, colors.red),
    formatStateCount("skipped", counts.skip ?? 0, colors.yellow),
    formatStateCount("todo", counts.todo ?? 0, colors.dim),
  ].filter(Boolean);
  return `${label}  ${segments.join(` ${colors.dim}|${colors.reset} `)} ${colors.dim}(${total})${colors.reset}`;
}

export function formatErrorMessage(error) {
  if (!error) return { messageLines: [], locationLine: "" };
  const messageLines = [];
  const stackLines = [];
  const stackSource = typeof error.stackStr === "string" && error.stackStr.trim()
    ? error.stackStr
    : typeof error.stack === "string" && error.stack.trim()
      ? error.stack
      : "";
  if (typeof error.message === "string" && error.message.trim()) {
    messageLines.push(error.message.trim());
  } else if (stackSource) {
    messageLines.push(stackSource.trim().split("\n")[0]);
  }
  if (typeof error.cause?.message === "string" && error.cause.message.trim()) {
    messageLines.push(`Cause: ${error.cause.message.trim()}`);
  }

  const locationLine = stackSource
    ? stackSource
        .split("\n")
        .map((line) => line.trim())
        .find((line) => line.startsWith("at "))
    : "";

  if (stackSource) {
    for (const line of stackSource.split("\n").map((line) => line.trim())) {
      if (!line || line === locationLine || line.startsWith("AssertionError:")) {
        continue;
      }
      if (line.startsWith("at ")) {
        stackLines.push(line);
      }
    }
  }

  return { messageLines, locationLine: locationLine ?? "", stackLines };
}

export function colorizeLocationLine(line, root = process.cwd()) {
  if (!line || !root) {
    return line;
  }

  const normalizedRoot = root.endsWith("/") ? root : `${root}/`;
  const locationIndex = line.indexOf(normalizedRoot);
  if (locationIndex === -1) {
    return line;
  }

  const prefix = line.slice(0, locationIndex);
  const rootSegment = line.slice(locationIndex, locationIndex + normalizedRoot.length);
  const relativeSegment = line.slice(locationIndex + normalizedRoot.length);
  return `${colors.dim}${prefix}${rootSegment}${colors.reset}\u001b[1m${colors.lightGray}${relativeSegment}${colors.reset}`;
}

export function isVerboseErrorsEnabled() {
  return process.env.LITSX_REPORTER_VERBOSE_ERRORS === "1"
    || process.env.LITSX_REPORTER_VERBOSE_ERRORS === "true";
}

export function getReporterMode() {
  return process.env.LITSX_REPORTER_MODE === "quiet" ? "quiet" : "default";
}

export function normalizeDiffContent(value) {
  return typeof value === "string" ? value.replace(/\s+/g, "") : "";
}

export function isTrivialDiff(source, transformed) {
  return normalizeDiffContent(source) === normalizeDiffContent(transformed);
}

export function renderTaskErrors(logger, task, options = {}) {
  const verboseErrors = options.verboseErrors ?? isVerboseErrorsEnabled();
  const errors = Array.isArray(task.result?.errors) ? task.result.errors : [];
  if (errors.length === 0) {
    return;
  }

  const renderedErrors = errors
    .map((error) => formatErrorMessage(error))
    .filter((entry) => entry.messageLines.length > 0 || entry.locationLine);

  if (renderedErrors.length === 0) {
    return;
  }

  logger.log(formatSectionLabel("diagnostic"));
  const lines = renderedErrors.flatMap(({ messageLines, locationLine, stackLines }) => {
    const output = messageLines.map(
      (line) => `      ${colors.red}${line}${colors.reset}`
    );
    if (locationLine) {
      output.push(
        `      ${colorizeLocationLine(locationLine, process.cwd())}`
      );
    }
    if (verboseErrors && Array.isArray(stackLines)) {
      output.push(
        ...stackLines.map((line) => `      ${colors.dim}${line}${colors.reset}`)
      );
    }
    return output;
  });

  logger.log(lines.join("\n"));
  logger.log("");
}

export function logRenderedDiff(logger, rendered) {
  if (!rendered) return null;
  const segments = [];
  if (rendered.header) segments.push(rendered.header);
  if (rendered.body) segments.push(rendered.body);
  if (segments.length > 0) {
    logger.log(formatSectionLabel("transform"));
    const indented = segments
      .join("\n")
      .split("\n")
      .map((line) => `      ${line}`)
      .join("\n");
    logger.log(`${indented}\n\n`);
  }
  return rendered.footer ?? null;
}

export default class TransformReporter {
  constructor(options = {}) {
    this.ctx = undefined;
    this.pendingDiffs = new Map();
    this.renderedTaskIds = new Map();
    this.lastSuiteKey = null;
    this.renderedDiffCount = 0;
    this.skippedTrivialDiffCount = 0;
    this.suitesWithDiffs = new Set();
    this.diffMode = options.view || process.env.LITSX_DIFF_VIEW || "inline";
    this.verboseErrors = options.verboseErrors ?? isVerboseErrorsEnabled();
    this.mode = options.mode ?? getReporterMode();
  }

  onInit(ctx) {
    this.ctx = ctx;
    this.pendingDiffs = new Map();
    this.renderedTaskIds = new Map();
    this.lastSuiteKey = null;
    this.renderedDiffCount = 0;
    this.skippedTrivialDiffCount = 0;
    this.suitesWithDiffs = new Set();
  }

  queueDiff(taskId, payload) {
    const bucketKey = taskId ?? "__global__";
    const bucket = this.pendingDiffs.get(bucketKey) ?? {
      renderedKeys: new Set(),
      entries: [],
    };
    const diffKey = JSON.stringify([payload.source, payload.transformed]);
    if (bucket.renderedKeys.has(diffKey)) {
      return;
    }

    bucket.renderedKeys.add(diffKey);
    bucket.entries.push(payload);
    this.pendingDiffs.set(bucketKey, bucket);
  }

  renderTaskDetails(task) {
    const logger = this.ctx?.logger;
    if (!logger || !task?.id) {
      return;
    }

    const resultState = task.result?.state ?? "unknown";
    const previousState = this.renderedTaskIds.get(task.id);
    if (previousState === resultState) {
      return;
    }

    const slowTestThreshold = this.ctx?.config?.slowTestThreshold ?? 300;

    const bucket = this.pendingDiffs.get(task.id);
    const hasDiffs = Boolean(bucket?.entries.length);
    const hasErrors = Array.isArray(task.result?.errors) && task.result.errors.length > 0;
    const shouldHidePassingDetails = this.mode === "quiet" && resultState === "pass" && !hasErrors;
    if (shouldHidePassingDetails) {
      if (hasDiffs) {
        this.pendingDiffs.delete(task.id);
      }
      this.renderedTaskIds.set(task.id, resultState);
      return;
    }
    if (!hasDiffs && !hasErrors) {
      return;
    }

    const { suiteTitle } = getSuiteAndCaseTitles(task);
    const suiteKey = getSuiteKey(task);
    if (suiteKey !== this.lastSuiteKey) {
      logger.log(`\n${suiteTitle}`);
      this.lastSuiteKey = suiteKey;
    }

    logger.log(formatTestCaseSummary(task, slowTestThreshold));
    if (hasErrors) {
      renderTaskErrors(logger, task, { verboseErrors: this.verboseErrors });
    }

    if (hasDiffs) {
      let renderedDiffsForTask = 0;
      for (const payload of bucket.entries) {
        if (isTrivialDiff(payload.source, payload.transformed)) {
          this.skippedTrivialDiffCount += 1;
          continue;
        }
        const rendered = formatTransformDiff(
          payload.label,
          payload.source,
          payload.transformed,
          this.diffMode,
        );
        logRenderedDiff(logger, rendered);
        this.renderedDiffCount += 1;
        renderedDiffsForTask += 1;
      }
      if (renderedDiffsForTask > 0) {
        this.suitesWithDiffs.add(suiteKey);
      }
      this.pendingDiffs.delete(task.id);
    }

    this.renderedTaskIds.set(task.id, resultState);
  }

  onUserConsoleLog(log) {
    if (!log || typeof log.content !== "string") return;

    const content = log.content.trim();
    if (!content.startsWith(LOG_TRANSFORM_MARKER)) return;

    try {
      const endIndex = content.indexOf(LOG_TRANSFORM_END_MARKER, LOG_TRANSFORM_MARKER.length);
      const encoded = content.slice(
        LOG_TRANSFORM_MARKER.length,
        endIndex === -1 ? undefined : endIndex
      );
      const payload = JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));
      const task = log.taskId ? this.ctx?.state.idMap.get(log.taskId) : null;
      const taskId = task?.type === "test" ? task.id : null;
      this.queueDiff(taskId, payload);
    } catch (error) {
      this.ctx?.logger?.error(
        `[vitest-transform-reporter] Failed to parse transform log: ${error.message}`
      );
    }
  }

  onTaskUpdate(packs) {
    if (!this.ctx) return;

    for (const pack of packs) {
      const id = pack[0];
      const task = this.ctx.state.idMap.get(id);
      if (!task) continue;

      const resultState = task.result?.state;
      if (!resultState || resultState === "run") continue;

      if (task.type === "test") {
        this.renderTaskDetails(task);
      }
    }
  }

  onTestRunEnd(testModules, unhandledErrors = [], reason) {
    const logger = this.ctx?.logger;
    if (!logger) return;

    const globalBucket = this.pendingDiffs.get("__global__");
    if (globalBucket?.entries.length) {
      logger.log("\n↳ Transform output");
      for (const payload of globalBucket.entries) {
        const rendered = formatTransformDiff(
          payload.label,
          payload.source,
          payload.transformed,
          this.diffMode,
        );
        logRenderedDiff(logger, rendered);
      }
      this.pendingDiffs.delete("__global__");
    }

    const files = [
      ...new Map(
        Array.from(this.ctx.state.filesMap.values())
          .flat()
          .map((file) => [file.id, file])
      ).values(),
    ];

    if (files.length > 0) {
      const slowTestThreshold = this.ctx?.config?.slowTestThreshold ?? 300;
      logger.log("");
      for (const file of files) {
        logger.log(formatFileSummary(file, this.ctx?.config?.root, slowTestThreshold));
      }

      logger.log("");
      const totalFiles = files.length;
      const passedFiles = files.filter((file) => file.result?.state === "pass").length;
      const failedFiles = files.filter((file) => file.result?.state === "fail").length;
      const skippedFiles = files.filter((file) => file.result?.state === "skip").length;
      const totalTests = files.reduce((sum, file) => sum + countTests(file), 0);
      const tests = files.flatMap((file) => collectTests(file));
      const testCounts = tests.reduce((counts, test) => {
        const state = test.result?.state ?? "unknown";
        counts[state] = (counts[state] ?? 0) + 1;
        return counts;
      }, {});

      logger.log(
        formatSummaryLine(
          "Test Files",
          { pass: passedFiles, fail: failedFiles, skip: skippedFiles },
          totalFiles
        )
      );
      logger.log(formatSummaryLine("Tests", testCounts, totalTests));
      const executionTime = files.reduce(
        (sum, file) => sum + (typeof file.result?.duration === "number" ? file.result.duration : 0),
        0
      );
      if (executionTime > 0) {
        logger.log(`Duration  ${colorizeDuration(executionTime, slowTestThreshold)}`);
      }
      if (this.renderedDiffCount > 0) {
        logger.log(
          `Transforms  ${colors.lightGray}${this.renderedDiffCount} rendered${colors.reset}`
        );
      }
      if (this.skippedTrivialDiffCount > 0) {
        logger.log(
          `Filtered  ${colors.lightGray}${this.skippedTrivialDiffCount} trivial diffs${colors.reset}`
        );
      }
      if (this.suitesWithDiffs.size > 0) {
        logger.log(
          `Suites  ${colors.lightGray}${this.suitesWithDiffs.size} with diffs${colors.reset}`
        );
      }
      const slowestFile = files.reduce((slowest, file) => {
        const duration = typeof file.result?.duration === "number" ? file.result.duration : -1;
        if (duration < 0) return slowest;
        if (!slowest || duration > slowest.duration) {
          return { file, duration };
        }
        return slowest;
      }, null);
      if (slowestFile) {
        logger.log(
          `Slowest  ${getRelativePath(slowestFile.file.filepath, this.ctx?.config?.root)} ${colorizeDuration(slowestFile.duration, slowTestThreshold)}`
        );
      }
      if (Array.isArray(unhandledErrors) && unhandledErrors.length > 0) {
        logger.log(
          `Errors  ${colors.red}${unhandledErrors.length}${colors.reset}`
        );
      }
    }

    this.lastSuiteKey = null;
  }
}
