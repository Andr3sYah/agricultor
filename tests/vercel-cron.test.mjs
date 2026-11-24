import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

const config = JSON.parse(
  await readFile(new URL("../vercel.json", import.meta.url), "utf8"),
);

describe("Vercel Hobby cron compatibility", () => {
  it("uses only once-daily cron schedules", () => {
    assert.ok(Array.isArray(config.crons));
    for (const cron of config.crons) {
      const fields = cron.schedule.split(/\s+/);
      assert.equal(fields.length, 5);
      assert.match(fields[0], /^(?:[0-5]?\d)$/);
      assert.match(fields[1], /^(?:[01]?\d|2[0-3])$/);
      assert.deepEqual(fields.slice(2), ["*", "*", "*"]);
    }
  });
});
