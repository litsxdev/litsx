import { describe, expect, it } from "vitest";

import { LOG_TRANSFORM_END_MARKER, LOG_TRANSFORM_MARKER, formatTransformDiff } from "./helpers/reporter/log-transform.js";
import TransformReporter, {
  colorizeDuration,
  colorizeLocationLine,
  countTests,
  formatErrorMessage,
  formatFileSummary,
  formatStatus,
  formatSummaryLine,
  getReporterMode,
  getStatusIcon,
  isTrivialDiff,
  isVerboseErrorsEnabled,
  normalizeDiffContent,
  renderTaskErrors,
} from "./helpers/reporter/vitest-transform-reporter.js";

function createLogger() {
  const logs = [];
  return {
    logs,
    log(message) {
      logs.push(message);
    },
    error(message) {
      logs.push(`ERROR: ${message}`);
    },
  };
}

function createTestTask(overrides = {}) {
  const file = overrides.file ?? {
    id: "file-1",
    type: "suite",
    filepath: "/Users/rafabernad/Workspace/litsx/test/example.test.js",
    tasks: [],
    result: { state: "pass", duration: 9 },
  };
  const suite =
    overrides.suite ?? {
      name: "example suite",
      suite: undefined,
    };

  return {
    id: overrides.id ?? "test-1",
    type: "test",
    name: overrides.name ?? "renders a diff",
    suite,
    file,
    result: overrides.result ?? { state: "pass", duration: 12 },
    ...overrides,
  };
}

describe("vitest transform reporter helpers", () => {
  it("colors durations using Vitest slowTestThreshold semantics", () => {
    expect(colorizeDuration(25, 300)).toContain("[32;1m25ms");
    expect(colorizeDuration(301, 300)).toContain("[33;1m301ms");
  });

  it("formats file summaries with relative paths and durations", () => {
    const summary = formatFileSummary(
      {
        type: "suite",
        filepath: "/Users/rafabernad/Workspace/litsx/test/example.test.js",
        tasks: [{ type: "test" }, { type: "test" }],
        result: { state: "pass", duration: 12 },
      },
      "/Users/rafabernad/Workspace/litsx",
      300
    );

    expect(summary).toContain("test/example.test.js");
    expect(summary).toContain("(2 tests)");
    expect(summary).toContain("[32;1m12ms");
  });

  it("counts nested tests recursively", () => {
    expect(
      countTests({
        type: "suite",
        tasks: [
          { type: "test" },
          {
            type: "suite",
            tasks: [{ type: "test" }, { type: "test" }],
          },
        ],
      })
    ).toBe(3);
  });

  it("formats summary lines with multiple states", () => {
    const line = formatSummaryLine("Tests", {
      pass: 10,
      fail: 2,
      skip: 1,
      todo: 3,
    }, 16);

    expect(line).toContain("10 passed");
    expect(line).toContain("2 failed");
    expect(line).toContain("1 skipped");
    expect(line).toContain("3 todo");
    expect(line).toContain("(16)");
  });

  it("formats todo states explicitly", () => {
    expect(formatStatus("todo")).toContain("[38;5;236mtodo");
    expect(getStatusIcon("todo")).toContain("◌");
  });

  it("extracts message and location from stack based errors", () => {
    const error = formatErrorMessage({
      message: "expected values to match",
      stack: [
        "AssertionError: expected values to match",
        "    at /Users/rafabernad/Workspace/litsx/test/example.test.js:5:22",
      ].join("\n"),
    });

    expect(error.messageLines).toEqual(["expected values to match"]);
    expect(error.locationLine).toBe(
      "at /Users/rafabernad/Workspace/litsx/test/example.test.js:5:22"
    );
    expect(error.stackLines).toEqual([]);
  });

  it("styles absolute and relative path segments differently", () => {
    const line = colorizeLocationLine(
      "at /Users/rafabernad/Workspace/litsx/test/example.test.js:5:22",
      "/Users/rafabernad/Workspace/litsx"
    );

    expect(line).toContain("\u001b[38;5;236mat /Users/rafabernad/Workspace/litsx/");
    expect(line).toContain("\u001b[1m\u001b[38;5;247mtest/example.test.js:5:22");
  });

  it("renders task errors with message and clickable location", () => {
    const logger = createLogger();
    renderTaskErrors(logger, {
      result: {
        errors: [
          {
            message: "expected values to match",
            stack: [
              "AssertionError: expected values to match",
              "    at /Users/rafabernad/Workspace/litsx/test/example.test.js:5:22",
            ].join("\n"),
          },
        ],
      },
    });

    expect(logger.logs[0]).toContain("[diagnostic]");
    expect(logger.logs[1]).toContain("expected values to match");
    expect(logger.logs[1]).toContain("test/example.test.js:5:22");
    expect(logger.logs[2]).toBe("");
  });

  it("renders extra stack lines when verbose errors are enabled", () => {
    const logger = createLogger();
    renderTaskErrors(logger, {
      result: {
        errors: [
          {
            message: "expected values to match",
            stack: [
              "AssertionError: expected values to match",
              "    at /Users/rafabernad/Workspace/litsx/test/example.test.js:5:22",
              "    at someInternalFrame (/virtual/internal.js:1:1)",
            ].join("\n"),
          },
        ],
      },
    }, {
      verboseErrors: true,
    });

    expect(logger.logs[1]).toContain("someInternalFrame");
  });

  it("detects verbose error mode from env", () => {
    const previous = process.env.LITSX_REPORTER_VERBOSE_ERRORS;
    process.env.LITSX_REPORTER_VERBOSE_ERRORS = "1";
    expect(isVerboseErrorsEnabled()).toBe(true);
    process.env.LITSX_REPORTER_VERBOSE_ERRORS = previous;
  });

  it("detects quiet mode from env", () => {
    const previous = process.env.LITSX_REPORTER_MODE;
    process.env.LITSX_REPORTER_MODE = "quiet";
    expect(getReporterMode()).toBe("quiet");
    process.env.LITSX_REPORTER_MODE = previous;
  });

  it("normalizes trivial diffs ignoring whitespace-only changes", () => {
    expect(normalizeDiffContent("const x = 1;\n")).toBe("constx=1;");
    expect(isTrivialDiff("const x = 1;\n", "const   x = 1;")).toBe(true);
    expect(isTrivialDiff("const x = 1;\n", "const x = 2;")).toBe(false);
  });
});

describe("TransformReporter", () => {
  it("formats side-by-side diffs with a divider row", () => {
    const rendered = formatTransformDiff(
      "example",
      "const x = 1;\n",
      "const x = 2;\n",
      "side-by-side"
    );

    expect(rendered.header).toContain("source");
    expect(rendered.header).toContain("output");
    expect(rendered.header).toContain("┼");
  });

  it("renders a diff block for a completed test", () => {
    const logger = createLogger();
    const fileTask = {
      id: "file-1",
      type: "suite",
      filepath: "/Users/rafabernad/Workspace/litsx/test/example.test.js",
      tasks: [],
      result: { state: "pass", duration: 12 },
    };
    const task = createTestTask({ file: fileTask });
    fileTask.tasks.push(task);

    const reporter = new TransformReporter();
    reporter.onInit({
      logger,
      config: {
        root: "/Users/rafabernad/Workspace/litsx",
        slowTestThreshold: 300,
      },
      state: {
        idMap: new Map([
          [task.id, task],
          [fileTask.id, fileTask],
        ]),
        filesMap: new Map([["default", [fileTask]]]),
      },
    });

    const payload = Buffer.from(
      JSON.stringify({
        label: task.name,
        source: "const x = 1;\n",
        transformed: "const x = 2;\n",
      }),
      "utf8"
    ).toString("base64");

    reporter.onUserConsoleLog({
      content: `${LOG_TRANSFORM_MARKER}${payload}${LOG_TRANSFORM_END_MARKER}`,
      taskId: task.id,
    });

    reporter.onTaskUpdate([[task.id, task.result, {}]]);

    expect(logger.logs[0]).toContain("example suite");
    expect(logger.logs[1]).toContain("renders a diff");
    expect(logger.logs[2]).toContain("[transform]");
    expect(logger.logs[3]).toContain("const x = 1;");
    expect(logger.logs[3]).toContain("const x = 2;");
  });

  it("renders failed tests without diffs using the error output", () => {
    const logger = createLogger();
    const fileTask = {
      id: "file-2",
      type: "suite",
      filepath: "/Users/rafabernad/Workspace/litsx/test/failure.test.js",
      tasks: [],
      result: { state: "fail", duration: 3 },
    };
    const task = createTestTask({
      id: "test-fail",
      file: fileTask,
      name: "shows a failure",
      result: {
        state: "fail",
        duration: 3,
        errors: [
          {
            message: "expected fail",
            stack: [
              "AssertionError: expected fail",
              "    at /Users/rafabernad/Workspace/litsx/test/failure.test.js:8:13",
            ].join("\n"),
          },
        ],
      },
    });
    fileTask.tasks.push(task);

    const reporter = new TransformReporter();
    reporter.onInit({
      logger,
      config: {
        root: "/Users/rafabernad/Workspace/litsx",
        slowTestThreshold: 300,
      },
      state: {
        idMap: new Map([[task.id, task]]),
        filesMap: new Map([["default", [fileTask]]]),
      },
    });

    reporter.onTaskUpdate([[task.id, task.result, {}]]);

    expect(logger.logs[0]).toContain("example suite");
    expect(logger.logs[1]).toContain("shows a failure");
    expect(logger.logs[2]).toContain("[diagnostic]");
    expect(logger.logs[3]).toContain("expected fail");
    expect(logger.logs[3]).toContain("test/failure.test.js:8:13");
  });

  it("renders suites with the same name from different files independently", () => {
    const logger = createLogger();
    const suite = { name: "shared suite", suite: undefined };
    const fileTaskA = {
      id: "file-a",
      type: "suite",
      filepath: "/Users/rafabernad/Workspace/litsx/test/a.test.js",
      tasks: [],
      result: { state: "pass", duration: 2 },
    };
    const fileTaskB = {
      id: "file-b",
      type: "suite",
      filepath: "/Users/rafabernad/Workspace/litsx/test/b.test.js",
      tasks: [],
      result: { state: "pass", duration: 2 },
    };
    const taskA = createTestTask({
      id: "task-a",
      file: fileTaskA,
      suite,
      result: {
        state: "fail",
        duration: 2,
        errors: [{ message: "fail a" }],
      },
    });
    const taskB = createTestTask({
      id: "task-b",
      file: fileTaskB,
      suite,
      result: {
        state: "fail",
        duration: 2,
        errors: [{ message: "fail b" }],
      },
    });
    fileTaskA.tasks.push(taskA);
    fileTaskB.tasks.push(taskB);

    const reporter = new TransformReporter();
    reporter.onInit({
      logger,
      config: {
        root: "/Users/rafabernad/Workspace/litsx",
        slowTestThreshold: 300,
      },
      state: {
        idMap: new Map([
          [taskA.id, taskA],
          [taskB.id, taskB],
        ]),
        filesMap: new Map([["default", [fileTaskA, fileTaskB]]]),
      },
    });

    reporter.onTaskUpdate([
      [taskA.id, taskA.result, {}],
      [taskB.id, taskB.result, {}],
    ]);

    expect(logger.logs.filter((line) => line.includes("shared suite"))).toHaveLength(2);
  });

  it("prints enriched summary metrics at the end of the run", () => {
    const logger = createLogger();
    const fileTask = {
      id: "file-summary",
      type: "suite",
      filepath: "/Users/rafabernad/Workspace/litsx/test/example.test.js",
      tasks: [],
      result: { state: "pass", duration: 15 },
    };
    const task = createTestTask({ file: fileTask });
    fileTask.tasks.push(task);

    const reporter = new TransformReporter();
    reporter.onInit({
      logger,
      config: {
        root: "/Users/rafabernad/Workspace/litsx",
        slowTestThreshold: 300,
      },
      state: {
        idMap: new Map([[task.id, task]]),
        filesMap: new Map([["default", [fileTask]]]),
      },
    });

    const payload = Buffer.from(
      JSON.stringify({
        label: task.name,
        source: "const x = 1;\n",
        transformed: "const x = 2;\n",
      }),
      "utf8"
    ).toString("base64");

    reporter.onUserConsoleLog({
      content: `${LOG_TRANSFORM_MARKER}${payload}${LOG_TRANSFORM_END_MARKER}`,
      taskId: task.id,
    });
    reporter.onTaskUpdate([[task.id, task.result, {}]]);
    reporter.onTestRunEnd();

    expect(logger.logs.some((line) => line.includes("Transforms"))).toBe(true);
    expect(logger.logs.some((line) => line.includes("Suites"))).toBe(true);
    expect(logger.logs.some((line) => line.includes("Slowest"))).toBe(true);
  });

  it("filters trivial diffs and reports them in the summary", () => {
    const logger = createLogger();
    const fileTask = {
      id: "file-trivial",
      type: "suite",
      filepath: "/Users/rafabernad/Workspace/litsx/test/trivial.test.js",
      tasks: [],
      result: { state: "pass", duration: 7 },
    };
    const task = createTestTask({ file: fileTask });
    fileTask.tasks.push(task);

    const reporter = new TransformReporter();
    reporter.onInit({
      logger,
      config: {
        root: "/Users/rafabernad/Workspace/litsx",
        slowTestThreshold: 300,
      },
      state: {
        idMap: new Map([[task.id, task]]),
        filesMap: new Map([["default", [fileTask]]]),
      },
    });

    const payload = Buffer.from(
      JSON.stringify({
        label: task.name,
        source: "const x = 1;\n",
        transformed: "const   x = 1;",
      }),
      "utf8"
    ).toString("base64");

    reporter.onUserConsoleLog({
      content: `${LOG_TRANSFORM_MARKER}${payload}${LOG_TRANSFORM_END_MARKER}`,
      taskId: task.id,
    });
    reporter.onTaskUpdate([[task.id, task.result, {}]]);
    reporter.onTestRunEnd();

    expect(logger.logs.some((line) => line.includes("[transform]"))).toBe(false);
    expect(logger.logs.some((line) => line.includes("Filtered"))).toBe(true);
  });

  it("suppresses passing transform details in quiet mode", () => {
    const logger = createLogger();
    const fileTask = {
      id: "file-quiet",
      type: "suite",
      filepath: "/Users/rafabernad/Workspace/litsx/test/quiet.test.js",
      tasks: [],
      result: { state: "pass", duration: 5 },
    };
    const task = createTestTask({ file: fileTask });
    fileTask.tasks.push(task);

    const reporter = new TransformReporter({ mode: "quiet" });
    reporter.onInit({
      logger,
      config: {
        root: "/Users/rafabernad/Workspace/litsx",
        slowTestThreshold: 300,
      },
      state: {
        idMap: new Map([[task.id, task]]),
        filesMap: new Map([["default", [fileTask]]]),
      },
    });

    const payload = Buffer.from(
      JSON.stringify({
        label: task.name,
        source: "const x = 1;\n",
        transformed: "const x = 2;\n",
      }),
      "utf8"
    ).toString("base64");

    reporter.onUserConsoleLog({
      content: `${LOG_TRANSFORM_MARKER}${payload}${LOG_TRANSFORM_END_MARKER}`,
      taskId: task.id,
    });
    reporter.onTaskUpdate([[task.id, task.result, {}]]);
    reporter.onTestRunEnd();

    expect(logger.logs.some((line) => line.includes("[transform]"))).toBe(false);
    expect(logger.logs.some((line) => line.includes("Transforms"))).toBe(false);
    expect(logger.logs.some((line) => line.includes("Test Files"))).toBe(true);
  });
});
