export function runCleanup(record, host) {
  if (typeof record?.cleanup !== "function") {
    return;
  }

  try {
    record.cleanup.call(host);
  } finally {
    record.cleanup = undefined;
  }
}
