import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isInAppBrowser } from "./oauth-browser";

describe("Google OAuth browser compatibility", () => {
  it("recognizes common embedded mobile browsers", () => {
    assert.equal(
      isInAppBrowser(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Instagram",
      ),
      true,
    );
    assert.equal(
      isInAppBrowser(
        "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0.0.0 Mobile Safari/537.36; wv)",
      ),
      true,
    );
  });

  it("keeps normal mobile and desktop browsers on the standard OAuth redirect", () => {
    assert.equal(
      isInAppBrowser(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1",
      ),
      false,
    );
    assert.equal(
      isInAppBrowser(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
      ),
      false,
    );
  });
});
