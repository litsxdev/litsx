export const Priority = {
  IMMEDIATE: 0,
  TRANSITION: 1,
  IDLE: 2,
};

export class PriorityScheduler {
  constructor(host) {
    this.host = host;
    this.queues = {
      [Priority.IMMEDIATE]: [],
      [Priority.TRANSITION]: [],
      [Priority.IDLE]: [],
    };
    this.flushScheduled = false;
  }

  enqueue(task) {
    const bucket = this.queues[task.priority ?? Priority.IDLE];
    bucket.push(task);
    if (!this.flushScheduled) {
      this.flushScheduled = true;
      queueMicrotask(() => this.flush());
    }
  }

  flush() {
    if (!this.flushScheduled) return;
    this.flushScheduled = false;

    for (const priority of [Priority.IMMEDIATE, Priority.TRANSITION, Priority.IDLE]) {
      const bucket = this.queues[priority];
      if (!bucket.length) continue;
      while (bucket.length) {
        const task = bucket.shift();
        try {
          task.flush();
        } catch (error) {
          this.host?.reportError?.(error);
          throw error;
        }
      }
    }
  }

  resetFrame() {
    // Called at the start of render; nothing frame-specific yet but keeps API symmetry.
  }

  clear() {
    for (const priority of Object.keys(this.queues)) {
      this.queues[priority].length = 0;
    }
    this.flushScheduled = false;
  }
}
